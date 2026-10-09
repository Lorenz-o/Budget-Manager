"""
MyBudget Server - Versione Standalone (NO Node.js richiesto)
Serve il frontend già compilato + API backend

Uso: python standalone_server.py
"""
import os
import sys


# ================= DIAGNOSTICA SILENZIOSA (primissima cosa) =================
# Se il processo viene ucciso dal sistema (ACCESS VIOLATION 0xC0000005, exit
# code -1073741819, tipico del runtime Python embedded bloccato
# dall'antivirus) o muore su un import che non c'e' nel pacchetto (es. sqlite3
# mancante), NON resta alcun traceback: la finestra sparisce e basta ("non da'
# nulla"). Scriviamo tutto in app\data\server-error.log PRIMA di qualunque
# altra istruzione, cosi' l'errore e' sempre leggibile a posteriori.
def _early_log(exc_type=None, exc=None, tb=None):
    try:
        import datetime as _dt
        d = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data')
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, 'server-error.log'), 'a', encoding='utf-8') as f:
            if exc_type is None:
                f.write("\n===== nuova esecuzione (%s) =====\n" % _dt.datetime.now().isoformat(timespec='seconds'))
                f.write("argv=%r cwd=%r\n" % (sys.argv, os.getcwd()))
            else:
                import traceback as _tb
                _tb.print_exception(exc_type, exc, tb, file=f)
    except Exception:
        pass


sys.excepthook = lambda t, v, tb: (_early_log(t, v, tb), print(''.join(
    __import__('traceback').format_exception(t, v, tb))))

import time
# NB: NON importare 'webbrowser' a top-level. Nel runtime Python embedded del
# pacchetto portatile l'import di webbrowser (che carica registry.launches e
# browserhelper.dll) puo' CRASHARE il processo con ACCESS VIOLATION
# (0xC0000005, exit code -1073741819) oppure BLOCCARLO durante gli import:
# era esattamente il punto in cui si fermava lo smoke test della build
# (-X importtime terminava la catena 'flask -> ... -> webbrowser'). Il
# browser lo apre il launcher bat, non il server; qui serve solo in modo
# opzionale via MYBUDGET_OPEN_BROWSER=1 (import pigro dentro open_browser()).
import threading

try:
    from flask import Flask, send_from_directory, jsonify, request
    from flask_cors import CORS
except Exception:
    _early_log(*sys.exc_info())
    raise

# Aggiungi il percorso corrente per importare database
if getattr(sys, 'frozen', False):
    # PyInstaller onedir: moduli Python estratti in _internal (o _MEIPASS)
    BASE_PATH = getattr(sys, '_MEIPASS', os.path.dirname(sys.executable))
    sys.path.insert(0, BASE_PATH)
    # Cartella dell'eseguibile: li' accanto deve stare dist/
    APP_ROOT = os.path.dirname(sys.executable)
else:
    APP_ROOT = os.path.dirname(os.path.abspath(__file__))
    sys.path.insert(0, APP_ROOT)
import database as db

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]}})

# Cartella del frontend compilato


def _find_dist():
    # Ordine di ricerca: prima la posizione del pacchetto portatile
    # (app\dist accanto ad app\backend), poi i casi legacy/dev.
    cand = [os.path.join(APP_ROOT, '..', 'dist'),
            os.path.join(APP_ROOT, 'dist')]
    if getattr(sys, 'frozen', False):
        cand.insert(0, os.path.join(BASE_PATH, 'dist'))
    for c in cand:
        if os.path.exists(os.path.join(c, 'index.html')):
            return c
    return cand[-1]


DIST_DIR = _find_dist()

# Versione del backend: il frontend, in caso di errore API, la confronta con
# quella dichiarata dal server (/api/health) e mostra un messaggio chiaro se
# il pacchetto portatile (app\backend) e' vecchio rispetto alla build JS.
BACKEND_VERSION = '2.2.1'


def _db_status():
    """Diagnostica DB per /api/health: l'utente capisce subito se il problema
    e' il database (es. 'database is locked', file corrotto) e non il resto."""
    try:
        conn = db.get_connection()
        n_exp = conn.execute('SELECT COUNT(*) c FROM expenses').fetchone()['c']
        n_inc = conn.execute('SELECT COUNT(*) c FROM incomes').fetchone()['c']
        conn.close()
        return {'db': 'ok', 'dbPath': str(db.DB_PATH),
                'expenses': n_exp, 'incomes': n_inc}
    except Exception as e:
        return {'db': 'error', 'dbPath': str(db.DB_PATH), 'detail': str(e)}

