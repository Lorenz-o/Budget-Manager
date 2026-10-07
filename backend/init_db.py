"""
Script per inizializzare il database senza avviare il server.
Utile per creare il file .db prima del primo avvio.

Uso: python init_db.py
"""
import database as db

print("🗄️  Inizializzazione database...")
db.init_db()
print("\n✅ Database creato con successo!")
print(f"📁 Percorso: {db.DB_PATH}")
print("\nOra puoi:")
print("  1. Avviare l'app con: python app.py")
print("  2. Oppure aprire mybudget.db con DB Browser for SQLite")
