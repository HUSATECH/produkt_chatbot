"""
FastAPI Backend für Produkt-Chatbot
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List, Optional
import os
import sys
from pathlib import Path

# Pfad für Imports hinzufügen
sys.path.append(str(Path(__file__).parent.parent))

# Import PlatformAPIClient aus RAG-System
# NEU: Relativer Import zum RAG-System
RAG_SYSTEM_LIBS = Path(__file__).parent.parent.parent / "RAG-System" / "libs"
if RAG_SYSTEM_LIBS.exists():
    sys.path.insert(0, str(RAG_SYSTEM_LIBS))
    from platform_api_client import PlatformAPIClient
else:
    raise ImportError(f"RAG-System/libs nicht gefunden: {RAG_SYSTEM_LIBS}")

from backend.llm_service import LLMService
from backend.rag_engine import RAGEngine

# Import Prompt-Manager
from prompts.prompt_manager import get_prompt_manager

# Import Config (als Modul, nicht als Package)
from config import config as chatbot_config
FRONTEND_DIR = chatbot_config.FRONTEND_DIR
HOST = chatbot_config.HOST
PORT = chatbot_config.PORT
PLATFORM_API_URL = chatbot_config.PLATFORM_API_URL

app = FastAPI(title="Produkt-Chatbot API", version="1.0.0")

# CORS aktivieren
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Services initialisieren
llm_service = LLMService()
rag_engine = RAGEngine()
platform_api_client = PlatformAPIClient(api_url=PLATFORM_API_URL)

# Request-Models
class ChatMessage(BaseModel):
    message: str
    conversation_history: Optional[List[dict]] = None

class CompareProductsRequest(BaseModel):
    artikelnummern: List[str]

class StorageRecommendationRequest(BaseModel):
    pv_leistung_kwp: float
    stromverbrauch_kwh: Optional[float] = None
    autarkie_wunsch: Optional[float] = None

class PromptUpdateRequest(BaseModel):
    prompt_id: str
    content: str

# API-Endpunkte
@app.get("/api")
async def api_info():
    """API-Info-Endpunkt"""
    return {"message": "Produkt-Chatbot API", "version": "1.0.0"}

@app.post("/api/chat")
async def chat(request: ChatMessage):
    """Chat-Endpunkt mit RAG-Unterstützung"""
    try:
        result = llm_service.chat(
            user_message=request.message,
            conversation_history=request.conversation_history
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/search")
async def search_products(query: str, limit: int = 5, produkttyp: Optional[str] = None, min_score: float = 0.3, smart: bool = True):
    """Direkte Produktsuche in Qdrant
    
    Intelligente Suche (smart=True, Standard):
    - Sucht zuerst nach Artikelnummern
    - Dann nach Artikelnamen (exakt oder teilweise)
    - Dann semantisch
    
    Standard-Suche (smart=False):
    - Nur semantische Suche
    """
    try:
        if smart:
            # Intelligente kombinierte Suche
            products = rag_engine.smart_search(
                query=query,
                limit=limit,
                produkttyp=produkttyp,
                min_score=min_score
            )
        else:
            # Nur semantische Suche
            products = rag_engine.search_products(
                query=query,
                limit=limit,
                produkttyp=produkttyp,
                min_score=min_score
            )
        
        return {
            "query": query,
            "count": len(products),
            "smart_search": smart,
            "products": products
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/product/{artikelnummer}")
async def get_product(artikelnummer: str):
    """Holt ein Produkt anhand der Artikelnummer direkt aus Qdrant"""
    try:
        product = rag_engine.get_product_by_artikelnummer(artikelnummer)
        if not product:
            raise HTTPException(status_code=404, detail=f"Produkt mit Artikelnummer {artikelnummer} nicht gefunden")
        return {
            "success": True,
            "product": product
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/product/{artikelnummer}/pricing")
async def get_product_pricing(artikelnummer: str):
    """Holt Preis- und Lieferanten-Daten für ein Produkt aus Platform-API
    
    WICHTIG: Platform-API wird NUR für Preise & Lieferanten verwendet!
    Alle anderen Produktinformationen kommen aus Qdrant.
    """
    try:
        # Hole Preis-Daten
        pricing_data = platform_api_client.get_pricing_data(artikelnummer)
        
        # Hole Lieferanten-Daten
        supplier_data = platform_api_client.get_supplier_data(artikelnummer)
        
        return {
            "success": True,
            "artikelnummer": artikelnummer,
            "pricing": pricing_data or {},
            "supplier": supplier_data or {}
        }
    except Exception as e:
        # Bei Fehler: Leere Daten zurückgeben (nicht kritisch)
        return {
            "success": False,
            "artikelnummer": artikelnummer,
            "pricing": {},
            "supplier": {},
            "error": str(e)
        }

@app.get("/api/products")
async def list_products(limit: int = 10, offset: int = 0):
    """Listet alle Produkte aus Qdrant (für Debugging/Übersicht)"""
    try:
        # Hole alle Produkte mit scroll
        results = rag_engine.qdrant_client.scroll(
            collection_name=rag_engine.COLLECTION_NAME,
            limit=limit,
            offset=offset
        )
        
        points, next_offset = results if isinstance(results, tuple) else (results, None)
        
        products = []
        for point in points:
            products.append({
                "id": point.id,
                "artikelnummer": point.payload.get("artikelnummer", ""),
                "artikelname": point.payload.get("artikelname", ""),
                "produkttyp": point.payload.get("produkttyp", ""),
                "hersteller": point.payload.get("hersteller", "")
            })
        
        return {
            "count": len(products),
            "offset": offset,
            "next_offset": next_offset,
            "products": products
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/compare")
async def compare_products(request: CompareProductsRequest):
    """Vergleicht mehrere Produkte"""
    try:
        result = llm_service.compare_products_chat(request.artikelnummern)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/storage-recommendation")
async def storage_recommendation(request: StorageRecommendationRequest):
    """Empfiehlt passende Speichersysteme für PV-Anlage"""
    try:
        result = llm_service.find_storage_recommendation(
            pv_leistung_kwp=request.pv_leistung_kwp,
            stromverbrauch_kwh=request.stromverbrauch_kwh,
            autarkie_wunsch=request.autarkie_wunsch
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================================
# PROMPT-VERWALTUNG API
# ============================================================================

@app.get("/api/prompts")
async def get_prompts():
    """
    Gibt alle Prompts zurück (hierarchisch nach Kategorien).
    
    Verwendet für den Prompt-Editor im Frontend.
    """
    try:
        prompt_manager = get_prompt_manager()
        return {
            "success": True,
            "data": prompt_manager.get_all_prompts()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/prompts/{prompt_id}")
async def get_prompt(prompt_id: str):
    """
    Gibt einen einzelnen Prompt zurück.
    
    Args:
        prompt_id: Die eindeutige ID des Prompts
    """
    try:
        prompt_manager = get_prompt_manager()
        prompt_data = prompt_manager.get_prompt_data(prompt_id)
        
        if not prompt_data:
            raise HTTPException(status_code=404, detail=f"Prompt '{prompt_id}' nicht gefunden")
        
        return {
            "success": True,
            "prompt": prompt_data
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/api/prompts/{prompt_id}")
async def update_prompt(prompt_id: str, request: PromptUpdateRequest):
    """
    Aktualisiert den Inhalt eines Prompts.
    
    Nur bearbeitbare Prompts können geändert werden.
    Ein Backup wird automatisch erstellt.
    
    Args:
        prompt_id: Die ID des zu aktualisierenden Prompts
        request: Enthält prompt_id und neuen content
    """
    try:
        prompt_manager = get_prompt_manager()
        
        # Prüfe ob Prompt existiert
        prompt_data = prompt_manager.get_prompt_data(prompt_id)
        if not prompt_data:
            raise HTTPException(status_code=404, detail=f"Prompt '{prompt_id}' nicht gefunden")
        
        # Prüfe ob bearbeitbar
        if not prompt_data.get('editable', True):
            raise HTTPException(
                status_code=403, 
                detail=f"Prompt '{prompt_id}' ist nicht bearbeitbar (Keyword-Liste)"
            )
        
        # Aktualisiere Prompt
        success = prompt_manager.update_prompt(prompt_id, request.content)
        
        if success:
            # Reload LLM-Service um neue Prompts zu laden
            llm_service.reload_prompts()
            
            return {
                "success": True,
                "message": f"Prompt '{prompt_id}' erfolgreich aktualisiert",
                "prompt": prompt_manager.get_prompt_data(prompt_id)
            }
        else:
            raise HTTPException(status_code=500, detail="Fehler beim Speichern des Prompts")
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/prompts/reload")
async def reload_prompts():
    """
    Lädt alle Prompts neu aus der Datei.
    
    Nützlich nach manuellen Änderungen an prompts.json.
    """
    try:
        prompt_manager = get_prompt_manager()
        success = prompt_manager.load_prompts()
        
        if success:
            # Reload LLM-Service um neue Prompts zu laden
            llm_service.reload_prompts()
            
            return {
                "success": True,
                "message": "Prompts erfolgreich neu geladen"
            }
        else:
            raise HTTPException(status_code=500, detail="Fehler beim Laden der Prompts")
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/prompts/categories/list")
async def get_prompt_categories():
    """
    Gibt nur die Kategorie-Struktur zurück (ohne vollständige Prompt-Inhalte).
    
    Nützlich für die Navigation im Prompt-Editor.
    """
    try:
        prompt_manager = get_prompt_manager()
        categories = prompt_manager.get_categories()
        
        # Vereinfachte Struktur für Navigation
        simplified = []
        for cat in categories:
            simplified.append({
                "id": cat.get("id"),
                "name": cat.get("name"),
                "description": cat.get("description"),
                "order": cat.get("order", 0),
                "prompt_count": len(cat.get("prompts", [])),
                "prompts": [
                    {
                        "id": p.get("id"),
                        "name": p.get("name"),
                        "model": p.get("model"),
                        "editable": p.get("editable", True)
                    }
                    for p in cat.get("prompts", [])
                ]
            })
        
        return {
            "success": True,
            "categories": simplified
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Frontend-Serving
if FRONTEND_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")
    
    @app.get("/", response_class=FileResponse)
    async def serve_index():
        """Served index.html"""
        index_path = FRONTEND_DIR / "index.html"
        if index_path.exists():
            return FileResponse(index_path)
        raise HTTPException(status_code=404, detail="index.html nicht gefunden")
    
    @app.get("/{path:path}", response_class=FileResponse)
    async def serve_frontend(path: str):
        """Served Frontend-Dateien"""
        # Ignoriere API-Routen
        if path.startswith("api/"):
            raise HTTPException(status_code=404, detail="API-Route nicht gefunden")
        
        file_path = FRONTEND_DIR / path
        if file_path.exists() and file_path.is_file():
            return FileResponse(file_path)
        
        # Fallback zu index.html für SPA-Routing
        index_path = FRONTEND_DIR / "index.html"
        if index_path.exists():
            return FileResponse(index_path)
        
        raise HTTPException(status_code=404, detail="Datei nicht gefunden")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=HOST, port=PORT)

