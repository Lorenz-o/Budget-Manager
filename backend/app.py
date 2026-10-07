"""
MyBudget - Server Flask
Serve sia le API REST che il frontend React (file statici).
Avvia con: python app.py
"""
import os
import sys
import json
import time
import glob
import hashlib
import subprocess
import webbrowser
import threading
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import database as db

# Inizializza Flask
app = Flask(__name__, static_folder='../dist', static_url_path='')
CORS(app, resources={r"/api/*": {"origins": [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]}})  # Solo frontend locale in sviluppo

# Cartelle: radice progetto e frontend buildato
ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
DIST_DIR = os.path.join(ROOT_DIR, 'dist')


# ============ BUILD AUTOMATICO FRONTEND ============

def _frontend_fingerprint():
    """Hash di sorgenti/config che influenzano la build (escluso node_modules)."""
    h = hashlib.sha256()
    patterns = [
        os.path.join(ROOT_DIR, 'src', '**'),
        os.path.join(ROOT_DIR, 'index.html'),
        os.path.join(ROOT_DIR, 'vite.config.js'),
        os.path.join(ROOT_DIR, 'package.json'),
        os.path.join(ROOT_DIR, 'tsconfig.json'),
    ]
    for pat in patterns:
        for f in sorted(glob.glob(pat, recursive=True)):
            if os.path.isdir(f) or 'node_modules' in f:
                continue
            try:
                with open(f, 'rb') as fh:
                    h.update(fh.read())
            except OSError:
                pass
    return h.hexdigest()


def _is_frozen():
    """True quando l'app e' pacchettizzata con PyInstaller (niente npm/build)."""
    return bool(getattr(sys, 'frozen', False))


def ensure_frontend_build():
    """Esegue 'npm run build' automaticamente se il bundle e' assente o obsoleto.

    Ritorna True se il frontend e' pronto per essere servito.
    Disattivabile con variabile d'ambiente SKIP_FRONTEND_BUILD=1.
    """
    stamp_file = os.path.join(DIST_DIR, '.build-stamp')
    index_ok = os.path.exists(os.path.join(DIST_DIR, 'index.html'))

    if _is_frozen():
        # Eseguibile standalone: il bundle viene estratto accanto all'exe
        # dallo script di avvio; niente npm da chiamare.
        return index_ok

    if os.environ.get('SKIP_FRONTEND_BUILD') == '1':
        return index_ok

    fingerprint = _frontend_fingerprint()
    if index_ok and os.path.exists(stamp_file):
        try:
            with open(stamp_file, 'r') as f:
                if f.read().strip() == fingerprint:
                    return True  # bundle gia' aggiornato
        except OSError:
            pass

    # Node/npm disponibile?
    npm = shutil_which('npm')
    if not npm:
        if index_ok:
            print("⚠️  npm non trovato: uso il bundle esistente in dist/ "
                  "(puo' essere obsoleto).")
            return True
        print("❌ Frontend non buildato e npm non trovato. "
              "Installa Node.js oppure esegui 'npm run build' manualmente.")
        return False

    print("🏗️  Build del frontend in corso (npm run build)...")
    start = time.time()
    try:
        result = subprocess.run(
            [npm, 'run', 'build'],
            cwd=ROOT_DIR,
            capture_output=True,
            text=True,
        )
    except OSError as e:
        print(f"⚠️  Impossibile eseguire npm: {e}")
        return index_ok

    if result.returncode == 0:
        os.makedirs(DIST_DIR, exist_ok=True)
        with open(stamp_file, 'w') as f:
            f.write(fingerprint)
        print(f"✅ Frontend buildato in {time.time() - start:.1f}s")
        return True

    print("❌ Build del frontend fallita:")
    print(result.stdout[-2000:] if result.stdout else '')
    print(result.stderr[-2000:] if result.stderr else '')
    return index_ok  # fallback: servi comunque il bundle vecchio


def shutil_which(cmd):
    import shutil
    return shutil.which(cmd)


# ============ FRONTEND (serve React) ============

