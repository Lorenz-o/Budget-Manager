"""
Database SQLite per MyBudget
Gestisce tutte le operazioni sul database locale.

Versione: 2.2.0
Data: 2026-10-05
Fix/Feat:
 - Pagamenti ricorrenti: rispettato il mese di inizio (le rate che partono
   a novembre/dicembre non compaiono piu' ad ottobre) e orizzonte del menu
   a tendina esteso a 1 anno indietro + 1 anno avanti.
 - Stipendio per singolo mese: ora i mesi disponibili vanno da quello
   corrente in avanti (i mesi passati non vengono piu' conteggiati).
 - Config: aggiunta lingua (it/en) e valuta come codice ISO 4217.
 - Nuove tabelle "trips" e "trip_costs" per i viaggi con valuta propria.
"""
import sqlite3
import os
import sys
import json
from datetime import datetime
from typing import Optional

# Percorso del database (nella stessa cartella dello script)
_BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# Dati utente fuori dalla cartella del programma: cosi' l'app portatile puo'
# essere sovrascritta con una nuova versione senza perdere i dati.
# Override possibile con variabile d'ambiente MYBUDGET_DB (usata dal launcher).
if os.environ.get('MYBUDGET_DB'):
    DB_PATH = os.environ['MYBUDGET_DB']
elif getattr(sys, 'frozen', False):
    # Pacchettizzato con PyInstaller: dati accanto all'eseguibile, in data\
    _EXE_ROOT = os.path.dirname(sys.executable)
    DB_PATH = os.path.join(_EXE_ROOT, 'data', 'mybudget.db')
else:
    DB_PATH = os.path.join(_BASE_DIR, 'mybudget.db')
os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)


def _migrate_legacy_db():
    """Migra il database da posizioni vecchie verso DB_PATH. Copia senza
    cancellare l'originale (update-safe). Casi coperti:
      - build portatile con cartella 'app': vecchio app/backend/mybudget.db
        o app/mybudget.db -> ../data/mybudget.db
    """
    if os.path.exists(DB_PATH):
        return
    candidates = []
    if os.path.basename(_BASE_DIR).lower() == 'app':
        parent = os.path.dirname(_BASE_DIR)
        candidates.append(os.path.join(parent, 'data', 'mybudget.db'))
        candidates.append(os.path.join(_BASE_DIR, 'backend', 'mybudget.db'))
        candidates.append(os.path.join(_BASE_DIR, 'mybudget.db'))
    for old in candidates:
        if old != DB_PATH and os.path.exists(old):
            try:
                import shutil
                shutil.copy2(old, DB_PATH)
                print(f"📦 Database migrato da {old} a {DB_PATH}")
            except OSError:
                pass
            return


_migrate_legacy_db()


# ---- Valute supportate (codice ISO -> simbolo) ----
CURRENCY_SYMBOLS = {
    'EUR': '€', 'USD': '$', 'CAD': 'C$', 'AUD': 'A$', 'NZD': 'NZ$', 'GBP': '£',
    'CHF': 'CHF', 'SEK': 'kr', 'NOK': 'kr', 'DKK': 'kr', 'ISK': 'kr', 'PLN': 'zł',
    'CZK': 'Kč', 'HUF': 'Ft', 'RON': 'lei', 'BGN': 'лв', 'HRK': 'kn', 'RSD': 'din.',
    'UAH': '₴', 'RUB': '₽', 'TRY': '₺', 'ILS': '₪', 'AED': 'د.إ', 'SAR': '﷼',
    'QAR': '﷼', 'KWD': 'د.ك', 'EGP': 'E£', 'NGN': '₦', 'KES': 'KSh', 'ZAR': 'R',
    'MAD': 'DH', 'TND': 'DT', 'INR': '₹', 'PKR': '₨', 'BDT': '৳', 'LKR': 'Rs',
    'NPR': 'रू', 'CNY': '¥', 'JPY': '¥', 'KRW': '₩', 'KPW': '₩', 'HKD': 'HK$',
    'TWD': 'NT$', 'SGD': 'S$', 'MYR': 'RM', 'THB': '฿', 'IDR': 'Rp', 'PHP': '₱',
    'VND': '₫', 'MMK': 'K', 'KHR': '៛', 'LAK': '₭', 'MNT': '₮', 'BRL': 'R$',
    'ARS': '$', 'MXN': '$', 'COP': '$', 'CLP': '$', 'PEN': 'S/', 'UYU': '$U',
    'PYG': '₲', 'BOB': 'Bs', 'VES': 'Bs.', 'DOP': 'RD$', 'GTQ': 'Q', 'CRC': '₡',
    'PAB': 'B/.', 'JMD': 'J$', 'AWG': 'ƒ', 'BHD': '.د.ب', 'OMR': '﷼', 'JOD': 'د.ا',
    'LBP': 'ل.ل', 'IQD': 'ع.د', 'IRR': '﷼', 'AFN': '؋', 'MVR': 'Rf', 'BTN': 'Nu.',
    'MOP': 'MOP$', 'BND': 'B$', 'FJD': 'FJ$', 'TOP': 'T$', 'WST': 'WS$', 'XPF': '₣',
}

# Mappatura inversa (simbolo -> codice) usata per migrare i vecchi backup
SYMBOL_TO_CODE = {'€': 'EUR', '£': 'GBP', '$': 'USD', '¥': 'JPY', '₹': 'INR'}


def normalize_currency(raw) -> str:
    """Normalizza una valuta in un codice ISO 4217 maiuscolo.

    Accetta codici ('EUR'), simboli salvati nei vecchi DB ('€') e valori
    sconosciuti (fallback su EUR).
    """
    if not raw:
        return 'EUR'
    v = str(raw).strip()
    up = v.upper()
    if up in CURRENCY_SYMBOLS:
        return up
    for sym, code in SYMBOL_TO_CODE.items():
        if v == sym:
            return code
    # simbolo presente nella lista valute (es. 'C$' -> CAD)
    for code, sym in CURRENCY_SYMBOLS.items():
        if sym == v:
            return code
    return 'EUR'


def currency_symbol(code) -> str:
    return CURRENCY_SYMBOLS.get(normalize_currency(code), '€')



