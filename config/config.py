"""
Konfiguration für Produkt-Chatbot

Lädt alle Konfigurationen aus .env Datei
"""
import os
from pathlib import Path
from dotenv import load_dotenv

# Lade .env Datei (NUR Chatbot/.env)
BASE_DIR = Path(__file__).parent.parent  # Chatbot/
load_dotenv(BASE_DIR / ".env")  # NUR Chatbot/.env
# KEINE Fallbacks mehr!

# ============================================================================
# OpenAI API Key (ERFORDERLICH)
# ============================================================================
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
if not OPENAI_API_KEY:
    raise ValueError("OPENAI_API_KEY nicht gefunden in .env Datei. Bitte erstelle chatbot/.env mit OPENAI_API_KEY=...")

# ============================================================================
# LLM Modell-Konfiguration (verschiedene Modelle für verschiedene Aufgaben)
# ============================================================================
# Normaler Chat: GPT-4o (gute Qualität, nicht zu teuer)
OPENAI_MODEL_CHAT = os.getenv("OPENAI_MODEL_CHAT", "gpt-4o")

# Produktvergleich: GPT-5.1 (beste Qualität für komplexe Vergleiche)
OPENAI_MODEL_COMPARE = os.getenv("OPENAI_MODEL_COMPARE", "gpt-5.1")

# PV-Empfehlung: GPT-5.1 (oder gpt-5.1-thinking falls verfügbar)
OPENAI_MODEL_RECOMMENDATION = os.getenv("OPENAI_MODEL_RECOMMENDATION", "gpt-5.1")

# Legacy-Kompatibilität (für Code der noch OPENAI_MODEL verwendet)
OPENAI_MODEL = OPENAI_MODEL_CHAT

# Embedding-Modell (für Qdrant)
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "text-embedding-3-large")
EMBEDDING_DIM = 3072  # ✅ OpenAI text-embedding-3-large (3072 Dimensionen)

# ============================================================================
# Qdrant (Vector Database)
# ============================================================================
QDRANT_URL = os.getenv("QDRANT_URL", "http://87.106.191.206:6333")
COLLECTION_NAME = os.getenv("COLLECTION_NAME", "husatech_produkte_large")  # ✅ NEUE Collection mit 3072 Dimensionen

# ============================================================================
# Platform-API (JTL WaWi)
# ============================================================================
PLATFORM_API_URL = os.getenv("PLATFORM_API_URL", "http://87.106.191.206:5555")
PLATFORM_API_BASE_URL = os.getenv("PLATFORM_API_BASE_URL", f"{PLATFORM_API_URL}/api")

# ============================================================================
# RAG-Konfiguration
# ============================================================================
MAX_SEARCH_RESULTS = int(os.getenv("MAX_SEARCH_RESULTS", "5"))  # Anzahl der Produkte für RAG-Kontext
SIMILARITY_THRESHOLD = float(os.getenv("SIMILARITY_THRESHOLD", "0.7"))  # Mindest-Ähnlichkeit für Suchergebnisse

# ============================================================================
# Server-Konfiguration
# ============================================================================
HOST = os.getenv("HOST", "127.0.0.1")
PORT = int(os.getenv("PORT", "1125"))  # Geändert von 8000 auf 1125 für neues Projekt
DEBUG = os.getenv("DEBUG", "False").lower() == "true"

# ============================================================================
# Pfade
# ============================================================================
FRONTEND_DIR = BASE_DIR / "frontend"

