#!/bin/bash
# Starter-Script für den Produkt-Chatbot

cd "$(dirname "$0")"

echo "🚀 Starte Produkt-Chatbot..."
echo ""

# Aktiviere das virtuelle Environment (Python 3.12)
VENV_PATH="../.venv"
if [ -d "$VENV_PATH" ]; then
    echo "🐍 Aktiviere Python 3.12 venv..."
    source "$VENV_PATH/bin/activate"
    echo "   Python: $(python3 --version)"
else
    echo "⚠️  Kein venv gefunden in $VENV_PATH"
    echo "   Erstelle mit: python3 -m venv ../.venv"
    exit 1
fi

# Prüfe ob Abhängigkeiten installiert sind
if ! python3 -c "import fastapi" 2>/dev/null; then
    echo "📦 Installiere Abhängigkeiten..."
    pip install -r requirements.txt
fi

# Starte Server
echo "✅ Server startet auf http://127.0.0.1:8000"
echo "   Öffne den Browser und navigiere zu: http://127.0.0.1:8000"
echo ""
python3 run.py