def get_connection():
    """Crea una connessione al database SQLite."""
    conn = sqlite3.connect(DB_PATH, timeout=15)  # attesa su DB bloccato: gli
    # handler Flask girano in thread diversi (il server e' threaded=True) e,
    # senza timeout, una scrittura concorrente fa esplodere subito
    # "database is locked" -> la API risponde 500 e il frontend non carica
    # piu' i dati.
    conn.row_factory = sqlite3.Row  # Permette accesso per nome colonna
    conn.execute("PRAGMA journal_mode=WAL")  # Write-Ahead Logging per performance
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    """Inizializza il database creando le tabelle se non esistono."""
    conn = get_connection()
    cursor = conn.cursor()

    # Tabella configurazione
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS config (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            payday INTEGER NOT NULL DEFAULT 27,
            salary REAL NOT NULL DEFAULT 0,
            currency TEXT NOT NULL DEFAULT 'EUR',
            language TEXT NOT NULL DEFAULT 'it'
        )
    ''')

    # Migrazione: aggiunge la colonna language ai database gia' esistenti
    cursor.execute("PRAGMA table_info(config)")
    cfg_cols = [r[1] for r in cursor.fetchall()]
    if 'language' not in cfg_cols:
        cursor.execute("ALTER TABLE config ADD COLUMN language TEXT NOT NULL DEFAULT 'it'")

    # Migrazione: Risparmi di base (cifra inserita a mano in Configurazione).
    # Il totale dei risparmi di un mese = risparmi di base + accantonamenti
    # (savings/PAC) del primo stipendio del mese. Default 0.
    if 'savings_base' not in cfg_cols:
        cursor.execute("ALTER TABLE config ADD COLUMN savings_base REAL NOT NULL DEFAULT 0")

    # Tabella categorie spese
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS expense_categories (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            color TEXT NOT NULL,
            icon TEXT NOT NULL
        )
    ''')

    # Tabella categorie entrate
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS income_categories (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            color TEXT NOT NULL,
            icon TEXT NOT NULL
        )
    ''')

    # Tabella entrate
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS incomes (
            id INTEGER PRIMARY KEY,
            description TEXT NOT NULL,
            amount REAL NOT NULL,
            date TEXT NOT NULL,
            category TEXT NOT NULL,
            recurring INTEGER NOT NULL DEFAULT 0,
            recurring_day INTEGER,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
    ''')

    # Tabella spese
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS expenses (
            id INTEGER PRIMARY KEY,
            description TEXT NOT NULL,
            amount REAL NOT NULL,
            date TEXT NOT NULL,
            category TEXT NOT NULL,
            type TEXT NOT NULL CHECK(type IN ('single', 'subscription', 'installment', 'savings', 'pac')),
            installments INTEGER,
            installments_paid INTEGER,
            end_date TEXT,
            notes TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
    ''')

    # Indici per query veloci
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_incomes_date ON incomes(date)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_incomes_category ON incomes(category)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_expenses_type ON expenses(type)')

    # Migrazione: tabella storico stipendio (varianti mensili).
    # Permette di variare lo stipendio di un singolo mese senza toccare
    # il valore base in config, che resta valido per tutti gli altri mesi.
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS salary_overrides (
            month TEXT PRIMARY KEY,
            amount REAL NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
    ''')
    

    # ---- VIAGGI -----------------------------------------------------
    # Ogni viaggio ha una propria valuta (budget e costi sono espressi
    # in quella valuta, indipendente da quella principale dell'app).
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS trips (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            destination TEXT,
            start_date TEXT,
            end_date TEXT,
            budget REAL NOT NULL DEFAULT 0,
            currency TEXT NOT NULL DEFAULT 'EUR',
            notes TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
    ''')

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS trip_costs (
            id INTEGER PRIMARY KEY,
            trip_id TEXT NOT NULL,
            description TEXT NOT NULL,
            amount REAL NOT NULL,
            date TEXT NOT NULL,
            category TEXT NOT NULL DEFAULT 'Altro',
            notes TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE
        )
    ''')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_trip_costs_trip ON trip_costs(trip_id)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_trip_costs_date ON trip_costs(date)')

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS recurrence_exclusions (
            expense_id TEXT NOT NULL,
            occurrence_date TEXT NOT NULL,
            created_at TEXT NOT NULL,
            PRIMARY KEY (expense_id, occurrence_date),
            FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE
        )
    ''')

    cursor.execute(
        'CREATE INDEX IF NOT EXISTS idx_recurrence_exclusions_date '
        'ON recurrence_exclusions(occurrence_date)'
    )
    

    conn.commit()

    # Normalizza le valute salvate nei vecchi DB (simboli -> codici ISO)
    row = cursor.execute('SELECT currency FROM config WHERE id = 1').fetchone()
    if row is None:
        cursor.execute(
            'INSERT INTO config (id, payday, salary, currency, language) VALUES (1, 27, 0, "EUR", "it")')
        conn.commit()
    else:
        fixed = normalize_currency(row[0])
        if fixed != (row[0] or ''):
            cursor.execute('UPDATE config SET currency = ? WHERE id = 1', (fixed,))
            conn.commit()

    # Inserisci categorie di default se la tabella è vuota
    cursor.execute('SELECT COUNT(*) FROM expense_categories')
    if cursor.fetchone()[0] == 0:
        default_expense_cats = [
            ('1', 'Alimentari', '#22c55e', '🛒'),
            ('2', 'Trasporti', '#3b82f6', '🚗'),
            ('3', 'Casa', '#f59e0b', '🏠'),
            ('4', 'Svago', '#8b5cf6', '🎮'),
            ('5', 'Salute', '#ef4444', '💊'),
            ('6', 'Abbigliamento', '#ec4899', '👕'),
            ('7', 'Bollette', '#06b6d4', '💡'),
            ('8', 'Ristoranti', '#f97316', '🍽️'),
            ('9', 'Istruzione', '#6366f1', '📚'),
            ('10', 'Abbonamenti', '#14b8a6', '📺'),
            ('11', 'Risparmio', '#84cc16', '🏦'),
            ('12', 'Altro', '#6b7280', '📦'),
        ]
        cursor.executemany(
            'INSERT INTO expense_categories (id, name, color, icon) VALUES (?, ?, ?, ?)',
            default_expense_cats
        )
        conn.commit()

    cursor.execute('SELECT COUNT(*) FROM income_categories')
    if cursor.fetchone()[0] == 0:
        default_income_cats = [
            ('1', 'Vendita Carte', '#22c55e', '🃏'),
            ('2', 'Vendita Figure', '#3b82f6', '🎴'),
            ('3', 'Freelance', '#f59e0b', '💻'),
            ('4', 'Regali', '#ec4899', '🎁'),
            ('5', 'Rimborso', '#06b6d4', '💸'),
            ('6', 'Altro', '#6b7280', '💰'),
        ]
        cursor.executemany(
            'INSERT INTO income_categories (id, name, color, icon) VALUES (?, ?, ?, ?)',
            default_income_cats
        )
        conn.commit()

    conn.close()
    print(f"✅ Database inizializzato: {DB_PATH}")


# ============ CONFIG ============

def get_config():
    conn = get_connection()
    row = conn.execute('SELECT * FROM config WHERE id = 1').fetchone()
    conn.close()
    cfg = dict(row) if row else {'id': 1, 'payday': 27, 'salary': 0,
                                 'currency': 'EUR', 'language': 'it', 'savings_base': 0}
    # Normalizzazione per DB creati con le versioni precedenti (simbolo '€')
    cfg['currency'] = normalize_currency(cfg.get('currency'))
    cfg.setdefault('language', 'it')
    if cfg.get('language') not in ('it', 'en'):
        cfg['language'] = 'it'
    # Risparmi di base (colonna aggiunta nelle versioni recenti)
    try:
        cfg['savings_base'] = float(cfg.get('savings_base') or 0)
    except (TypeError, ValueError):
        cfg['savings_base'] = 0.0
    return cfg


def save_config(payday: int, salary: float, currency: str = 'EUR', language: str = None,
                savings_base: float = None):
    currency = normalize_currency(currency)
    conn = get_connection()
    if savings_base is not None:
        try:
            savings_base = max(0.0, float(savings_base))
        except (TypeError, ValueError):
            savings_base = 0.0
    sets = ['payday = ?', 'salary = ?', 'currency = ?']
    vals = [payday, salary, currency]
    if language is not None:
        language = 'en' if str(language).lower().startswith('en') else 'it'
        sets.append('language = ?')
        vals.append(language)
    if savings_base is not None:
        sets.append('savings_base = ?')
        vals.append(savings_base)
    vals.append(1)
    conn.execute(f'UPDATE config SET {", ".join(sets)} WHERE id = ?', vals)
    conn.commit()
    conn.close()


# ============ INCOMES ============

def get_incomes():
    conn = get_connection()
    rows = conn.execute('SELECT * FROM incomes ORDER BY date DESC').fetchall()
    conn.close()
    return [dict(r) for r in rows]


def _month_range(month: str):
    """Restituisce (inizio, fine) come stringhe ISO per il mese 'YYYY-MM'."""
    y, m = int(month[:4]), int(month[5:7])
    start = datetime(y, m, 1)
    if m == 12:
        end_excl = datetime(y + 1, 1, 1)
    else:
        end_excl = datetime(y, m + 1, 1)
    return start.isoformat(), end_excl.isoformat()


def _check_income_date(date_str):
    """Blocca le entrate con data futura (mese corrente o precedenti ok)."""
    if not date_str:
        return
    try:
        d = datetime.fromisoformat(str(date_str)[:10])
    except ValueError:
        raise ValueError("Data entrata non valida")
    if d.date() > datetime.now().date():
        raise ValueError("Non puoi registrare un'entrata con data futura: "
                         "le entrate vanno suddivise per mese, dal mese "
                         "corrente all'indietro")


def add_income(data: dict):
    now = datetime.now().isoformat()

    _check_income_date(data.get('date'))

    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute('''
        INSERT INTO incomes (
            description,
            amount,
            date,
            category,
            recurring,
            recurring_day,
            created_at,
            updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        data['description'],
        data['amount'],
        data['date'],
        data['category'],
        data.get('recurring', False),
        data.get('recurring_day'),
        now,
        now
    ))

    new_id = cursor.lastrowid

    conn.commit()
    conn.close()

    return new_id


def update_income(data: dict):
    now = datetime.now().isoformat()
    _check_income_date(data.get('date'))
    conn = get_connection()
    conn.execute('''
        UPDATE incomes SET description=?, amount=?, date=?, category=?,
        recurring=?, recurring_day=?, updated_at=? WHERE id=?
    ''', (
        data['description'], data['amount'], data['date'], data['category'],
        data.get('recurring', False), data.get('recurring_day'), now, data['id']
    ))
    conn.commit()
    conn.close()


def delete_income(income_id: str):
    conn = get_connection()
    conn.execute('DELETE FROM incomes WHERE id = ?', (income_id,))
    conn.commit()
    conn.close()


# ============ STIPENDIO MENSILE (storico per mese) ============

def get_salary_months(months: int = 12, start_from_current: bool = True, direction: str = 'future'):
    """Costruisce la lista dei mesi per lo stipendio personalizzato.

    - `start_from_current=True`: il primo mese della lista e' quello corrente
      (default). Con False si parte dal mese precedente.
    - `direction='future'`: la lista scorre in avanti nel tempo (da questo
      mese in poi). E' il comportamento richiesto dall'app: i mesi passati
      non vengono piu' proposti perche' lo stipendio di quei mesi e' gia'
      storico e non va "conteggiato" nuovamente.
    - `direction='past'`: scorrimento all'indietro (retro-compatibilita').
    Ogni mese riporta lo stipendio effettivo: override mensile se presente,
    altrimenti stipendio base da config.
    """
    cfg = get_config()
    base_salary = cfg.get('salary', 0) or 0
    conn = get_connection()
    overrides = {r['month']: r['amount'] for r in
                 conn.execute('SELECT month, amount FROM salary_overrides').fetchall()}
    today = datetime.now()
    step = 1 if direction != 'past' else -1
    offset = 0 if start_from_current else -1 * (1 if step == 1 else -1)
    months_list = []
    for i in range(max(1, int(months))):
        idx = offset + i * step
        y, m = today.year, today.month + idx
        while m <= 0:
            m += 12
            y -= 1
        while m > 12:
            m -= 12
            y += 1
        month_key = f"{y:04d}-{m:02d}"
        manual = conn.execute(
            'SELECT id, amount FROM incomes WHERE id = ?', (f'salary_{month_key}',)
        ).fetchone()
        months_list.append({
            'month': month_key,
            'baseSalary': base_salary,
            'override': overrides.get(month_key),
            'effective': overrides.get(month_key, base_salary),
            'manualIncomeId': manual['id'] if manual else None,
            'manualAmount': manual['amount'] if manual else None,
        })
    conn.close()
    # Ritorno sempre in ordine cronologico crescente
    months_list.sort(key=lambda x: x['month'])
    return months_list