# Porta: 5000 di default, configurabile via variabile d'ambiente PORT.
# NB: validazione difensiva - una PORT non numerica (es. sporca da un launcher)
# non deve far esplodere int() con un traceback muto su console cp1252.
try:
    PORT = int(os.environ.get('PORT', '5000'))
except (TypeError, ValueError):
    PORT = 5000
if not (1 <= PORT <= 65535):
    PORT = 5000

# ============ API ENDPOINTS ============

@app.route('/api/health', methods=['GET'])
def api_health():
    # NB: lo smoke test della build portatile fa Invoke-RestMethod su questa
    # rotta: deve rispondere PRESTO e NON deve mai propagare eccezioni del DB.
    try:
        info = _db_status()
    except Exception as e:  # pragma: no cover - difensivo
        info = {'db': 'error', 'detail': str(e)}
    return jsonify({'status': 'ok', 'version': BACKEND_VERSION, **info})

@app.route('/api/config', methods=['GET'])
def get_config():
    # try interno: anche in caso di DB bloccato/corrotto la risposta e' JSON
    # (il frontend mostra un messaggio chiaro), mai un 500 HTML.
    try:
        return jsonify(db.get_config())
    except Exception as e:
        app.logger.exception('Errore GET /api/config')
        return jsonify({'error': 'Impossibile leggere la configurazione dal database: %s' % e}), 500

@app.route('/api/config', methods=['PUT'])
def save_config():
    data = request.json
    db.save_config(data['payday'], data['salary'],
                   currency=data.get('currency', 'EUR'),
                   language=data.get('language'),
                   savings_base=data.get('savings_base', data.get('savingsBase')))
    return jsonify({'success': True})

@app.route('/api/health-report', methods=['GET'])
def api_health_report():
    """Report sulla salute finanziaria (usato dalla sezione Report)."""
    try:
        months = max(3, min(24, int(request.args.get('months', 6))))
    except (TypeError, ValueError):
        months = 6
    try:
        return jsonify(db.get_financial_health_report(months))
    except Exception as e:
        app.logger.exception('Errore GET /api/health-report')
        return jsonify({'error': str(e)}), 500

@app.route('/api/trips', methods=['GET'])
def get_trips():
    return jsonify(db.get_trips())

@app.route('/api/trips', methods=['POST'])
def add_trip():
    try:
        result = db.add_trip(request.json or {})
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    return jsonify({'success': True, **result})

@app.route('/api/trips/<trip_id>', methods=['PUT'])
def update_trip(trip_id):
    data = dict(request.json or {})
    data['id'] = trip_id
    try:
        db.update_trip(data)
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    return jsonify({'success': True})

@app.route('/api/trips/<trip_id>', methods=['DELETE'])
def delete_trip(trip_id):
    db.delete_trip(trip_id)
    return jsonify({'success': True})

@app.route('/api/trip-costs', methods=['GET'])
def get_trip_costs():
    return jsonify(db.get_trip_costs(request.args.get('trip_id')))

@app.route('/api/trip-costs', methods=['POST'])
def add_trip_cost():
    try:
        result = db.add_trip_cost(request.json or {})
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    return jsonify({'success': True, **result})

@app.route('/api/trip-costs/<cost_id>', methods=['PUT'])
def update_trip_cost(cost_id):
    data = dict(request.json or {})
    data['id'] = cost_id
    try:
        db.update_trip_cost(data)
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    return jsonify({'success': True})

@app.route('/api/trip-costs/<cost_id>', methods=['DELETE'])
def delete_trip_cost(cost_id):
    db.delete_trip_cost(cost_id)
    return jsonify({'success': True})

@app.route('/api/incomes', methods=['GET'])
def get_incomes():
    try:
        return jsonify(db.get_incomes())
    except Exception as e:
        app.logger.exception('Errore GET /api/incomes')
        return jsonify({'error': 'Impossibile leggere le entrate dal database: %s' % e}), 500

@app.route('/api/incomes', methods=['POST'])
def add_income():
    data = request.json
    db.add_income(data)
    return jsonify({'success': True})

