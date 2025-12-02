# Chatbot - Produkt-Chatbot für Husatech

**Status:** ✅ Produktionsbereit

## 🚀 Quick Start

### Installation
```bash
pip install -r requirements.txt
```

### Server starten
```bash
# Option 1: Python
python run.py

# Option 2: Shell-Script
./START_SERVER.sh
```

**Standard-Port:** 1125  
**URL:** http://127.0.0.1:1125

## 📋 Struktur

```
Chatbot/
├── backend/          # FastAPI Backend
├── frontend/         # Web-Interface
├── config/           # Konfiguration
├── prompts/          # Chatbot-Prompts
├── requirements.txt  # Dependencies
├── run.py           # Starter-Script
└── START_SERVER.sh  # Start-Script
```

## ⚙️ Konfiguration

Die Konfiguration erfolgt über die `.env` Datei. Wichtige Variablen:
- `OPENAI_API_KEY` - OpenAI API Key
- `QDRANT_URL` - Qdrant Server URL
- `COLLECTION_NAME` - Qdrant Collection Name
- `PORT` - Server Port (Default: 1125)

## 📚 Dokumentation

Vollständige Dokumentation befindet sich in:
- `Projektmanagement/Chatbot/` - Chatbot-Dokumentationen
- `Projektmanagement/ENV_Konfiguration/` - ENV-Konfiguration
- `Projektmanagement/Implementierungen/` - Implementierungspläne