def set_salary_override(month: str, amount):
    """Imposta (o rimuove se amount is None) lo stipendio per un singolo mese,
    senza toccare lo stipendio base in config."""
    now = datetime.now().isoformat()
    conn = get_connection()
    if amount is None:
        conn.execute('DELETE FROM salary_overrides WHERE month = ?', (month,))
    else:
        conn.execute('''
            INSERT INTO salary_overrides (month, amount, created_at, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(month) DO UPDATE SET amount = excluded.amount, updated_at = excluded.updated_at
        ''', (month, float(amount), now, now))
        # Sincronizza lo stipendio registrato come entrata del mese,
        # così dashboard/report vedono lo stesso importo. Per il mese
        # corrente la data di scadenza può essere futura (es. il 27),
        # quindi qui non vale il blocco generale sulle entrate future.
        income_id = f'salary_{month}'
        existing = conn.execute('SELECT id FROM incomes WHERE id = ?', (income_id,)).fetchone()
        if existing:
            conn.execute(
                'UPDATE incomes SET amount = ?, updated_at = ? WHERE id = ?',
                (float(amount), now, income_id)
            )
        else:
            payday = get_config().get('payday', 27)
            y, m = int(month[:4]), int(month[5:7])
            import calendar as _cal
            day = min(payday, _cal.monthrange(y, m)[1])
            conn.execute('''
                INSERT INTO incomes (id, description, amount, date, category, recurring, recurring_day, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (income_id, 'Stipendio', float(amount), datetime(y, m, day).isoformat(),
                  'Stipendio', 1, payday, now, now))
    conn.commit()
    conn.close()
    return {'month': month, 'amount': amount}


# ============ EXPENSES ============

def _normalize_expense_keys(data: dict) -> dict:
    """
    Normalizza le chiavi di una spesa dal formato camelCase (usato dal
    frontend TypeScript, es. installmentsPaid / endDate) al formato
    snake_case delle colonne SQLite (installments_paid / end_date).
    Senza questa conversione i campi risultano NULL nel database.
    """
    normalized = dict(data)
    if 'installmentsPaid' in normalized and 'installments_paid' not in normalized:
        normalized['installments_paid'] = normalized['installmentsPaid']
    if 'endDate' in normalized and 'end_date' not in normalized:
        normalized['end_date'] = normalized['endDate']
    return normalized


def _add_months(d, n: int):
    """Somma n mesi a una data, riportando il giorno all'ultimo giorno utile."""
    import calendar as _cal
    y = d.year + (d.month - 1 + n) // 12
    m = (d.month - 1 + n) % 12 + 1
    last = _cal.monthrange(y, m)[1]
    return d.replace(year=y, month=m, day=min(d.day, last))


def _occurrence_dates(start_date, total_occurrences: int, end_date=None):
    """Genera le date delle occorrenze mensili di una spesa ricorrente.

    La prima occorrenza cade nel mese della data di partenza (giorno
    uguale, adattato ai mesi più corti). Se viene fornita una data di
    fine (end_date), vengono incluse anche le occorrenze fino a quel
    mese: così un abbonamento creato a settembre ma attivo fino a
    dicembre proietta correttamente tutte le rate di ottobre, novembre
    e dicembre. Altrimenti si usano le occorrenze previste (le rate
    totali per gli installmenti, le proiezioni standard altrimenti).
    """
    dates = []
    current = start_date
    limit = max(1, total_occurrences)
    for i in range(limit):
        dates.append(current)
        current = _add_months(current, 1)
    if end_date and end_date >= start_date:
        while current <= end_date:
            dates.append(current)
            current = _add_months(current, 1)
    return dates


def _compute_installments_paid(start_date, today, total_installments: int, stored_paid: int = None) -> int:
    """Restituisce quante rate risultano già saldate alla data 'today'.

    Regola base (calendario): la rata N-esima matura nel mese N a partire
    da quello della data di inizio; nell'esatto giorno di scadenza è
    ancora "in attesa", quindi conta come pagata solo dal giorno
    successivo.

    Se l'utente ha salvato un conteggio manuale ('stored_paid', il campo
    "Rate Pagate" del form), quel valore previene il calendario quando è
    più alto: così segnare una rata come pagata (o saldata anticipatamente)
    funziona subito, senza aspettare la scadenza naturale. Il risultato è
    sempre compreso tra 0 e il numero totale di rate.
    """
    months_diff = (today.year - start_date.year) * 12 + (today.month - start_date.month)
    if months_diff < 0:
        calculated = 0
    else:
        # FIX: la rata N-esima scade nel mese N; quando quel mese è già
        # trascorso va sempre contata come saldata, anche se oggi è il
        # 1° del mese nuovo (es. rata di settembre: a ottobre risulta
        # 1/12 fin dal primo giorno). In precedenza si usava il giorno
        # del mese CORRENTE contro il giorno di scadenza, quindi per
        # tutto il mese successivo alla scadenza la rata restava a 0/N.
        if months_diff >= 1:
            calculated = months_diff
        else:
            # Mese di inizio: la prima rata matura al suo giorno di scadenza
            ref_day = min(start_date.day, __import__('calendar').monthrange(today.year, today.month)[1])
            calculated = 1 if today.day > ref_day else 0
        calculated = min(calculated, total_installments)
    if stored_paid is not None:
        try:
            stored_paid = int(stored_paid)
        except (TypeError, ValueError):
            stored_paid = 0
        calculated = max(calculated, min(max(stored_paid, 0), total_installments))
    return max(0, calculated)


def get_expenses():
    conn = get_connection()
    rows = conn.execute('SELECT * FROM expenses ORDER BY date DESC').fetchall()
    expenses = [dict(r) for r in rows]

    # Calcola automaticamente le rate pagate per i pagamenti rateali.
    # Regola "vista per la prima volta = pagata": se tutte le occorrenze
    # della rata sono già nel passato (la rata non compare più nei
    # pagamenti futuri), il conteggio resta fermo a 1/N. Appena un mese
    # della rata rientra nell'orizzonte futuro, il valore si aggiorna
    # da solo col calendario (2/N, 3/N, ...). Il campo salvato
    # manualmente dall'utente ("Rate Pagate") ha sempre precedenza se
    # più alto del calendario.
    today = datetime.now().date()
    current_month_start = today.replace(day=1)
    for exp in expenses:
        if exp['type'] == 'installment' and exp.get('installments'):
            start_date = datetime.fromisoformat(exp['date']).date()
            total_inst = int(exp['installments'])
            last_due = _add_months(start_date, max(0, total_inst - 1))
            if last_due < current_month_start:
                calendar_paid = 1  # rata conclusa: mostrata fissa a 1/N
            else:
                calendar_paid = _compute_installments_paid(
                    start_date, today, total_inst, None
                )
            stored_paid = exp.get('installments_paid')
            try:
                stored_paid = int(stored_paid) if stored_paid is not None else 0
            except (TypeError, ValueError):
                stored_paid = 0
            exp['installments_paid'] = max(
                calendar_paid, min(max(stored_paid, 0), total_inst)
            )

    # Chiavi camelCase in aggiunta (il frontend legge installmentsPaid):
    # senza questi alias il badge "Rata X/Y" mostrava sempre 0/N.
    for exp in expenses:
        if 'installments_paid' in exp:
            exp['installmentsPaid'] = exp['installments_paid']
        if 'end_date' in exp:
            exp['endDate'] = exp['end_date']

    conn.close()
    return expenses

def delete_recurring_month(month: str, months_ahead: int = 24):
    """
    Esclude tutte le occorrenze ricorrenti visibili nel mese indicato.

    La ricorrenza originale rimane attiva per i mesi successivi.
    """

    try:
        datetime.strptime(month, "%Y-%m")
    except (TypeError, ValueError):
        raise ValueError("Mese non valido: usare YYYY-MM")

    payments = get_recurring_payments_future(max(1, int(months_ahead)))

    targets = [
        payment
        for payment in payments
        if str(payment.get("date", "")).startswith(month)
    ]

    if not targets:
        return {
            "month": month,
            "excluded": 0,
        }

    conn = get_connection()
    now = datetime.now().isoformat()

    for payment in targets:
        conn.execute(
            """
            INSERT OR IGNORE INTO recurrence_exclusions
                (expense_id, occurrence_date, created_at)
            VALUES (?, ?, ?)
            """,
            (
                payment["original_id"],
                payment["date"],
                now,
            )
        )

    conn.commit()
    conn.close()

    return {
        "month": month,
        "excluded": len(targets),
    }

def delete_all_movements():
    """
    Elimina tutti i movimenti finanziari:
    - entrate
    - spese
    - costi dei viaggi

    Mantiene:
    - configurazione
    - categorie
    - viaggi
    """

    conn = get_connection()

    conn.execute("DELETE FROM recurrence_exclusions")
    conn.execute("DELETE FROM trip_costs")
    conn.execute("DELETE FROM incomes")
    conn.execute("DELETE FROM expenses")

    conn.commit()
    conn.close()

def reset_all_data():
    """Reset completo dell'app ai valori iniziali."""

    conn = get_connection()

    conn.execute("DELETE FROM recurrence_exclusions")
    conn.execute("DELETE FROM trip_costs")
    conn.execute("DELETE FROM trips")
    conn.execute("DELETE FROM incomes")
    conn.execute("DELETE FROM expenses")
    conn.execute("DELETE FROM salary_overrides")
    conn.execute("DELETE FROM expense_categories")
    conn.execute("DELETE FROM income_categories")
    conn.execute("DELETE FROM config")

    conn.execute(
        """
        INSERT INTO config
            (id, payday, salary, currency, language, savings_base)
        VALUES
            (1, 27, 0, 'EUR', 'it', 0)
        """
    )

    default_expense_categories = [
        ("1", "Alimentari", "#22c55e", "🛒"),
        ("2", "Trasporti", "#3b82f6", "🚗"),
        ("3", "Casa", "#f59e0b", "🏠"),
        ("4", "Svago", "#8b5cf6", "🎮"),
        ("5", "Salute", "#ef4444", "💊"),
        ("6", "Abbigliamento", "#ec4899", "👕"),
        ("7", "Bollette", "#06b6d4", "💡"),
        ("8", "Ristoranti", "#f97316", "🍽️"),
        ("9", "Istruzione", "#6366f1", "📚"),
        ("10", "Abbonamenti", "#14b8a6", "📺"),
        ("11", "Risparmio", "#84cc16", "🏦"),
        ("12", "Altro", "#6b7280", "📦"),
    ]

    conn.executemany(
        """
        INSERT INTO expense_categories
            (id, name, color, icon)
        VALUES (?, ?, ?, ?)
        """,
        default_expense_categories,
    )

    default_income_categories = [
        ("1", "Vendita Carte", "#22c55e", "🃏"),
        ("2", "Vendita Figure", "#3b82f6", "🎴"),
        ("3", "Freelance", "#f59e0b", "💻"),
        ("4", "Regali", "#ec4899", "🎁"),
        ("5", "Rimborso", "#06b6d4", "💸"),
        ("6", "Altro", "#6b7280", "💰"),
    ]

    conn.executemany(
        """
        INSERT INTO income_categories
            (id, name, color, icon)
        VALUES (?, ?, ?, ?)
        """,
        default_income_categories,
    )

    conn.commit()
    conn.close()

def add_expense(data: dict):
    data = _normalize_expense_keys(data)
    now = datetime.now().isoformat()

    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute('''
        INSERT INTO expenses (
            description,
            amount,
            date,
            category,
            type,
            installments,
            installments_paid,
            end_date,
            notes,
            created_at,
            updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        data['description'],
        data['amount'],
        data['date'],
        data['category'],
        data['type'],
        data.get('installments'),
        data.get('installments_paid'),
        data.get('end_date'),
        data.get('notes'),
        now,
        now
    ))

    new_id = cursor.lastrowid

    conn.commit()
    conn.close()

    return new_id