@app.route('/api/incomes/<income_id>', methods=['PUT'])
def update_income(income_id):
    data = request.json
    data['id'] = income_id
    db.update_income(data)
    return jsonify({'success': True})

@app.route('/api/incomes/<income_id>', methods=['DELETE'])
def delete_income(income_id):
    db.delete_income(income_id)
    return jsonify({'success': True})

@app.route('/api/salary/months', methods=['GET'])
def get_salary_months():
    months = int(request.args.get('months', 12))
    direction = request.args.get('direction', 'future')
    if direction not in ('future', 'past'):
        direction = 'future'
    try:
        return jsonify(db.get_salary_months(months, direction=direction))
    except Exception as e:
        app.logger.exception('Errore GET /api/salary/months')
        return jsonify({'error': 'Impossibile calcolare i mesi stipendio: %s' % e}), 500

@app.route('/api/recurring/future', methods=['GET'])
def get_recurring_future():
    """Pagamenti ricorrenti proiettati nell'orizzonte richiesto."""
    months = request.args.get('months', 12, type=int)
    try:
        return jsonify(db.get_recurring_payments_future(months))
    except Exception as e:
        app.logger.exception('Errore GET /api/recurring/future')
        return jsonify({'error': 'Impossibile calcolare i pagamenti futuri: %s' % e}), 500

@app.route('/api/salary/override', methods=['POST'])
def set_salary_override():
    data = request.json or {}
    month = data.get('month')
    if not month:
        return jsonify({'error': 'Mese non specificato (YYYY-MM)'}), 400
    try:
        result = db.set_salary_override(month, data.get('amount'))
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    return jsonify({'success': True, **result})

@app.route('/api/expenses', methods=['GET'])
def get_expenses():
    # NB: db.get_expenses() DEVE essere valutata DENTRO il try. Se scoppia
    # fuori (es. "database is locked", DB corrotto/migrato male) l'eccezione
    # viene intercettata solo dall'errorhandler generico, che pero' gira nel
    # contesto di richiesta del server VECCHIO in esecuzione: su pacchetti
    # portatile aggiornati a meta' (frontend nuovo + app\backend vecchio)
    # questo produceva il 500 su /api/config, /api/expenses, /api/incomes e
    # /api/salary/months visto nel browser. Qui rispondiamo sempre in JSON.
    try:
        return jsonify(db.get_expenses())
    except Exception as e:
        app.logger.exception('Errore GET /api/expenses')
        return jsonify({'error': 'Impossibile leggere le spese dal database: %s' % e}), 500

@app.route('/api/expenses', methods=['POST'])
def add_expense():
    data = request.json
    try:
        db.add_expense(data)
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    return jsonify({'success': True})

@app.route('/api/expenses/<expense_id>', methods=['PUT'])
def update_expense(expense_id):
    data = request.json
    data['id'] = expense_id
    try:
        db.update_expense(data)
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    return jsonify({'success': True})

@app.route('/api/expenses/<expense_id>', methods=['DELETE'])
def delete_expense(expense_id):
    db.delete_expense(expense_id)
    return jsonify({'success': True})

@app.route('/api/categories/expenses', methods=['GET'])
def get_expense_categories():
    return jsonify(db.get_expense_categories())

@app.route('/api/categories/expenses', methods=['POST'])
def add_expense_category():
    data = request.json
    db.add_expense_category(data)
    return jsonify({'success': True})

@app.route('/api/categories/incomes', methods=['GET'])
def get_income_categories():
    return jsonify(db.get_income_categories())

@app.route('/api/categories/incomes', methods=['POST'])
def add_income_category():
    data = request.json
    db.add_income_category(data)
    return jsonify({'success': True})
@app.route('/api/categories/expenses', methods=['DELETE'])
def delete_expense_category():
    name = request.args.get('name', '').strip()

    if not name:
        return jsonify({'error': 'Nome categoria mancante'}), 400

    try:
        db.delete_expense_category(name)
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        app.logger.exception('Errore durante eliminazione categoria spese')
        return jsonify({'error': str(e)}), 500

    return jsonify({'success': True})


@app.route('/api/categories/incomes', methods=['DELETE'])
def delete_income_category():
    name = request.args.get('name', '').strip()

    if not name:
        return jsonify({'error': 'Nome categoria mancante'}), 400

    try:
        db.delete_income_category(name)
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        app.logger.exception('Errore durante eliminazione categoria entrate')
        return jsonify({'error': str(e)}), 500

    return jsonify({'success': True})
