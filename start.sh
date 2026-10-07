#!/bin/bash

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║                                                  ║"
echo "║   💰 MyBudget - Avvio Applicazione              ║"
echo "║                                                  ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# Verifica Python
if ! command -v python3 &> /dev/null; then
    echo "❌ ERRORE: Python3 non trovato!"
    echo ""
    echo "Installa con:"
    echo "  Ubuntu/Debian: sudo apt install python3 python3-pip"
    echo "  macOS: brew install python3"
    echo ""
    exit 1
fi

echo "✅ Python3 trovato: $(python3 --version)"
echo ""

# Installa dipendenze Python
echo "📦 Installo dipendenze Python..."
cd backend
pip3 install -r requirements.txt --quiet 2>/dev/null || pip3 install -r requirements.txt
cd ..
echo "✅ Dipendenze Python pronte"
echo ""

# Verifica Node.js
if ! command -v npm &> /dev/null; then
    echo "⚠️  Node.js non trovato, uso frontend già buildato se presente"
else
    # Build del frontend
    echo "🏗️  Build del frontend..."
    npm run build
    if [ $? -ne 0 ]; then
        echo "❌ ERRORE nel build del frontend"
        exit 1
    fi
    echo "✅ Frontend buildato"
    echo ""
fi

# Avvia il server
echo "🚀 Avvio server..."
echo ""
echo "════════════════════════════════════════════════════"
echo "  🌐 L'app si aprirà automaticamente"
echo "  📍 URL: http://localhost:5000"
echo "  🗄️  Database: backend/mybudget.db"
echo ""
echo "  ⚠️  NON chiudere questa finestra!"
echo "  Premi Ctrl+C per fermare il server"
echo "════════════════════════════════════════════════════"
echo ""

cd backend
python3 app.py
cd ..
