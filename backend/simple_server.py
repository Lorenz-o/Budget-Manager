"""
Server Flask semplificato che serve il frontend React in modalità sviluppo.
Non richiede npm run build - usa i file sorgente direttamente.

Uso: python simple_server.py
"""
import os
import sys
import webbrowser
import threading
import time
from flask import Flask, send_from_directory, jsonify
from flask_cors import CORS

# Aggiungi il percorso corrente per importare database
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import database as db

app = Flask(__name__)
CORS(app)

# Cartella del frontend sorgente
FRONTEND_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src')
PUBLIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public')

# ============ API ENDPOINTS ============

@app.route('/api/config', methods=['GET'])
def get_config():
    return jsonify(db.get_config())

@app.route('/api/config', methods=['PUT'])
def save_config():
    from flask import request
    data = request.json
    db.save_config(data['payday'], data['salary'], data.get('currency', '€'),
                   savings_base=data.get('savings_base', data.get('savingsBase')))
    return jsonify({'success': True})

@app.route('/api/health-report', methods=['GET'])
def api_health_report():
    """Report sulla salute finanziaria (usato dalla sezione Report)."""
    from flask import request
    try:
        months = max(3, min(24, int(request.args.get('months', 6))))
    except (TypeError, ValueError):
        months = 6
    try:
        return jsonify(db.get_financial_health_report(months))
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/incomes', methods=['GET'])
def get_incomes():
    return jsonify(db.get_incomes())

@app.route('/api/incomes', methods=['POST'])
def add_income():
    from flask import request
    data = request.json
    db.add_income(data)
    return jsonify({'success': True})

@app.route('/api/incomes/<income_id>', methods=['PUT'])
def update_income(income_id):
    from flask import request
    data = request.json
    data['id'] = income_id
    db.update_income(data)
    return jsonify({'success': True})

@app.route('/api/incomes/<income_id>', methods=['DELETE'])
def delete_income(income_id):
    db.delete_income(income_id)
    return jsonify({'success': True})

@app.route('/api/expenses', methods=['GET'])
def get_expenses():
    return jsonify(db.get_expenses())

@app.route('/api/expenses', methods=['POST'])
def add_expense():
    from flask import request
    data = request.json
    db.add_expense(data)
    return jsonify({'success': True})

@app.route('/api/expenses/<expense_id>', methods=['PUT'])
def update_expense(expense_id):
    from flask import request
    data = request.json
    data['id'] = expense_id
    db.update_expense(data)
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
    from flask import request
    data = request.json
    db.add_expense_category(data)
    return jsonify({'success': True})

@app.route('/api/categories/incomes', methods=['GET'])
def get_income_categories():
    return jsonify(db.get_income_categories())

@app.route('/api/categories/incomes', methods=['POST'])
def add_income_category():
    from flask import request
    data = request.json
    db.add_income_category(data)
    return jsonify({'success': True})

@app.route('/api/stats', methods=['GET'])
def get_stats():
    return jsonify(db.get_db_stats())

@app.route('/api/backup/export', methods=['GET'])
def export_backup():
    return jsonify(db.export_full_backup())

@app.route('/api/backup/import', methods=['POST'])
def import_backup():
    from flask import request
    data = request.json
    db.import_full_backup(data)
    return jsonify({'success': True})

# ============ FRONTEND ============

@app.route('/')
def serve_index():
    """Serve index.html dalla cartella public."""
    return send_from_directory(PUBLIC_DIR, 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    """Serve file statici."""
    # Prova prima in public, poi in src
    if os.path.exists(os.path.join(PUBLIC_DIR, path)):
        return send_from_directory(PUBLIC_DIR, path)
    if os.path.exists(os.path.join(FRONTEND_DIR, path)):
        return send_from_directory(FRONTEND_DIR, path)
    return send_from_directory(PUBLIC_DIR, 'index.html')

def open_browser():
    time.sleep(2)
    webbrowser.open('http://localhost:5000')

if __name__ == '__main__':
    print("""
╔══════════════════════════════════════════════════╗
║                                                  ║
║   💰 MyBudget - Server Semplificato             ║
║                                                  ║
║   ⚠️  Questo server usa i file sorgente React    ║
║   Per la versione ottimizzata, installa Node.js  ║
║   ed esegui: npm run build                      ║
║                                                  ║
╚══════════════════════════════════════════════════╝
    """)
    
    db.init_db()
    
    print("🚀 Avvio server su http://localhost:5000")
    print("📁 Database: mybudget.db")
    print("\nPremi Ctrl+C per fermare il server\n")
    
    threading.Thread(target=open_browser, daemon=True).start()
    
    app.run(host='0.0.0.0', port=5000, debug=False)