@app.route('/')
def serve_index():
    """Serve il file index.html del frontend."""
    if os.path.exists(os.path.join(DIST_DIR, 'index.html')):
        return send_from_directory(DIST_DIR, 'index.html')
    return '''
    <html><body style="font-family:sans-serif;padding:40px;text-align:center;">
    <h1>⚠️ Frontend non trovato</h1>
    <p>Esegui prima <code>npm run build</code> nella cartella principale.</p>
    <p>Oppure avvia in modalità sviluppo con <code>npm run dev</code></p>
    </body></html>
    ''', 404


@app.route('/<path:path>')
def serve_static(path):
    """Serve i file statici del frontend."""
    # Le API non devono MAI cadere nel fallback SPA: una rotta /api/* non
    # esistente (es. frontend buildato nuovo + server Python vecchio, oppure
    # URL sbagliato) deve rispondere 404 in JSON. Se rispondessimo index.html,
    # il browser farebbe JSON.parse dell'HTML e mostrerebbe l'errore
    # "Unexpected token '<', \"<!doctype \"... is not valid JSON" invece di un
    # messaggio chiaro ("endpoint non trovato").
    if path.startswith('api/'):
        return jsonify({
            'error': ('Endpoint API non trovato: %s. Il backend e\' in esecuzione '
                      'ma non conosce questa rotta (versione vecchia? riavvia il '
                      'server con Avvia-MyBudget.bat o start.sh).' % ('/' + path)),
            'available': sorted(str(r) for r in app.url_map.iter_rules()
                                if str(r).startswith('/api')),
        }), 404
    file_path = os.path.join(DIST_DIR, path)
    if os.path.exists(file_path):
        return send_from_directory(DIST_DIR, path)
    # Fallback per SPA routing
    if os.path.exists(os.path.join(DIST_DIR, 'index.html')):
        return send_from_directory(DIST_DIR, 'index.html')
    return '''
    <html><body style="font-family:sans-serif;padding:40px;text-align:center;">
    <h1>⚠️ Frontend non trovato</h1>
    <p>Esegui prima <code>npm run build</code> nella cartella principale.</p>
    </body></html>
    ''', 404


# ============ ERROR HANDLER API ============

@app.errorhandler(404)
def handle_404(err):
    """Le rotte /api/* sconosciute rispondono in JSON, mai con l'HTML di
    Flask (che provocherebbe 'Unexpected token ... is not valid JSON')."""
    from werkzeug.exceptions import NotFound
    p = request.path or ''
    if isinstance(err, NotFound) and (p == '/api' or p.startswith('/api/')):
        return jsonify({'error': 'Endpoint API non trovato: %s' % p}), 404
    return err


@app.errorhandler(Exception)
def handle_api_error(err):
    """Qualsiasi eccezione non gestita su una rotta /api/* diventa un JSON
    500 leggibile dal frontend (cosi' l'utente vede il vero problema, non un
    HTML di errore che il browser non riesce a parsare come JSON)."""
    if request.path.startswith('/api'):
        app.logger.exception('Errore API su %s', request.path)
        return jsonify({'error': 'Errore interno del server: %s' % err}), 500
    raise err


# ============ API: CONFIG ============

@app.route('/api/config', methods=['GET'])
def api_get_config():
    # try interno: anche con DB bloccato/corrotto la risposta e' JSON con un
    # messaggio chiaro, mai il 500 HTML che il browser non sa parsare.
    try:
        return jsonify(db.get_config())
    except Exception as e:
        app.logger.exception('Errore GET /api/config')
        return jsonify({'error': 'Impossibile leggere la configurazione dal database: %s' % e}), 500


@app.route('/api/config', methods=['PUT'])
def api_save_config():
    data = request.json
    db.save_config(
        data['payday'],
        data['salary'],
        currency=data.get('currency', 'EUR'),
        language=data.get('language'),
        savings_base=data.get('savings_base', data.get('savingsBase')),
    )
    return jsonify({'success': True})


# ============ API: SALUTE FINANZIARIA ============

@app.route('/api/health-report', methods=['GET'])
def api_health_report():
    """Report dettagliato sulla salute finanziaria (punteggio 0-100,
    andamento mensile, insight automatici)."""
    try:
        months = int(request.args.get('months', 6))
    except (TypeError, ValueError):
        months = 6
    months = max(3, min(24, months))
    try:
        return jsonify(db.get_financial_health_report(months))
    except Exception as e:
        app.logger.exception('Errore GET /api/health-report')
        return jsonify({'error': 'Impossibile generare il report: %s' % e}), 500


