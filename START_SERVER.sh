#!/bin/bash
# Starter-Script für den Produkt-Chatbot

cd "$(dirname "$0")"

echo "🚀 Starte Produkt-Chatbot..."
echo ""

# Prüfe ob Python verfügbar ist
if ! command -v python3 &> /dev/null; then
    echo "❌ Python3 nicht gefunden!"
    exit 1
fi

# Prüfe ob Abhängigkeiten installiert sind
if ! python3 -c "import fastapi" 2>/dev/null; then
    echo "📦 Installiere Abhängigkeiten..."
    pip3 install -r requirements.txt
fi

# Starte Server
echo "✅ Server startet auf http://127.0.0.1:8000"
echo "   Öffne den Browser und navigiere zu: http://127.0.0.1:8000"
echo ""
python3 run.py