def update_expense(data: dict):
    data = _normalize_expense_keys(data)
    now = datetime.now().isoformat()
    conn = get_connection()
    conn.execute('''
        UPDATE expenses SET description=?, amount=?, date=?, category=?, type=?,
        installments=?, installments_paid=?, end_date=?, notes=?, updated_at=?
        WHERE id=?
    ''', (
        data['description'], data['amount'], data['date'], data['category'],
        data['type'], data.get('installments'), data.get('installments_paid'),
        data.get('end_date'), data.get('notes'), now, data['id']
    ))
    conn.commit()
    conn.close()


def delete_expense(expense_id: str):
    conn = get_connection()
    conn.execute('DELETE FROM expenses WHERE id = ?', (expense_id,))
    conn.commit()
    conn.close()

def delete_recurring_occurrence(expense_id: str, occurrence_date: str):
    """Esclude una singola occorrenza futura senza eliminare la ricorrenza."""

    try:
        occurrence_date = (
            datetime.fromisoformat(str(occurrence_date)[:10])
            .date()
            .isoformat()
        )
    except (ValueError, TypeError):
        raise ValueError("Data occorrenza non valida")

    conn = get_connection()

    exists = conn.execute(
        """
        SELECT id
        FROM expenses
        WHERE id = ?
          AND type IN ('subscription', 'installment', 'savings', 'pac')
        """,
        (expense_id,)
    ).fetchone()

    if not exists:
        conn.close()
        raise ValueError("Spesa ricorrente non trovata")

    conn.execute(
        """
        INSERT OR IGNORE INTO recurrence_exclusions
            (expense_id, occurrence_date, created_at)
        VALUES (?, ?, ?)
        """,
        (
            expense_id,
            occurrence_date,
            datetime.now().isoformat(),
        )
    )

    conn.commit()
    conn.close()

# ============ TRIPS (VIAGGI) ============

def _trip_row_to_camel(row) -> dict:
    """Converte una riga trips in camelCase per il frontend."""
    return {
        'id': row['id'],
        'name': row['name'],
        'destination': row['destination'],
        'startDate': row['start_date'],
        'endDate': row['end_date'],
        'budget': row['budget'],
        'currency': normalize_currency(row['currency']),
        'notes': row['notes'],
        'createdAt': row['created_at'],
        'updatedAt': row['updated_at'],
    }


def _cost_row_to_camel(row) -> dict:
    return {
        'id': row['id'],
        'tripId': row['trip_id'],
        'description': row['description'],
        'amount': row['amount'],
        'date': row['date'],
        'category': row['category'],
        'notes': row['notes'],
        'createdAt': row['created_at'],
        'updatedAt': row['updated_at'],
    }


def _validate_trip(data: dict):
    if not (data.get('name') or '').strip():
        raise ValueError('Nome del viaggio obbligatorio')
    try:
        budget = float(data.get('budget') or 0)
    except (TypeError, ValueError):
        raise ValueError('Il budget deve essere un numero')
    if budget < 0:
        raise ValueError('Il budget non può essere negativo')
    start, end = data.get('startDate'), data.get('endDate')
    if start and end and end < start:
        raise ValueError('La data di fine deve essere successiva a quella di inizio')


def get_trips():
    conn = get_connection()
    rows = conn.execute('SELECT * FROM trips ORDER BY COALESCE(start_date, created_at) DESC').fetchall()
    trips = []
    for r in rows:
        trip = _trip_row_to_camel(r)
        agg = conn.execute(
            'SELECT COUNT(*) AS n, COALESCE(SUM(amount), 0) AS total FROM trip_costs WHERE trip_id = ?',
            (trip['id'],)
        ).fetchone()
        trip['costCount'] = agg['n']
        trip['spent'] = agg['total']
        trips.append(trip)
    conn.close()
    return trips


def add_trip(data: dict):
    _validate_trip(data)
    now = datetime.now().isoformat()
    tid = data.get('id') or f"trip_{datetime.now().strftime('%Y%m%d%H%M%S%f')}"
    conn = get_connection()
    conn.execute('''
        INSERT INTO trips (id, name, destination, start_date, end_date, budget,
                           currency, notes, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        tid, data['name'].strip(), data.get('destination'),
        data.get('startDate') or None, data.get('endDate') or None,
        float(data.get('budget') or 0), normalize_currency(data.get('currency')),
        data.get('notes'), now, now
    ))
    conn.commit()
    conn.close()
    return {'id': tid}


def update_trip(data: dict):
    _validate_trip(data)
    now = datetime.now().isoformat()
    conn = get_connection()
    cur = conn.execute('''
        UPDATE trips SET name=?, destination=?, start_date=?, end_date=?, budget=?,
                         currency=?, notes=?, updated_at=?
        WHERE id=?
    ''', (
        data['name'].strip(), data.get('destination'),
        data.get('startDate') or None, data.get('endDate') or None,
        float(data.get('budget') or 0), normalize_currency(data.get('currency')),
        data.get('notes'), now, data['id']
    ))
    conn.commit()
    deleted = cur.rowcount == 0
    conn.close()
    if deleted:
        raise ValueError('Viaggio non trovato')


def delete_trip(trip_id: str):
    conn = get_connection()
    # ON DELETE CASCADE rimuove anche i trip_costs, ma lo esplicitiamo
    # per sicurezza su DB creati prima dell'activatione delle FK.
    conn.execute('DELETE FROM trip_costs WHERE trip_id = ?', (trip_id,))
    conn.execute('DELETE FROM trips WHERE id = ?', (trip_id,))
    conn.commit()
    conn.close()


def get_trip_costs(trip_id: str = None):
    conn = get_connection()
    if trip_id:
        rows = conn.execute(
            'SELECT * FROM trip_costs WHERE trip_id = ? ORDER BY date DESC', (trip_id,)
        ).fetchall()
    else:
        rows = conn.execute('SELECT * FROM trip_costs ORDER BY date DESC').fetchall()
    conn.close()
    return [_cost_row_to_camel(r) for r in rows]


def add_trip_cost(data: dict):
    desc = (data.get('description') or '').strip()
    if not desc:
        raise ValueError('Descrizione obbligatoria')
    try:
        amount = float(data.get('amount'))
    except (TypeError, ValueError):
        raise ValueError('L\'importo deve essere un numero')
    if amount <= 0:
        raise ValueError('L\'importo deve essere maggiore di zero')
    trip_id = data.get('tripId')
    conn = get_connection()
    if not conn.execute('SELECT id FROM trips WHERE id = ?', (trip_id,)).fetchone():
        conn.close()
        raise ValueError('Viaggio non trovato')
    now = datetime.now().isoformat()
    cid = data.get('id') or f"tcost_{datetime.now().strftime('%Y%m%d%H%M%S%f')}"
    conn.execute('''
        INSERT INTO trip_costs (id, trip_id, description, amount, date, category,
                               notes, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        cid, trip_id, desc, amount, data.get('date') or now[:10],
        data.get('category') or 'Altro', data.get('notes'), now, now
    ))
    conn.commit()
    conn.close()
    return {'id': cid}