# ============ API: TRIPS (VIAGGI) ============

@app.route('/api/trips', methods=['GET'])
def api_get_trips():
    return jsonify(db.get_trips())


@app.route('/api/trips', methods=['POST'])
def api_add_trip():
    try:
        result = db.add_trip(request.json or {})
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    return jsonify({'success': True, **result})


@app.route('/api/trips/<trip_id>', methods=['PUT'])
def api_update_trip(trip_id):
    data = dict(request.json or {})
    data['id'] = trip_id
    try:
        db.update_trip(data)
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    return jsonify({'success': True})


@app.route('/api/trips/<trip_id>', methods=['DELETE'])
def api_delete_trip(trip_id):
    db.delete_trip(trip_id)
    return jsonify({'success': True})


@app.route('/api/trip-costs', methods=['GET'])
def api_get_trip_costs():
    trip_id = request.args.get('trip_id')
    return jsonify(db.get_trip_costs(trip_id))


@app.route('/api/trip-costs', methods=['POST'])
def api_add_trip_cost():
    try:
        result = db.add_trip_cost(request.json or {})
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    return jsonify({'success': True, **result})


@app.route('/api/trip-costs/<cost_id>', methods=['PUT'])
def api_update_trip_cost(cost_id):
    data = dict(request.json or {})
    data['id'] = cost_id
    try:
        db.update_trip_cost(data)
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    return jsonify({'success': True})


@app.route('/api/trip-costs/<cost_id>', methods=['DELETE'])
def api_delete_trip_cost(cost_id):
    db.delete_trip_cost(cost_id)
    return jsonify({'success': True})


# ============ API: INCOMES ============

@app.route('/api/incomes', methods=['GET'])
def api_get_incomes():
    try:
        return jsonify(db.get_incomes())
    except Exception as e:
        app.logger.exception('Errore GET /api/incomes')
        return jsonify({'error': 'Impossibile leggere le entrate dal database: %s' % e}), 500


@app.route('/api/incomes', methods=['POST'])
def api_add_income():
    data = request.json
    try:
        db.add_income(data)
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    return jsonify({'success': True})


@app.route('/api/incomes/<income_id>', methods=['PUT'])
def api_update_income(income_id):
    data = request.json
    data['id'] = income_id
    try:
        db.update_income(data)
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    return jsonify({'success': True})


@app.route('/api/incomes/<income_id>', methods=['DELETE'])
def api_delete_income(income_id):
    db.delete_income(income_id)
    return jsonify({'success': True})


# ============ API: STIPENDIO PER MESE ============

@app.route('/api/salary/months', methods=['GET'])
def api_get_salary_months():
    months = int(request.args.get('months', 12))
    direction = request.args.get('direction', 'future')
    if direction not in ('future', 'past'):
        direction = 'future'
    try:
        return jsonify(db.get_salary_months(months, direction=direction))
    except Exception as e:
        app.logger.exception('Errore GET /api/salary/months')
        return jsonify({'error': 'Impossibile calcolare i mesi stipendio: %s' % e}), 500


@app.route('/api/salary/override', methods=['POST'])
def api_set_salary_override():
    data = request.json or {}
    month = data.get('month')
    if not month:
        return jsonify({'error': 'Mese non specificato (YYYY-MM)'}), 400
    try:
        result = db.set_salary_override(month, data.get('amount'))
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    return jsonify({'success': True, **result})


# ============ API: EXPENSES ============

@app.route('/api/expenses', methods=['GET'])
def api_get_expenses():
    try:
        return jsonify(db.get_expenses())
    except Exception as e:
        app.logger.exception('Errore GET /api/expenses')
        return jsonify({'error': 'Impossibile leggere le spese dal database: %s' % e}), 500


@app.route('/api/expenses', methods=['POST'])
def api_add_expense():
    data = request.json
    try:
        db.add_expense(data)
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    return jsonify({'success': True})


@app.route('/api/expenses/<expense_id>', methods=['PUT'])
def api_update_expense(expense_id):
    data = request.json
    data['id'] = expense_id
    try:
        db.update_expense(data)
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    return jsonify({'success': True})


@app.route('/api/expenses/<expense_id>', methods=['DELETE'])
def api_delete_expense(expense_id):
    db.delete_expense(expense_id)
    return jsonify({'success': True})