@app.route('/api/stats', methods=['GET'])
def get_stats():
    return jsonify(db.get_db_stats())

@app.route('/api/backup/export', methods=['GET'])
def export_backup():
    return jsonify(db.export_full_backup())

@app.route('/api/backup/import', methods=['POST'])
def import_backup():
    data = request.json
    db.import_full_backup(data)
    return jsonify({'success': True})

# ============ FRONTEND ============

@app.route('/')
def serve_index():
    """Serve index.html dalla cartella dist."""
    return send_from_directory(DIST_DIR, 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    """Serve file statici dalla cartella dist."""
    # Le rotte /api/* sconosciute NON devono mai cadere nel fallback SPA:
    # se rispondessimo index.html, il frontend farebbe JSON.parse dell'HTML
    # ("Unexpected token '<', \"<!doctype \"... is not valid JSON") invece di
    # vedere un errore chiaro. Succede es. con un pacchetto 'app\\backend'
    # vecchio e un frontend nuovo che chiama rotte recenti (/trips,
    # /recurring/future, /salary/...).
    if path.startswith('api/'):
        return jsonify({
            'error': ('Endpoint API non trovato: /%s. Il server in esecuzione '
                      'non conosce questa rotta: probabilmente e\' vecchio '
                      'rispetto al frontend. Chiudilo con '
                      '"Avvia-MyBudget.bat stop" e riavvialo.' % path),
            'available': sorted(str(r) for r in app.url_map.iter_rules()
                                if str(r).startswith('/api')),
        }), 404
    file_path = os.path.join(DIST_DIR, path)
    if os.path.exists(file_path):
        return send_from_directory(DIST_DIR, path)
    # Fallback per SPA routing
    return send_from_directory(DIST_DIR, 'index.html')


@app.errorhandler(404)
def handle_404(err):
    """API sconosciute -> JSON, mai l'HTML d'errore di Flask."""
    from werkzeug.exceptions import NotFound
    p = request.path or ''
    if isinstance(err, NotFound) and (p == '/api' or p.startswith('/api/')):
        return jsonify({'error': 'Endpoint API non trovato: %s' % p}), 404
    return err


@app.errorhandler(Exception)
def handle_api_error(err):
    """Eccezioni sulle /api -> JSON 500 leggibile (e loggato) invece del
    pagina HTML che il browser non riesce a parsare come JSON."""
    if request.path.startswith('/api'):
        app.logger.exception('Errore API su %s', request.path)
        try:
            _early_log(type(err), err, None)
        except Exception:
            pass
        return jsonify({'error': 'Errore interno del server: %s' % err}), 500
    raise err

def open_browser():
    # NON importare/aprire il browser all'avvio del server. Motivo (bug reale
    # osservato sulla build portatile): nel runtime Python EMBEDDED la catena
    # webbrowser -> registry.launches/browserhelper.dll puo' terminare
    # l'intero processo con ACCESS VIOLATION (exit code -1073741819 =
    # 0xC0000005) o bloccarlo durante gli import (-X importtime mostrava il
    # freeze proprio li'). Il server deve solo mettersi in ascolto: il
    # browser lo apre il launcher (Avvia-MyBudget.bat) DOPO l'health-check.
    # Teniamo la funzione per compatibilita': fa nulla, salvo richiesta
    # esplicita via MYBUDGET_OPEN_BROWSER=1.
    if not os.environ.get('MYBUDGET_OPEN_BROWSER'):
        return
    time.sleep(2)
    try:
        import webbrowser as _wb
        _wb.open(f'http://localhost:{PORT}')
    except Exception:
        pass

if __name__ == '__main__':
    _early_log()  # marca l'avvio in data\server-error.log: se il processo viene
                  # UCCISO dall'esterno (antivirus -> ACCESS VIOLATION, exit
                  # code -1073741819) non c'e' nessun traceback da scrivere:
                  # l'assenza di errori dopo questa riga = causa esterna.
    print("=" * 50)
    print("  MyBudget - Server Standalone")
    print("  NON richiede Node.js (frontend gia compilato)")
    print("=" * 50)
    
    # Verifica che il frontend compilato esista (dist/index.html).
    # NB: verificare l'index.html e NON solo la cartella DIST_DIR: su un
    # percorso inesistente os.path.exists() da' False comunque, quindi il
    # vecchio messaggio era ingannevole.
    if not os.path.exists(os.path.join(DIST_DIR, 'index.html')):
        print("ERRORE: frontend (index.html dentro dist) non trovato!")
        print("   Cartella controllata: " + DIST_DIR)
        print("   Nel pacchetto portatile 'dist' deve stare in app\\dist,")
        print("   accanto ad app\\backend. In sviluppo: npm run build.")
        try:
            _early_log(RuntimeError("frontend non trovato: DIST_DIR=" + str(DIST_DIR)))
        except Exception:
            pass
        sys.exit(1)
    
    # Su Windows, stampare byte non-ASCII (emoji/box-drawing) puo' far
    # crashare la print con UnicodeEncodeError PRIMA ancora di avviare il
    # server -> finestra che sparisce senza spiegare nulla. Mettiamo un
    # fallback "replace" su stdout/stderr: se il reconfigure completo non e'
    # possibile (console cp1252/cp850), almeno non si muore stampando.
    for _sname in ("stdout", "stderr"):
        try:
            getattr(sys, _sname).reconfigure(errors="replace")
        except Exception:
            try:
                import io as _io
                setattr(sys, _sname, _io.TextIOWrapper(
                    getattr(sys, _sname).buffer,
                    encoding=getattr(getattr(sys, _sname), "encoding", None) or "ascii",
                    errors="replace", line_buffering=True))
            except Exception:
                pass

    try:
        db.init_db()
    except Exception:
        # Errore del database (es. sqlite3 mancante nel runtime embedded o
        # cartella data non scrivibile): stampiamo il traceback completo e
        # aspettiamo un tasto, invece di far sparire la finestra minima in
        # un istante senza spiegare nulla ("Avvia non dà nulla").
        print("ERRORE: inizializzazione database fallita!")
        print("   Database: " + str(db.DB_PATH))
        import traceback
        traceback.print_exc()
        # Salviamo il traceback in un file di log accanto ai dati: cosi',
        # anche se la finestra e' minimizzata/invisibile, l'errore si puo'
        # leggere dopo (data\server-error.log).
        try:
            with open(os.path.join(os.path.dirname(db.DB_PATH),
                                   "server-error.log"), "w", encoding="utf-8") as f:
                traceback.print_exc(file=f)
        except Exception:
            pass
        try:
            input("Premi Invio per chiudere...")
        except EOFError:
            pass
        sys.exit(1)
    
    print("Avvio server su http://localhost:%d" % PORT)
    print("Database: " + str(db.DB_PATH))
    print("Frontend: " + DIST_DIR)
    print("\nPremi Ctrl+C per fermare il server\n")
    
    threading.Thread(target=open_browser, daemon=True).start()
    
    # NB: threaded=True e' OBBLIGATORIO. Con il default (threaded=False) il
    # server serve UNA sola richiesta alla volta: se il browser ha una
    # connessione aperta/pending (es. la pagina principale che attende),
    # /api/health resta in coda per sempre -> lo smoke test della build va
    # in timeout e dichiara "il server non risponde" su un pacchetto sano.
    # threaded=True evita anche l'access violation (exit code -1073741819
    # = 0xC0000005) osservata sul runtime embedded con richieste concorrenti.
    # MYBUDGET_HOST puo' restringere il bind. Per sicurezza, il default resta locale.
    _host = os.environ.get('MYBUDGET_HOST') or '127.0.0.1'
    try:
        app.run(host=_host, port=PORT, debug=False, threaded=True)
    except OSError as _e:
        # Porta gia' occupata (es. un'altra istanza di MyBudget e' ancora
        # aperta): messaggio chiaro invece del traceback muto su console
        # cp1252 ("la finestra si apre e non da' nulla").
        print("ERRORE: impossibile avviare il server sulla porta %d: %s" % (PORT, _e))
        if 'address' in str(_e).lower() or getattr(_e, 'winerror', 0) == 10048:
            print("  La porta e' gia' in uso: chiudi l'altra finestra di MyBudget")
            print("  (oppure imposta PORT a un altro numero prima di avviare).")
        try:
            _early_log(type(_e), _e, None)
        except Exception:
            pass
        try:
            input("Premi Invio per chiudere...")
        except EOFError:
            pass
        sys.exit(1)