def update_trip_cost(data: dict):
    desc = (data.get('description') or '').strip()
    if not desc:
        raise ValueError('Descrizione obbligatoria')
    try:
        amount = float(data.get('amount'))
    except (TypeError, ValueError):
        raise ValueError('L\'importo deve essere un numero')
    now = datetime.now().isoformat()
    conn = get_connection()
    conn.execute('''
        UPDATE trip_costs SET description=?, amount=?, date=?, category=?, notes=?, updated_at=?
        WHERE id=?
    ''', (desc, amount, data.get('date'), data.get('category') or 'Altro',
          data.get('notes'), now, data['id']))
    conn.commit()
    conn.close()


def delete_trip_cost(cost_id: str):
    conn = get_connection()
    conn.execute('DELETE FROM trip_costs WHERE id = ?', (cost_id,))
    conn.commit()
    conn.close()


# ============ CATEGORIES ============

def get_expense_categories():
    conn = get_connection()
    rows = conn.execute('SELECT * FROM expense_categories ORDER BY name').fetchall()
    conn.close()
    return [dict(r) for r in rows]


def add_expense_category(data: dict):
    conn = get_connection()

    cursor = conn.execute(
        '''
        INSERT INTO expense_categories (name, color, icon)
        VALUES (?, ?, ?)
        ''',
        (
            data['name'],
            data['color'],
            data['icon'],
        )
    )

    conn.commit()
    new_id = cursor.lastrowid
    conn.close()

    return new_id

def add_income_category(data: dict):
    conn = get_connection()

    cursor = conn.execute(
        '''
        INSERT INTO income_categories (name, color, icon)
        VALUES (?, ?, ?)
        ''',
        (
            data['name'],
            data['color'],
            data['icon'],
        )
    )

    conn.commit()
    new_id = cursor.lastrowid
    conn.close()

    return new_id

def get_income_categories():
    conn = get_connection()
    rows = conn.execute('SELECT * FROM income_categories ORDER BY name').fetchall()
    conn.close()
    return [dict(r) for r in rows]



# ============ RECURRING PAYMENTS ============

def get_recurring_payments_future(months_ahead: int = 12):
    """
    Calcola i pagamenti ricorrenti nei mesi futuri e nel mese corrente.
    Restituisce una lista di pagamenti con date dal mese corrente in poi.
    
    FIX v2.1: Gestisce correttamente rate che iniziano in mesi futuri
    """
    conn = get_connection()

    excluded = {
        (row["expense_id"], row["occurrence_date"])
        for row in conn.execute(
            """
            SELECT expense_id, occurrence_date
            FROM recurrence_exclusions
            """
        ).fetchall()
    }

    recurring = conn.execute("""
        SELECT * FROM expenses
        WHERE type IN ('subscription', 'installment', 'savings', 'pac')
        ORDER BY date ASC
    """).fetchall()

    future_payments = []
    today = datetime.now().date()
    current_month_start = today.replace(day=1)

    for exp in recurring:
        exp_dict = dict(exp)
        start_date = datetime.fromisoformat(exp_dict['date']).date()

        end_date = None
        if exp_dict.get('end_date'):
            end_date = datetime.fromisoformat(exp_dict['end_date']).date()
        elif exp_dict['type'] == 'installment' and exp_dict.get('installments'):
            # Data fine = scadenza dell'ULTIMA rata (mese N a partire da
            # quello di inizio). In precedenza si avanzava di un mese per
            # ogni rata, generando una occorrenza extra (es. rata 13/12).
            months = int(exp_dict['installments'])
            end_date = _add_months(start_date, max(0, months - 1))
        
        # Se non c'è data fine, usa mesi_ahead
        if not end_date:
            end_date = today.replace(day=28)
            for _ in range(months_ahead):
                next_month = end_date.month + 1
                next_year = end_date.year
                if next_month > 12:
                    next_month = 1
                    next_year += 1
                try:
                    end_date = end_date.replace(year=next_year, month=next_month)
                except ValueError:
                    import calendar
                    last_day = calendar.monthrange(next_year, next_month)[1]
                    end_date = end_date.replace(year=next_year, month=next_month, day=min(end_date.day, last_day))
        

        # Numero di occorrenze da generare
        if exp_dict['type'] == 'installment' and exp_dict.get('installments'):
            total_occurrences = exp_dict['installments']
        elif end_date and end_date >= start_date:
            total_occurrences = (end_date.year - start_date.year) * 12 + \
                (end_date.month - start_date.month) + 1
        else:
            total_occurrences = months_ahead

        dates = _occurrence_dates(start_date, total_occurrences, end_date)

        # Limite dell'orizzonte richiesto (es. "3 mesi" nel pannello
        # Pagamenti Futuri): senza questo cappuccio le rate mostrano
        # sempre tutte le occorrenze fino al loro termine, ignorando
        # il selettore dei mesi.
        horizon_end = _add_months(current_month_start, max(0, months_ahead - 1))
        import calendar as _cal
        last_day = _cal.monthrange(horizon_end.year, horizon_end.month)[1]
        horizon_end = horizon_end.replace(day=last_day)

        # Regola "mostrata per la prima volta = pagata":
        # se la rata NON è più proiettabile nel futuro (tutte le sue
        # occorrenze cadono prima del mese corrente), viene mostrata
        # fissa a 1/N. Appena un mese della rata entra nell'orizzonte
        # futuro, lo stato si aggiorna automaticamente (2/N, 3/N, ...).
        # Il conteggio resta comunque legato al calendario: una rata
        # creata ieri che inizia questo mese resta legittimamente 1/N.
        #
        # FIX: rate/abbonamenti con data di INIZIO futura (es. parte a
        # novembre o dicembre) non devono mai risultare "già pagate":
        # il calendario produce 0 e l'eventuale campo salvato a mano
        # installments_paid va ignorato finché la prima occorrenza non
        # è arrivata. Altrimenti la rata sparisce dai pagamenti futuri
        # (l'utente non la vede finché non scatta il primo mese).
        calendar_paid = 0
        if exp_dict['type'] == 'installment' and exp_dict.get('installments'):
            total_inst = int(exp_dict['installments'])
            first_occurrence = dates[0] if dates else None
            last_occurrence = dates[-1] if dates else None
            starts_in_future = bool(
                first_occurrence and first_occurrence >= current_month_start
                and first_occurrence > today.replace(day=1)
            )
            if last_occurrence and last_occurrence < current_month_start:
                # Rata conclusa nel passato: 1/N fissa
                calendar_paid = 1
            elif starts_in_future:
                calendar_paid = 0
            else:
                calendar_paid = _compute_installments_paid(
                    start_date, today, total_inst, None
                )
            stored_paid = exp_dict.get('installments_paid')
            try:
                stored_paid = int(stored_paid) if stored_paid is not None else 0
            except (TypeError, ValueError):
                stored_paid = 0
            if starts_in_future:
                paid_so_far = 0
            else:
                paid_so_far = max(calendar_paid, min(max(stored_paid, 0), total_inst))

        for idx, d in enumerate(dates):
            occurrence_num = idx + 1
            if d < current_month_start:
                continue  # occorrenza di un mese passato
            if d > horizon_end:
                break  # oltre l'orizzonte richiesto (selettore mesi)
            if (exp_dict['id'], d.isoformat()) in excluded:
                continue
            is_paid = d <= today
            if exp_dict['type'] == 'installment':
                if occurrence_num <= paid_so_far:
                    continue  # rata già registrata come pagata
                is_paid = False  # le rate residue sono tutte "in attesa"

            # FIX doppio conteggio: se la spesa ricorrente è stata anche
            # registrata manualmente nel DB (riga con stesso description/
            # amount e data nello stesso mese dell'occorrenza), la
            # proiezione va saltata: il conto ne tiene già una.
            dupe = conn.execute(
                """SELECT COUNT(*) FROM expenses
                   WHERE id != ? AND description = ? AND amount = ?
                     AND substr(date, 1, 7) = ?""",
                (exp_dict['id'], exp_dict['description'],
                 exp_dict['amount'], d.isoformat()[:7])
            ).fetchone()[0]
            if dupe:
                continue

            future_payments.append({
                'id': f"{exp_dict['id']}_future_{occurrence_num}",
                'original_id': exp_dict['id'],
                'description': exp_dict['description'],
                'amount': exp_dict['amount'],
                'date': d.isoformat(),
                'category': exp_dict['category'],
                'type': exp_dict['type'],
                'is_future': True,
                'is_paid': is_paid,
                'occurrence': occurrence_num,
                'total_occurrences': exp_dict.get('installments') or len(dates),
                # Rate gia pagate/registrate della riga ricorrente: serve
                # alla Home per non ricontare le occorrenze gia presenti
                # come spese del mese (percentuali spese/entrate sballate).
                'installmentsPaid': exp_dict.get('installments_paid') or 0,
                'notes': exp_dict.get('notes'),
            })

    conn.close()

    # Ordina per data
    future_payments.sort(key=lambda x: x['date'])
    return future_payments


# ============ SALUTE FINANZIARIA (report preciso) ============

def _add_months_str(month_key: str, n: int) -> str:
    """Sposta 'YYYY-MM' di n mesi."""
    y, m = int(month_key[:4]), int(month_key[5:7])
    total = y * 12 + (m - 1) + n
    return f"{total // 12:04d}-{total % 12 + 1:02d}"