# ============ API: CATEGORIES ============

@app.route('/api/categories/expenses', methods=['GET'])
def api_get_expense_categories():
    return jsonify(db.get_expense_categories())


@app.route('/api/categories/expenses', methods=['POST'])
def api_add_expense_category():
    data = request.json
    db.add_expense_category(data)
    return jsonify({'success': True})


@app.route('/api/categories/incomes', methods=['GET'])
def api_get_income_categories():
    return jsonify(db.get_income_categories())


@app.route('/api/categories/incomes', methods=['POST'])
def api_add_income_category():
    data = request.json
    db.add_income_category(data)
    return jsonify({'success': True})


# ============ API: RECURRING PAYMENTS ============

@app.route('/api/recurring/future', methods=['GET'])
def api_get_recurring_future():
    """Restituisce i pagamenti ricorrenti futuri."""
    months = request.args.get('months', 12, type=int)
    try:
        return jsonify(db.get_recurring_payments_future(months))
    except Exception as e:
        app.logger.exception('Errore GET /api/recurring/future')
        return jsonify({'error': 'Impossibile calcolare i pagamenti futuri: %s' % e}), 500


# ============ API: STATS & BACKUP ============

@app.route('/api/stats', methods=['GET'])
def api_get_stats():
    return jsonify(db.get_db_stats())


@app.route('/api/month-stats', methods=['GET'])
def api_get_month_stats():
    """Statistiche aggregate del mese corrente per la Home: salute
    finanziaria precisa, percentuali corrette e totale risparmi."""
    try:
        return jsonify(db.get_stats())
    except Exception as e:
        app.logger.exception('Errore GET /api/month-stats')
        return jsonify({'error': str(e)}), 500


@app.route('/api/backup/export', methods=['GET'])
def api_export_backup():
    data = db.export_full_backup()
    return jsonify(data)


@app.route('/api/backup/import', methods=['POST'])
def api_import_backup():
    data = request.json
    db.import_full_backup(data)
    return jsonify({'success': True})


# ============ HEALTH CHECK ============

@app.route('/api/health', methods=['GET'])
def api_health():
    # Diagnostica: il frontend, in caso di errore, puo' interrogare questa
    # rotta per capire se il problema e' il database (es. "database is
    # locked", file corrotto) invece del server stesso. NB: lo smoke test
    # della build portatile fa Invoke-RestMethod qui: non deve MAI propagare
    # eccezioni (la versione con il DB bloccato deve comunque rispondere).
    try:
        conn = db.get_connection()
        n_exp = conn.execute('SELECT COUNT(*) c FROM expenses').fetchone()['c']
        n_inc = conn.execute('SELECT COUNT(*) c FROM incomes').fetchone()['c']
        conn.close()
        db_info = {'db': 'ok', 'dbPath': str(db.DB_PATH),
                   'expenses': n_exp, 'incomes': n_inc}
    except Exception as e:
        db_info = {'db': 'error', 'dbPath': str(db.DB_PATH), 'detail': str(e)}
    return jsonify({'status': 'ok', 'timestamp': time.time(), **db_info})


# ============ AVVIO ============

def open_browser(port):
    """Apre il browser automaticamente dopo un breve delay."""
    time.sleep(1.5)
    webbrowser.open(f'http://localhost:{port}')


if __name__ == '__main__':
    # Inizializza il database
    db.init_db()

    # Build automatico del frontend se necessario (disattivabile con SKIP_FRONTEND_BUILD=1)
    ensure_frontend_build()

    port = int(os.environ.get('PORT', 5000))

    print(f"""
╔══════════════════════════════════════════════════╗
║                                                  ║
║   💰 MyBudget - Gestione Budget Personale       ║
║                                                  ║
║   🌐 Server: http://localhost:{port:<5}              ║
║   🗄️  Database: SQLite (mybudget.db)             ║
║                                                  ║
║   Premi Ctrl+C per fermare il server             ║
║                                                  ║
╚══════════════════════════════════════════════════╝
    """)

    # Apri il browser automaticamente
    threading.Thread(target=open_browser, args=(port,), daemon=True).start()

    # Avvia il server
    host = os.environ.get('MYBUDGET_HOST') or '127.0.0.1'
    app.run(host=host, port=port, debug=False)
