"""
Platform-API Client für Produkt-Chatbot

WICHTIG: Platform-API wird NUR für folgende Daten verwendet:
- Einkaufspreis (0% und 19% MwSt)
- Verkaufspreis
- Aktueller Rabatt
- Stücklistenpreise
- Standardlieferant

Alle anderen Produktinformationen kommen aus Qdrant!

Diese Datei ist eine eigenständige Version für den Chatbot,
unabhängig vom RAG-System.
"""

import requests
import logging
from typing import Dict, List, Optional, Iterator, Union
import os
from pathlib import Path
from dotenv import load_dotenv

# Lade .env aus dem Chatbot-Verzeichnis
CHATBOT_ROOT = Path(__file__).parent.parent.parent  # Chatbot/
load_dotenv(CHATBOT_ROOT / ".env")

logger = logging.getLogger(__name__)

# Default API URL aus .env
DEFAULT_API_URL = os.getenv("PLATFORM_API_URL", "http://87.106.191.206:5555")
DEFAULT_API_KEY = os.getenv("PLATFORM_API_KEY")


class PlatformAPIClient:
    """
    Client für Platform-API (JTL-Datenbank-Zugriff)
    
    Fokus: Preis- und Lieferanten-Daten
    Alle anderen Produktinformationen kommen aus Qdrant!
    """
    
    def __init__(self, api_url: Optional[str] = None, api_key: Optional[str] = None):
        """
        Initialisiert Platform-API Client
        
        Args:
            api_url: Basis-URL der Platform-API (ohne /api). Falls None, wird aus .env geladen.
            api_key: Optional API-Key (falls benötigt). Falls None, wird aus .env geladen.
        """
        # Verwende .env Werte als Default
        if api_url is None:
            api_url = DEFAULT_API_URL
        if api_key is None:
            api_key = DEFAULT_API_KEY
            
        self.api_url = api_url.rstrip('/')
        self.api_base = f"{self.api_url}/api"
        self.api_key = api_key
        self.session = requests.Session()
        
        if api_key:
            self.session.headers.update({
                'X-API-Key': api_key,
                'Content-Type': 'application/json'
            })
        else:
            self.session.headers.update({
                'Content-Type': 'application/json'
            })
        
        # Timeout-Konfiguration
        self.timeout = 10
        self.max_retries = 3
    
    def _make_request(self, method: str, endpoint: str, **kwargs) -> Optional[Dict]:
        """
        Führt HTTP-Request aus mit Retry-Logik
        
        Args:
            method: HTTP-Methode (GET, POST, etc.)
            endpoint: API-Endpunkt (z.B. "/articles/1700200")
            **kwargs: Weitere Request-Parameter
        
        Returns:
            JSON-Response als Dict oder None bei Fehler
        """
        url = f"{self.api_base}{endpoint}"
        
        for attempt in range(self.max_retries):
            try:
                response = self.session.request(
                    method=method,
                    url=url,
                    timeout=self.timeout,
                    **kwargs
                )
                response.raise_for_status()
                
                # Platform-API gibt oft {"data": {...}} zurück
                result = response.json()
                if isinstance(result, dict) and 'data' in result:
                    return result['data']
                return result
                
            except requests.exceptions.Timeout:
                logger.warning(f"Timeout bei {url} (Versuch {attempt + 1}/{self.max_retries})")
                if attempt == self.max_retries - 1:
                    logger.error(f"Request zu {url} nach {self.max_retries} Versuchen fehlgeschlagen")
                    return None
                    
            except requests.exceptions.RequestException as e:
                logger.error(f"Fehler bei {url}: {e}")
                if attempt == self.max_retries - 1:
                    return None
        
        return None
    
    def get_pricing_data(self, identifier: Union[str, int]) -> Optional[Dict]:
        """
        Holt Preis-Daten für einen Artikel
        
        WICHTIG: Nur für Preise, Rabatte, Stücklistenpreise!
        Alle anderen Daten kommen aus Qdrant!
        
        Args:
            identifier: Artikelnummer (str) oder Artikel_ID (int)
        
        Returns:
            Dict mit Preis-Daten:
            {
                "einkaufspreis_netto": float,
                "einkaufspreis_0_mwst": float,
                "einkaufspreis_19_mwst": float,
                "verkaufspreis_netto": float,
                "verkaufspreis_0_mwst": float,
                "verkaufspreis_19_mwst": float,
                "aktueller_rabatt": float,
                "mwst_satz": int,  # 0 oder 19
                "stuecklistenpreise": [
                    {
                        "artikelnummer": str,
                        "einkaufspreis_netto": float,
                        "verkaufspreis_netto": float
                    }
                ]
            }
        """
        complete_info = self.get_article_complete_info(identifier)
        if not complete_info:
            return None
        
        # Extrahiere Preis-Daten aus vollständiger Info
        pricing = complete_info.get('pricing', {})
        status = complete_info.get('status', {})
        
        # Einkaufspreise aus tliefartikel (fEKNetto, fEKBrutto)
        purchase_net = pricing.get('purchase_net')  # fEKNetto aus tliefartikel
        purchase_gross = pricing.get('purchase_gross')  # fEKBrutto aus tliefartikel
        
        # Verkaufspreise
        raw_price = pricing.get('raw')  # fVKNetto (Netto-Verkaufspreis)
        shop_price = pricing.get('shop')  # Berechnet: fVKNetto * 1.19
        
        # MwSt-Satz (aus JTL-Datenbank, Standard: 19%)
        vat_rate = 19  # Standard, muss aus tArtikelPreis.nMwSt geholt werden
        
        # Berechne Einkaufspreise mit beiden MwSt-Sätzen
        einkaufspreis_netto = purchase_net
        einkaufspreis_0_mwst = purchase_net if purchase_net else None
        einkaufspreis_19_mwst = purchase_gross if purchase_gross else (purchase_net * 1.19 if purchase_net else None)
        
        # Berechne Verkaufspreise mit beiden MwSt-Sätzen
        verkaufspreis_netto = raw_price
        verkaufspreis_0_mwst = raw_price if vat_rate == 0 else None
        verkaufspreis_19_mwst = shop_price if shop_price else (raw_price * 1.19 if raw_price else None)
        
        # Aktueller Rabatt & Streichpreise
        aktueller_rabatt = 0
        ursprungs_preis = None
        reduzierter_preis = None
        ist_angebot = False
        
        # Hole aktives Shop-Angebot über neue API-Methode
        try:
            angebot_response = self._make_request('GET', f'/articles/{identifier}/angebot')
            if angebot_response and angebot_response.get('ist_angebot'):
                ursprungs_preis = angebot_response.get('ursprungs_preis')
                reduzierter_preis = angebot_response.get('angebotspreis')
                aktueller_rabatt = angebot_response.get('rabatt_prozent', 0)
                ist_angebot = True
        except Exception as e:
            logger.debug(f"Angebot-Endpunkt nicht verfügbar für {identifier}: {e}")
            ist_angebot = False
        
        # Stücklistenpreise (wird separat geholt)
        stuecklistenpreise = self.get_bom_pricing(identifier)
        
        return {
            "einkaufspreis_netto": purchase_net,
            "einkaufspreis_0_mwst": round(einkaufspreis_0_mwst, 2) if einkaufspreis_0_mwst else None,
            "einkaufspreis_19_mwst": round(einkaufspreis_19_mwst, 2) if einkaufspreis_19_mwst else None,
            "verkaufspreis_netto": round(verkaufspreis_netto, 2) if verkaufspreis_netto else None,
            "verkaufspreis_0_mwst": round(verkaufspreis_0_mwst, 2) if verkaufspreis_0_mwst else None,
            "verkaufspreis_19_mwst": round(verkaufspreis_19_mwst, 2) if verkaufspreis_19_mwst else None,
            "aktueller_rabatt": aktueller_rabatt,
            "ursprungs_preis": round(ursprungs_preis, 2) if ursprungs_preis else None,
            "reduzierter_preis": round(reduzierter_preis, 2) if reduzierter_preis else None,
            "ist_angebot": ist_angebot,
            "mwst_satz": vat_rate,
            "stuecklistenpreise": stuecklistenpreise or []
        }
    
    def get_supplier_data(self, identifier: Union[str, int]) -> Optional[Dict]:
        """
        Holt Lieferanten-Daten für einen Artikel
        
        WICHTIG: Standardlieferant aus tliefartikel (tLiefArtikel_kArtikel)
        
        Args:
            identifier: Artikelnummer (str) oder Artikel_ID (int)
        
        Returns:
            Dict mit Lieferanten-Daten:
            {
                "standardlieferant": {
                    "name": str,
                    "lieferantennummer": str,
                    "lieferanten_id": int  # Optional
                }
            }
        """
        complete_info = self.get_article_complete_info(identifier)
        if not complete_info:
            return None
        
        # Für jetzt: Versuche über separaten API-Endpunkt (falls vorhanden)
        try:
            endpoint = f"/supplier/{identifier}"
            supplier_info = self._make_request('GET', endpoint)
            if supplier_info:
                return {
                    "standardlieferant": {
                        "name": supplier_info.get('name'),
                        "lieferantennummer": supplier_info.get('number'),
                        "lieferanten_id": supplier_info.get('id')
                    }
                }
        except:
            pass
        
        # Fallback: Leere Daten
        return {
            "standardlieferant": {
                "name": None,
                "lieferantennummer": None,
                "lieferanten_id": None
            }
        }
    
    def get_bom_pricing(self, identifier: Union[str, int]) -> Optional[List[Dict]]:
        """
        Holt Stücklistenpreise für einen Artikel
        
        Args:
            identifier: Artikelnummer (str) oder Artikel_ID (int)
        
        Returns:
            Liste mit Preis-Daten für jede Komponente
        """
        bom = self.get_bom(identifier, include_details=True)
        if not bom or not bom.get('components'):
            return []
        
        stuecklistenpreise = []
        for component in bom['components']:
            component_id = component.get('article_id')
            component_nr = component.get('article_number')
            
            if component_id:
                # Hole Preis-Daten für Komponente
                component_pricing = self.get_pricing_data(component_id)
                if component_pricing:
                    stuecklistenpreise.append({
                        "artikelnummer": component_nr,
                        "artikel_id": component_id,
                        "menge": component.get('amount', 1),
                        "einkaufspreis_netto": component_pricing.get('einkaufspreis_netto'),
                        "verkaufspreis_netto": component_pricing.get('verkaufspreis_netto')
                    })
        
        return stuecklistenpreise
    
    def get_article_complete_info(self, identifier: Union[str, int]) -> Optional[Dict]:
        """
        Holt vollständige Artikel-Info (nur für Initial-Speicherung!)
        
        WICHTIG: Diese Funktion wird NUR für Initial-Speicherung verwendet!
        Für Chatbot: Verwende get_pricing_data() und get_supplier_data()!
        
        Args:
            identifier: Artikelnummer (str) oder Artikel_ID (int)
        
        Returns:
            Vollständige Artikel-Info (für Initial-Speicherung)
        """
        endpoint = f"/articles/{identifier}"
        return self._make_request('GET', endpoint)
    
    def get_bom(self, identifier: Union[str, int], include_details: bool = False) -> Optional[Dict]:
        """
        Holt Stückliste für einen Artikel
        
        Args:
            identifier: Artikelnummer (str) oder Artikel_ID (int)
            include_details: Ob vollständige Komponenten-Daten geladen werden sollen
        
        Returns:
            Dict mit Stücklisten-Daten
        """
        endpoint = f"/bom/{identifier}"
        if include_details:
            endpoint += "?include_details=true"
        
        return self._make_request('GET', endpoint)
    
    def search_titles(self, query: str, limit: int = 20) -> List[Dict]:
        """
        Sucht Artikel nach Titel/Name
        
        Args:
            query: Suchbegriff (min. 3 Zeichen)
            limit: Maximale Anzahl Ergebnisse
        
        Returns:
            Liste von Artikeln
        """
        if len(query.strip()) < 3:
            logger.warning(f"Suchbegriff zu kurz: {query}")
            return []
        
        endpoint = f"/find/titles?q={query}"
        result = self._make_request('GET', endpoint)
        
        if result and isinstance(result, dict) and 'data' in result:
            articles = result['data']
            return articles[:limit] if isinstance(articles, list) else []
        
        return []
    
    def get_articles_stream(self) -> Iterator[Dict]:
        """
        Streamt alle Artikel (für Initial-Speicherung)
        
        WICHTIG: Nur für Initial-Speicherung aller Produkte!
        
        Returns:
            Iterator über Artikel
        """
        endpoint = "/articles/stream"
        url = f"{self.api_base}{endpoint}"
        
        try:
            response = self.session.get(url, stream=True, timeout=30)
            response.raise_for_status()
            
            # SSE-Stream parsen
            buffer = ""
            for line in response.iter_lines(decode_unicode=True):
                if line.startswith("data: "):
                    data_str = line[6:]  # Entferne "data: "
                    try:
                        import json
                        data = json.loads(data_str)
                        if data.get('type') == 'data' and 'articles' in data:
                            for article in data['articles']:
                                yield article
                    except json.JSONDecodeError:
                        logger.warning(f"Konnte SSE-Daten nicht parsen: {data_str}")
                        
        except requests.exceptions.RequestException as e:
            logger.error(f"Fehler beim Streamen von Artikeln: {e}")
            return


# Singleton-Instanz für einfache Verwendung
_default_client: Optional[PlatformAPIClient] = None

def get_platform_api_client(api_url: str = "http://87.106.191.206:5555", 
                           api_key: Optional[str] = None) -> PlatformAPIClient:
    """
    Gibt Singleton-Instanz des Platform-API-Clients zurück
    
    Args:
        api_url: Basis-URL der Platform-API
        api_key: Optional API-Key
    
    Returns:
        PlatformAPIClient-Instanz
    """
    global _default_client
    if _default_client is None:
        _default_client = PlatformAPIClient(api_url, api_key)
    return _default_client