def get_financial_health_report(months_back: int = 6):
    """Report dettagliato sulla salute finanziaria.

    Costruisce una sintesi mese per mese (gli ultimi `months_back` mesi,
    mese corrente incluso) e un punteggio composito 0-100 basato su:
      - tasso di risparmio   (peso 35%)  : saldo / entrate
      - rapporto spese/entrate (peso 30%): < 60% massimo punteggio
      - fondo risparmi       (peso 20%)  : risparmi del mese / entrate
                                           (risparmi di base + accantonamenti
                                           del primo stipendio del mese)
      - liquidita mensile    (peso 15%)  : budget giornaliero >= 0
    """
    import calendar as _cal
    cfg = get_config()
    conn = get_connection()
    expense_rows = [dict(r) for r in conn.execute(
        "SELECT id, description, amount, date, category, type, installments, end_date"
        " FROM expenses").fetchall()]
    income_rows = [dict(r) for r in conn.execute(
        "SELECT id, description, amount, date, category FROM incomes").fetchall()]
    overrides = {r['month']: r['amount'] for r in
                 conn.execute('SELECT month, amount FROM salary_overrides').fetchall()}
    conn.close()

    today = datetime.now().date()
    cur_month = f"{today.year:04d}-{today.month:02d}"
    months = [_add_months_str(cur_month, -i) for i in range(max(1, int(months_back)) - 1, -1, -1)]
    savings_base = float(cfg.get('savings_base') or 0)
    payday = int(cfg.get('payday') or 27)

    def _parse_date(v):
        try:
            return datetime.fromisoformat(str(v)[:10]).date()
        except (ValueError, TypeError):
            return None

    def _is_savings_expense(e):
        """True for set-aside/SIP movements or the explicit Accantonamento/Risparmio category."""
        exp_type = str(e.get('type') or '').strip().lower()
        category = str(e.get('category') or '').strip().lower()
        return exp_type in ('savings', 'pac') or category in ('accantonamento', 'risparmio')

    def _twins_in_month(e, mk):
        """Righe gia' registrate a mano che rappresentano un'occorrenza di
        `e` nel mese `mk` (stessa descrizione e stesso importo). Servono a
        non contare due volte una ricorrenza proiettata + la sua occorrenza
        salvata come spesa singola."""
        return sum(
            1 for o in expense_rows
            if o['id'] != e['id'] and o['description'] == e['description']
            and abs(float(o['amount']) - float(e['amount'])) < 0.005
            and str(o['date']).startswith(mk)
        )

    def _occurrences_in_month(e, mk):
        """Numero di volte che una spesa ricorrente (abbonamento/rata/
        accantonamento/PAC) scade nel mese `mk`.

        Una riga di tipo subscription/installment/savings/pac NON e' un
        movimento singolo: e' la DEFINIZIONE della ricorrenza e la sua data
        e' quella della prima occorrenza. In precedenza il report contava
        l'importo una sola volta per ogni mese, ignorando le rate multiple
        dello stesso mese: cosi' i totali risultavano imprecisi e le
        percentuali (es. spese/entrate) fuori dalla realta'.
        """
        start = _parse_date(e['date'])
        if start is None:
            return 1 if str(e['date']).startswith(mk) else 0
        y, mm = int(mk[:4]), int(mk[5:7])
        if e['type'] == 'installment' and e.get('installments'):
            total_occ = max(1, int(e['installments']))
        elif e.get('end_date'):
            end_d = _parse_date(e['end_date'])
            if end_d is None or end_d < start:
                total_occ = 1
            else:
                total_occ = (end_d.year - start.year) * 12 + \
                    (end_d.month - start.month) + 1
        else:
            # Ricorrenza aperta: considerata fino al mese corrente
            # (i mesi futuri non sono ancora "consumati").
            total_occ = max(1, (y - start.year) * 12 + (mm - start.month) + 1) \
                if mk <= cur_month else 1
        n = 0
        for k in range(total_occ):
            d = _add_months(start, k)
            if d.year == y and d.month == mm:
                n += 1
        # Occorrenze del mese gia' registrate a mano (righe singole con
        # stessa descrizione/importo): la proiezione non deve contarle di
        # nuovo, altrimenti la percentuale spese/entrate esplode.
        twins = _twins_in_month(e, mk)
        if twins and mk != start.strftime('%Y-%m'):
            n = max(0, n - twins)
        return n

    monthly = []
    for mk in months:
        y, m = int(mk[:4]), int(mk[5:7])
        eff_salary = overrides.get(mk, cfg.get('salary', 0) or 0)

        # Accantonamenti (savings/PAC) maturati entro il PRIMO stipendio del
        # mese: cifra "gia' messa da parte" quando arriva lo stipendio.
        day = min(payday, _cal.monthrange(y, m)[1])
        first_payday = datetime(y, m, day).date()
        accr_first_payday = 0.0
        for e in expense_rows:
            if not _is_savings_expense(e):
                continue
            try:
                st = datetime.fromisoformat(str(e['date'])[:10]).date()
            except (ValueError, TypeError):
                continue
            if st > first_payday:
                continue  # ricorrenza che inizia dopo lo stipendio
            n_occ = _occurrences_in_month(e, mk)
            # Occorrenze gia' scadute alla data del primo stipendio:
            # la prima cade sempre il `day` del mese (giorno stipendio),
            # quindi con una occorrenza nel mese essa risulta maturata.
            matured = 0
            for k in range(n_occ):
                d = _add_months(st, k)
                if d.year == y and d.month == m and d <= first_payday:
                    matured += 1
            accr_first_payday += e['amount'] * matured

        # Risparmi del mese: base + occorrenze savings/PAC del mese
        # (registrate o proiettate, senza doppi conteggi).
        month_savings = 0.0
        for e in expense_rows:
            if not _is_savings_expense(e):
                continue
            month_savings += e['amount'] * _occurrences_in_month(e, mk)
        savings_total = savings_base + month_savings

        extra_incomes = sum(i['amount'] for i in income_rows
                            if str(i['date']).startswith(mk)
                            and not str(i['id']).startswith('salary_'))
        total_income = eff_salary + extra_incomes

        # Spese del mese: ogni ricorrenza conta per le occorrenze che
        # scadono davvero nel mese; le spese singole contano una volta
        # (le eventuali righe multiple dello stesso mese sono registrazioni
        # distinte e vanno sommate).
        living_expenses = 0.0
        essential = 0.0
        for e in expense_rows:
            if _is_savings_expense(e):
                continue  # sono risparmi, non consumi
            if e['type'] == 'single':
                if str(e['date']).startswith(mk):
                    amt = e['amount']
                else:
                    continue
            else:
                n_occ = _occurrences_in_month(e, mk)
                if not n_occ:
                    continue
                amt = e['amount'] * n_occ
            living_expenses += amt
            if e['type'] in ('subscription', 'installment'):
                essential += amt
        discretionary = living_expenses - essential
        balance = total_income - living_expenses
        savings_rate = (balance / total_income * 100) if total_income > 0 else 0.0
        expense_ratio = (living_expenses / total_income * 100) if total_income > 0 else 0.0

        days_in_m = _cal.monthrange(y, m)[1]
        if mk == cur_month:
            days_left = max(1, (days_in_m - today.day) + 1)
        elif mk < cur_month:
            days_left = 0
        else:
            days_left = days_in_m
        daily_budget = (balance / days_left) if days_left > 0 else 0.0

        monthly.append({
            'month': mk,
            'salary': round(float(eff_salary), 2),
            'extraIncomes': round(float(extra_incomes), 2),
            'totalIncome': round(float(total_income), 2),
            'livingExpenses': round(float(living_expenses), 2),
            'essentialExpenses': round(float(essential), 2),
            'discretionaryExpenses': round(float(discretionary), 2),
            'balance': round(float(balance), 2),
            'savingsBase': round(savings_base, 2),
            'accruedAtFirstPayday': round(float(accr_first_payday), 2),
            'savingsTotal': round(float(savings_total), 2),
            'savingsRate': round(savings_rate, 1),
            'expenseRatio': round(expense_ratio, 1),
            'dailyBudget': round(daily_budget, 2),
        })

    current = monthly[-1] if monthly else None

    def _clamp(v, lo=0.0, hi=100.0):
        return max(lo, min(hi, v))

    score = None
    grade = 'unknown'
    components = None
    if current and current['totalIncome'] > 0:
        recent = [m for m in monthly if m['month'] <= cur_month] or [current]
        avg_sr = sum(m['savingsRate'] for m in recent) / len(recent)
        sr_score = _clamp((avg_sr - 5) / 25 * 100)  # 5% -> 0, 30% -> 100
        er = current['expenseRatio']
        er_score = _clamp((100 - er) / 45 * 100)     # 55% -> 100, 100% -> 0
        sv = current['savingsTotal'] / current['totalIncome'] * 100
        sv_score = _clamp(sv / 20 * 100)             # 20% delle entrate -> 100
        db_score = _clamp(current['dailyBudget'] / (current['totalIncome'] / 30) * 50)
        comps = {'savingsRate': sr_score, 'expenseRatio': er_score,
                 'savingsFund': sv_score, 'liquidity': db_score}
        score = round(comps['savingsRate'] * 0.35 + comps['expenseRatio'] * 0.30 +
                      comps['savingsFund'] * 0.20 + comps['liquidity'] * 0.15)
        if score >= 80:
            grade = 'excellent'
        elif score >= 65:
            grade = 'good'
        elif score >= 45:
            grade = 'fair'
        elif score >= 25:
            grade = 'poor'
        else:
            grade = 'critical'
        components = comps

    # Insight automatici
    insights = []
    if current:
        er = current['expenseRatio']
        if er > 100:
            insights.append({'level': 'danger',
                             'text_it': f"Le spese superano le entrate ({er:.1f}%). Il saldo del mese è negativo: intervieni subito sulle spese non essenziali.",
                             'text_en': f"Expenses exceed income ({er:.1f}%). This month's balance is negative: cut non-essential spending right away."})
        elif er > 80:
            insights.append({'level': 'danger',
                             'text_it': f"Hai speso l'{er:.1f}% delle entrate: oltre la soglia di sicurezza dell'80%. Riduci le spese non essenziali.",
                             'text_en': f"You spent {er:.1f}% of your income: above the 80% safety threshold. Cut non-essential spending."})
        elif er > 60:
            insights.append({'level': 'warn',
                             'text_it': f"Le spese assorbono il {er:.1f}% delle entrate. La zona consigliata è sotto il 60%.",
                             'text_en': f"Expenses absorb {er:.1f}% of income. The recommended zone is below 60%."})
        if current['savingsRate'] < 10:
            insights.append({'level': 'warn',
                             'text_it': f"Tasso di risparmio basso ({current['savingsRate']:.1f}%). L'obiettivo consigliato è almeno il 20%.",
                             'text_en': f"Low savings rate ({current['savingsRate']:.1f}%). Recommended target is at least 20%."})
        if current['savingsTotal'] <= 0:
            insights.append({'level': 'warn',
                             'text_it': 'Nessun risparmio accantonato questo mese: imposta un accantonamento fisso o aumenta i risparmi di base.',
                             'text_en': 'No savings accrued this month: set up a fixed savings amount or increase your base savings.'})
        neg = [m for m in monthly if m['balance'] < 0]
        if neg:
            insights.append({'level': 'danger',
                             'text_it': f"{len(neg)} mesi con saldo negativo negli ultimi {len(monthly)}.",
                             'text_en': f"{len(neg)} months with negative balance out of the last {len(monthly)}."})
        if current['totalIncome'] > 0 and current['savingsRate'] >= 20 and current['expenseRatio'] <= 60:
            insights.append({'level': 'ok',
                             'text_it': 'Ottima gestione: risparmi almeno il 20% delle entrate. Valuta un piano di investimento.',
                             'text_en': 'Great management: you save at least 20% of income. Consider an investment plan.'})

    return {
        'generatedAt': datetime.now().isoformat(),
        'currency': cfg.get('currency', 'EUR'),
        'config': {
            'salary': cfg.get('salary', 0),
            'payday': payday,
            'savingsBase': savings_base,
        },
        'monthly': monthly,
        'current': current,
        'score': score,
        'grade': grade,
        'components': components,
        'insights': insights,
    }


# ============ STATS & BACKUP ============

def _migrate_legacy_files():
    """Migra dati da posizioni vecchie (database.py nella cartella app/ di una
    build portatile) verso la nuova struttura. Copia senza cancellare."""
    try:
        if os.path.basename(_BASE_DIR).lower() == 'app':
            old_db = os.path.join(_BASE_DIR, 'backend', 'mybudget.db')
            if os.path.exists(old_db) and not os.path.exists(DB_PATH):
                import shutil
                shutil.copy2(old_db, DB_PATH)
    except OSError:
        pass


_migrate_legacy_files()

def get_stats():
    """Statistiche aggregate richieste dalla Home (Dashboard).

    "Salute finanziaria" e percentuali arrivano dal backend così che la
    home mostri dati precisi: le ricorrenze (savings/PAC) contano per le
    occorrenze mensili reali, non una sola riga. Il tasso di risparmio
    esclude gli accantonamenti: sono risparmi, non consumi.
    """
    import calendar as _cal
    cfg = get_config()
    conn = get_connection()
    expense_rows = [dict(r) for r in conn.execute(
        "SELECT id, description, amount, date, category, type, installments, end_date"
        " FROM expenses").fetchall()]
    income_rows = [dict(r) for r in conn.execute(
        "SELECT id, description, amount, date, category FROM incomes").fetchall()]
    overrides = {r['month']: r['amount'] for r in
                 conn.execute('SELECT month, amount FROM salary_overrides').fetchall()}
    conn.close()

    today = datetime.now().date()
    cur_month = f"{today.year:04d}-{today.month:02d}"
    payday = int(cfg.get('payday') or 27)
    savings_base = float(cfg.get('savings_base') or 0)

    def _is_savings_expense(e):
        """True for set-aside/SIP movements or the explicit Accantonamento/Risparmio category."""
        exp_type = str(e.get('type') or '').strip().lower()
        category = str(e.get('category') or '').strip().lower()
        return exp_type in ('savings', 'pac') or category in ('accantonamento', 'risparmio')

    def _parse_date(v):
        try:
            return datetime.fromisoformat(str(v)[:10]).date()
        except (ValueError, TypeError):
            return None

    def _twins_in_month(e, mk):
        """Righe già registrate a mano che rappresentano un'occorrenza di
        `e` nel mese `mk` (stessa descrizione e stesso importo): la
        proiezione non deve contarle due volte."""
        return sum(
            1 for o in expense_rows
            if o['id'] != e['id'] and o['description'] == e['description']
            and abs(float(o['amount']) - float(e['amount'])) < 0.005
            and str(o['date']).startswith(mk)
        )

    def _occurrences_in_month(e, mk):
        start = _parse_date(e['date'])
        if start is None:
            return 1 if str(e['date']).startswith(mk) else 0
        y, mm = int(mk[:4]), int(mk[5:7])
        if e['type'] == 'installment' and e.get('installments'):
            total_occ = max(1, int(e['installments']))
        elif e.get('end_date'):
            end_d = _parse_date(e['end_date'])
            if end_d is None or end_d < start:
                total_occ = 1
            else:
                total_occ = (end_d.year - start.year) * 12 + \
                    (end_d.month - start.month) + 1
        else:
            # Ricorrenza aperta: considerata fino al mese corrente.
            total_occ = max(1, (y - start.year) * 12 + (mm - start.month) + 1) \
                if mk <= cur_month else 1
        n = 0
        for k in range(total_occ):
            d = _add_months(start, k)
            if d.year == y and d.month == mm:
                n += 1
        twins = _twins_in_month(e, mk)
        # Le occorrenze già registrate a mano vanno sottratte in TUTTI i
        # mesi (mese di inizio incluso): altrimenti una riga proiettata +
        # la sua occorrenza salvata come spesa singola vengono contate
        # due volte e la percentuale spese/entrate esplode (es. 80%
        # mostrati al posto del reale 76.7%).
        if twins:
            n = max(0, n - twins)
        return n

    def _occurrences_up_to_today(e):
        """Occorrenze della ricorrenza `e` nel mese corrente gia scadute
        (data <= oggi). Una proiezione futura non e' ancora 'consumata'.

        Per le rate (installment) si considerano solo le occorrenze non
        ancora registrate come pagate (campo installments_paid, calcolato
        dal calendario in get_expenses): quelle gia pagate sono spese vere
        del mese e vengono contate dalla parte 'spese singole registrate'.
        """
        start = _parse_date(e['date'])
        if start is None:
            return 1 if str(e['date']).startswith(cur_month) else 0
        y, mm = int(cur_month[:4]), int(cur_month[5:7])
        if e['type'] == 'installment' and e.get('installments'):
            total_occ = max(1, int(e['installments']))
        elif e.get('end_date'):
            end_d = _parse_date(e['end_date'])
            if end_d is None or end_d < start:
                total_occ = 1
            else:
                total_occ = (end_d.year - start.year) * 12 + \
                    (end_d.month - start.month) + 1
        else:
            total_occ = max(1, (y - start.year) * 12 + (mm - start.month) + 1)
        try:
            paid_so_far = int(e.get('installments_paid') or 0)
        except (TypeError, ValueError):
            paid_so_far = 0
        n = 0
        for k in range(total_occ):
            d = _add_months(start, k)
            if d.year != y or d.month != mm:
                continue
            if (k + 1) <= paid_so_far:
                continue  # rata gia registrata come pagata: conta altrove
            if d <= today:
                n += 1
        return n

    eff_salary = overrides.get(cur_month, cfg.get('salary', 0) or 0)
    extra_incomes = sum(i['amount'] for i in income_rows
                        if str(i['date']).startswith(cur_month)
                        and not str(i['id']).startswith('salary_'))
    total_income = float(eff_salary) + float(extra_incomes)

    consumed = 0.0      # spese vere del mese (senza accantonamenti)
    subscriptions = 0.0
    month_savings = 0.0  # occorrenze savings/PAC del mese (registrate o proiettate)
    for e in expense_rows:
        amt = float(e['amount'] or 0)
        if _is_savings_expense(e):
            month_savings += amt * _occurrences_in_month(e, cur_month)
            continue
        if e['type'] == 'single':
            if str(e['date']).startswith(cur_month):
                consumed += amt
        else:
            # Nel mese corrente contano solo le occorrenze gia scadute
            # (data <= oggi): una proiezione futura non e' ancora
            # "consumata". Le occorrenze registrate a mano (righe singole
            # con stessa descrizione/importo dello stesso mese) vengono
            # sottratte per non contarle due volte: era questo il bug che
            # gonfiava la percentuale (es. +80% mostrati al posto del
            # reale 76.7%). Per le rate vale lo stesso principio col campo
            # installments_paid: le rate gia pagate sono addebiti reali e
            # vanno sommate, quelle residue (proiettate) no.
            paid_so_far = 0
            if e['type'] == 'installment' and e.get('installments'):
                try:
                    paid_so_far = min(int(e.get('installments_paid') or 0),
                                      int(e['installments']))
                except (TypeError, ValueError):
                    paid_so_far = 0
                start_d = _parse_date(e['date'])
                if paid_so_far > 0 and start_d is not None:
                    last_paid = _add_months(start_d, paid_so_far - 1)
                    if last_paid.year == today.year and last_paid.month == today.month:
                        consumed += amt * paid_so_far
                        if e['type'] == 'subscription':
                            subscriptions += amt * paid_so_far
            n_due = _occurrences_up_to_today(e)
            twins = _twins_in_month(e, cur_month)
            n_occ = max(0, n_due - twins)
            if not n_occ:
                continue
            consumed += amt * n_occ
            if e['type'] == 'subscription':
                subscriptions += amt * n_occ

    balance = total_income - consumed
    expense_ratio = (consumed / total_income * 100) if total_income > 0 else 0.0
    savings_rate = (balance / total_income * 100) if total_income > 0 else 0.0
    savings_total = savings_base + month_savings

    # Budget giornaliero: giorni dal "prossimo stipendio" (escluso) alla
    # fine del mese successivo, coerente col conto giorni della Dashboard.
    days_in_month = _cal.monthrange(today.year, today.month)[1]
    next_m = today.month + 1
    next_y = today.year
    if next_m > 12:
        next_m, next_y = 1, next_y + 1
    days_in_next = _cal.monthrange(next_y, next_m)[1]
    if today.day < payday:
        days_left = (days_in_month - today.day) + min(payday - 1, days_in_next)
    else:
        days_left = days_in_next - payday + 1
    daily_budget = (balance / days_left) if days_left > 0 else 0.0

    score = None
    grade = 'unknown'
    if total_income > 0:
        def _clamp(v, lo=0.0, hi=100.0):
            return max(lo, min(hi, v))
        sr_score = _clamp((savings_rate - 5) / 25 * 100)   # 5% -> 0, 30% -> 100
        er_score = _clamp((100 - expense_ratio) / 45 * 100)  # 55% -> 100, 100% -> 0
        sv_score = _clamp(savings_total / total_income / 20 * 100)
        db_score = _clamp(daily_budget / (total_income / 30) * 50)
        score = round(sr_score * 0.35 + er_score * 0.30 +
                      sv_score * 0.20 + db_score * 0.15)
        if score >= 80:
            grade = 'excellent'
        elif score >= 65:
            grade = 'good'
        elif score >= 45:
            grade = 'fair'
        elif score >= 25:
            grade = 'poor'
        else:
            grade = 'critical'

    return {
        'month': cur_month,
        'totalIncome': round(total_income, 2),
        'consumed': round(consumed, 2),
        'balance': round(balance, 2),
        'expenseRatio': round(expense_ratio, 1),
        'savingsRate': round(savings_rate, 1),
        'subscriptionsTotal': round(subscriptions, 2),
        'savingsBase': round(savings_base, 2),
        'savingsAccrued': round(month_savings, 2),
        'savingsTotal': round(savings_total, 2),
        'dailyBudget': round(daily_budget, 2),
        'score': score,
        'grade': grade,
    }


def get_db_stats():
    conn = get_connection()
    inc_count = conn.execute('SELECT COUNT(*) FROM incomes').fetchone()[0]
    exp_count = conn.execute('SELECT COUNT(*) FROM expenses').fetchone()[0]
    cat_count = conn.execute('SELECT COUNT(*) FROM expense_categories').fetchone()[0]
    conn.close()

    # Dimensione del file DB
    size_bytes = os.path.getsize(DB_PATH) if os.path.exists(DB_PATH) else 0
    size_kb = round(size_bytes / 1024, 1)

    return {
        'totalIncomes': inc_count,
        'totalExpenses': exp_count,
        'totalCategories': cat_count,
        'dbSize': f"{size_kb} KB",
        'dbPath': DB_PATH,
    }


def export_full_backup():
    """Esporta tutti i dati come JSON."""
    conn = get_connection()
    data = {
        'config': get_config(),
        'incomes': [dict(r) for r in conn.execute('SELECT * FROM incomes').fetchall()],
        'expenses': [dict(r) for r in conn.execute('SELECT * FROM expenses').fetchall()],
        'expenseCategories': [dict(r) for r in conn.execute('SELECT * FROM expense_categories').fetchall()],
        'incomeCategories': [dict(r) for r in conn.execute('SELECT * FROM income_categories').fetchall()],
        'salaryOverrides': [dict(r) for r in conn.execute('SELECT * FROM salary_overrides').fetchall()],
        'trips': get_trips(),
        'tripCosts': get_trip_costs(),
        'exportDate': datetime.now().isoformat(),
        'version': '2.2',
    }
    conn.close()
    return data


def import_full_backup(data: dict):
    """Importa dati da backup JSON (sovrascrive tutto)."""
    conn = get_connection()

    # Pulisci tutto
    conn.execute('DELETE FROM incomes')
    conn.execute('DELETE FROM expenses')
    conn.execute('DELETE FROM expense_categories')
    conn.execute('DELETE FROM income_categories')
    conn.execute('DELETE FROM trip_costs')
    conn.execute('DELETE FROM trips')
    conn.execute('DELETE FROM salary_overrides')
    conn.execute('DELETE FROM config')

    # Importa config
    if 'config' in data:
        c = data['config']
        try:
            sav_base = max(0.0, float(c.get('savings_base') or 0))
        except (TypeError, ValueError):
            sav_base = 0.0
        conn.execute(
            'INSERT INTO config (id, payday, salary, currency, language, savings_base) VALUES (1, ?, ?, ?, ?, ?)',
            (c.get('payday', 27), c.get('salary', 0),
             normalize_currency(c.get('currency')),
             'en' if str(c.get('language', 'it')).lower().startswith('en') else 'it',
             sav_base)
        )

    # Importa categorie
    if 'expenseCategories' in data:
        for cat in data['expenseCategories']:
            conn.execute(
                'INSERT INTO expense_categories (id, name, color, icon) VALUES (?, ?, ?, ?)',
                (cat['id'], cat['name'], cat['color'], cat['icon'])
            )

    if 'incomeCategories' in data:
        for cat in data['incomeCategories']:
            conn.execute(
                'INSERT INTO income_categories (id, name, color, icon) VALUES (?, ?, ?, ?)',
                (cat['id'], cat['name'], cat['color'], cat['icon'])
            )

    # Importa entrate
    if 'incomes' in data:
        for inc in data['incomes']:
            conn.execute('''
                INSERT INTO incomes (id, description, amount, date, category, recurring, recurring_day, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                inc['id'], inc['description'], inc['amount'], inc['date'],
                inc['category'], inc.get('recurring', 0), inc.get('recurring_day'),
                inc.get('created_at', datetime.now().isoformat()),
                inc.get('updated_at', datetime.now().isoformat())
            ))

    # Importa spese
    if 'expenses' in data:
        for exp in data['expenses']:
            # Supporta sia backup snake_case (esportati da questa app)
            # sia backup camelCase (es. export dal frontend IndexedDB)
            exp = _normalize_expense_keys(exp)
            conn.execute('''
                INSERT INTO expenses (id, description, amount, date, category, type,
                installments, installments_paid, end_date, notes, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                exp['id'], exp['description'], exp['amount'], exp['date'],
                exp['category'], exp['type'], exp.get('installments'),
                exp.get('installments_paid'), exp.get('end_date'), exp.get('notes'),
                exp.get('created_at', datetime.now().isoformat()),
                exp.get('updated_at', datetime.now().isoformat())
            ))

    # Importa override stipendio mensili
    if 'salaryOverrides' in data:
        for ov in data['salaryOverrides']:
            conn.execute('''
                INSERT OR REPLACE INTO salary_overrides (month, amount, created_at, updated_at)
                VALUES (?, ?, ?, ?)
            ''', (ov['month'], ov['amount'],
                  ov.get('created_at', datetime.now().isoformat()),
                  ov.get('updated_at', datetime.now().isoformat())))

    # Importa viaggi e relativi costi (accetta sia chiavi camelCase del
    # frontend/export sia snake_case di dump DB diretti)
    if 'trips' in data:
        now = datetime.now().isoformat()
        for tr in data['trips']:
            start = tr.get('startDate') or tr.get('start_date')
            end = tr.get('endDate') or tr.get('end_date')
            conn.execute('''
                INSERT OR REPLACE INTO trips (id, name, destination, start_date, end_date,
                    budget, currency, notes, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                tr['id'], tr['name'], tr.get('destination'), start, end,
                tr.get('budget', 0), normalize_currency(tr.get('currency')),
                tr.get('notes'), tr.get('createdAt') or tr.get('created_at') or now,
                tr.get('updatedAt') or tr.get('updated_at') or now
            ))

    if 'tripCosts' in data:
        now = datetime.now().isoformat()
        for tc in data['tripCosts']:
            trip_id = tc.get('tripId') or tc.get('trip_id')
            conn.execute('''
                INSERT OR REPLACE INTO trip_costs (id, trip_id, description, amount, date,
                    category, notes, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                tc['id'], trip_id, tc['description'], tc['amount'], tc['date'],
                tc.get('category') or 'Altro', tc.get('notes'),
                tc.get('createdAt') or tc.get('created_at') or now,
                tc.get('updatedAt') or tc.get('updated_at') or now
            ))

    conn.commit()
    conn.close()
