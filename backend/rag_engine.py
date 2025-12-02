"""
RAG-Engine für Qdrant-Abfragen
"""
from typing import List, Dict, Optional
from qdrant_client import QdrantClient
from qdrant_client.models import Filter, FieldCondition, MatchValue
import openai
import sys
import re
from pathlib import Path

# Pfad für Imports hinzufügen
CHATBOT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(CHATBOT_ROOT))

# Import Config (als Modul, nicht als Package)
from config import config as chatbot_config
QDRANT_URL = chatbot_config.QDRANT_URL
COLLECTION_NAME = chatbot_config.COLLECTION_NAME
OPENAI_API_KEY = chatbot_config.OPENAI_API_KEY
EMBEDDING_MODEL = chatbot_config.EMBEDDING_MODEL
MAX_SEARCH_RESULTS = chatbot_config.MAX_SEARCH_RESULTS
SIMILARITY_THRESHOLD = chatbot_config.SIMILARITY_THRESHOLD

class RAGEngine:
    """RAG-Engine für semantische Produktsuche in Qdrant"""
    
    def __init__(self):
        self.qdrant_client = QdrantClient(url=QDRANT_URL)
        self.openai_client = openai.OpenAI(api_key=OPENAI_API_KEY)
        self.embedding_model = EMBEDDING_MODEL
        self.COLLECTION_NAME = COLLECTION_NAME
        
    def create_embedding(self, text: str) -> List[float]:
        """Erstellt Embedding für Text"""
        try:
            response = self.openai_client.embeddings.create(
                model=self.embedding_model,
                input=text[:8000]  # Token-Limit
            )
            return response.data[0].embedding
        except Exception as e:
            print(f"Fehler beim Erstellen des Embeddings: {e}")
            return None
    
    def search_products(
        self,
        query: str,
        limit: int = MAX_SEARCH_RESULTS,
        produkttyp: Optional[str] = None,
        min_score: float = SIMILARITY_THRESHOLD
    ) -> List[Dict]:
        """Sucht Produkte in Qdrant basierend auf semantischer Ähnlichkeit"""
        
        # Embedding für Query erstellen
        query_embedding = self.create_embedding(query)
        if not query_embedding:
            return []
        
        # Filter erstellen (optional nach Produkttyp)
        filter_condition = None
        if produkttyp:
            filter_condition = Filter(
                must=[
                    FieldCondition(
                        key="produkttyp",
                        match=MatchValue(value=produkttyp)
                    )
                ]
            )
        
        # Suche in Qdrant (neue API: query_points statt search)
        try:
            search_result = self.qdrant_client.query_points(
                collection_name=COLLECTION_NAME,
                query=query_embedding,
                query_filter=filter_condition,
                limit=limit,
                score_threshold=min_score
            )
            
            # Ergebnisse formatieren (query_points gibt .points zurück)
            products = []
            results = search_result.points if hasattr(search_result, 'points') else search_result
            for result in results:
                product = {
                    "id": result.id,
                    "score": result.score,
                    "artikelnummer": result.payload.get("artikelnummer", ""),
                    "artikelname": result.payload.get("artikelname", ""),
                    "produkttyp": result.payload.get("produkttyp", ""),
                    "hersteller": result.payload.get("hersteller", ""),
                    "kategoriepfad": result.payload.get("kategoriepfad", ""),
                    "beschreibung": result.payload.get("beschreibung", ""),
                    "kurzbeschreibung": result.payload.get("kurzbeschreibung", ""),
                    "payload": result.payload  # Vollständige Daten
                }
                products.append(product)
            
            return products
        except Exception as e:
            print(f"Fehler bei Qdrant-Suche: {e}")
            return []
    
    def get_product_by_artikelnummer(self, artikelnummer: str) -> Optional[Dict]:
        """Holt ein Produkt anhand der Artikelnummer (exakt)"""
        try:
            # Suche mit Filter nach Artikelnummer
            filter_condition = Filter(
                must=[
                    FieldCondition(
                        key="artikelnummer",
                        match=MatchValue(value=artikelnummer)
                    )
                ]
            )
            
            results = self.qdrant_client.scroll(
                collection_name=COLLECTION_NAME,
                scroll_filter=filter_condition,
                limit=1
            )
            
            # scroll gibt (points, next_page_offset) zurück
            points, _ = results if isinstance(results, tuple) else (results, None)
            
            if points and len(points) > 0:
                point = points[0]
                return {
                    "id": point.id,
                    "artikelnummer": point.payload.get("artikelnummer", ""),
                    "artikelname": point.payload.get("artikelname", ""),
                    "produkttyp": point.payload.get("produkttyp", ""),
                    "hersteller": point.payload.get("hersteller", ""),
                    "kategoriepfad": point.payload.get("kategoriepfad", ""),
                    "beschreibung": point.payload.get("beschreibung", ""),
                    "kurzbeschreibung": point.payload.get("kurzbeschreibung", ""),
                    "payload": point.payload
                }
        except Exception as e:
            print(f"Fehler beim Abrufen des Produkts: {e}")
        
        return None
    
    def search_by_partial_artikelnummer(self, partial_artikelnummer: str, limit: int = 10) -> List[Dict]:
        """Sucht Produkte nach teilweiser Artikelnummer (z.B. '1703574' findet '1703574-001', '1703574-002', etc.)"""
        try:
            # Hole alle Produkte und filtere nach teilweiser Artikelnummer
            results = self.qdrant_client.scroll(
                collection_name=COLLECTION_NAME,
                limit=10000  # Hole mehr für Filterung
            )
            
            points, _ = results if isinstance(results, tuple) else (results, None)
            
            # Filtere nach teilweiser Artikelnummer (beginnt mit)
            matching_products = []
            
            for point in points:
                artikelnummer_full = point.payload.get("artikelnummer", "")
                
                # Prüfe ob die vollständige Artikelnummer mit der teilweisen beginnt
                if artikelnummer_full.startswith(partial_artikelnummer):
                    product = {
                        "id": point.id,
                        "score": 0.95 if artikelnummer_full == partial_artikelnummer else 0.9,  # Exakt = 0.95, Teil = 0.9
                        "artikelnummer": artikelnummer_full,
                        "artikelname": point.payload.get("artikelname", ""),
                        "produkttyp": point.payload.get("produkttyp", ""),
                        "hersteller": point.payload.get("hersteller", ""),
                        "kategoriepfad": point.payload.get("kategoriepfad", ""),
                        "beschreibung": point.payload.get("beschreibung", ""),
                        "kurzbeschreibung": point.payload.get("kurzbeschreibung", ""),
                        "payload": point.payload
                    }
                    matching_products.append(product)
            
            # Sortiere nach Score (exakte Übereinstimmungen zuerst)
            matching_products.sort(key=lambda x: x["score"], reverse=True)
            
            return matching_products[:limit]
        except Exception as e:
            print(f"Fehler bei teilweiser Artikelnummer-Suche: {e}")
            return []
    
    def search_by_hersteller(self, hersteller: str, produkttyp: Optional[str] = None, limit: int = 10) -> List[Dict]:
        """Sucht Produkte nach Hersteller (case-insensitive) - nur wenn Hersteller-Feld nicht leer ist"""
        try:
            # Hole alle Produkte und filtere nach Hersteller
            results = self.qdrant_client.scroll(
                collection_name=COLLECTION_NAME,
                limit=10000  # Hole mehr für Filterung
            )
            
            points, _ = results if isinstance(results, tuple) else (results, None)
            
            # Filtere nach Hersteller (case-insensitive, teilweise Übereinstimmung)
            hersteller_lower = hersteller.lower()
            matching_products = []
            
            for point in points:
                hersteller_full = point.payload.get("hersteller", "").strip()
                
                # WICHTIG: Nur Produkte mit nicht-leerem Hersteller-Feld
                if not hersteller_full:
                    continue
                
                hersteller_full_lower = hersteller_full.lower()
                produkttyp_full = point.payload.get("produkttyp", "")
                
                # Prüfe ob Hersteller übereinstimmt (teilweise oder exakt)
                if hersteller_lower in hersteller_full_lower or hersteller_full_lower in hersteller_lower:
                    # Optional: Filter nach Produkttyp
                    if produkttyp and produkttyp_full:
                        # Erweitere Suche: "wechselrichter" sollte auch "stringwechselrichter" und "hybridwechselrichter" finden
                        if produkttyp == "wechselrichter":
                            if "wechselrichter" not in produkttyp_full.lower():
                                continue
                        elif produkttyp not in produkttyp_full.lower():
                            continue
                    
                    product = {
                        "id": point.id,
                        "score": 0.85,  # Hersteller-Match
                        "artikelnummer": point.payload.get("artikelnummer", ""),
                        "artikelname": point.payload.get("artikelname", ""),
                        "produkttyp": produkttyp_full,
                        "hersteller": hersteller_full,
                        "kategoriepfad": point.payload.get("kategoriepfad", ""),
                        "beschreibung": point.payload.get("beschreibung", ""),
                        "kurzbeschreibung": point.payload.get("kurzbeschreibung", ""),
                        "payload": point.payload
                    }
                    matching_products.append(product)
            
            # Sortiere nach Score
            matching_products.sort(key=lambda x: x["score"], reverse=True)
            
            return matching_products[:limit]
        except Exception as e:
            print(f"Fehler bei Hersteller-Suche: {e}")
            return []
    
    def search_by_artikelname(self, artikelname: str, limit: int = 10) -> List[Dict]:
        """Sucht Produkte nach Artikelname (exakt oder teilweise)"""
        try:
            # Hole alle Produkte und filtere nach Artikelname
            results = self.qdrant_client.scroll(
                collection_name=COLLECTION_NAME,
                limit=1000  # Hole mehr für Filterung
            )
            
            points, _ = results if isinstance(results, tuple) else (results, None)
            
            # Filtere nach Artikelname (case-insensitive, teilweise Übereinstimmung)
            artikelname_lower = artikelname.lower().strip()
            matching_products = []
            
            # FIX: Mindestlänge für Suche (verhindert leere/zu kurze Suchen)
            if len(artikelname_lower) < 3:
                return []
            
            for point in points:
                artikelname_full = point.payload.get("artikelname", "").lower().strip()
                
                # FIX: Überspringe Produkte mit leerem oder zu kurzem Artikelnamen
                # Dies verhindert, dass "" in "suchbegriff" == True matcht
                if len(artikelname_full) < 3:
                    continue
                
                # Exakte Übereinstimmung oder Teilstring
                # WICHTIG: Nur prüfen wenn artikelname_full NICHT leer ist (bereits oben gefiltert)
                if artikelname_lower in artikelname_full or artikelname_full in artikelname_lower:
                    product = {
                        "id": point.id,
                        "score": 1.0 if artikelname_lower == artikelname_full else 0.8,  # Exakt = 1.0, Teil = 0.8
                        "artikelnummer": point.payload.get("artikelnummer", ""),
                        "artikelname": point.payload.get("artikelname", ""),
                        "produkttyp": point.payload.get("produkttyp", ""),
                        "hersteller": point.payload.get("hersteller", ""),
                        "kategoriepfad": point.payload.get("kategoriepfad", ""),
                        "beschreibung": point.payload.get("beschreibung", ""),
                        "kurzbeschreibung": point.payload.get("kurzbeschreibung", ""),
                        "payload": point.payload
                    }
                    matching_products.append(product)
            
            # Sortiere nach Score (exakte Übereinstimmungen zuerst)
            matching_products.sort(key=lambda x: x["score"], reverse=True)
            
            return matching_products[:limit]
        except Exception as e:
            print(f"Fehler bei Artikelname-Suche: {e}")
            return []
    
    def smart_search(
        self,
        query: str,
        limit: int = MAX_SEARCH_RESULTS,
        produkttyp: Optional[str] = None,
        min_score: float = 0.3
    ) -> List[Dict]:
        """Intelligente Suche: Artikelnummer → Teilweise Artikelnummer → Hersteller → Artikelname → Semantisch"""
        results = []
        seen_artikelnummern = set()
        
        # Hilfsfunktion zum Hinzufügen ohne Duplikate
        def add_product(product, match_type):
            artikelnummer = product.get("artikelnummer", "")
            if artikelnummer and artikelnummer not in seen_artikelnummern:
                product["match_type"] = match_type
                results.append(product)
                seen_artikelnummern.add(artikelnummer)
        
        # 1. Prüfe ob es eine vollständige Artikelnummer ist (7-stellig, optional mit -xxx)
        artikelnummern = re.findall(r'\b\d{7}(?:-\d{3})?\b', query)
        found_exact_artikelnummer = False
        if artikelnummern:
            for artikelnummer in artikelnummern:
                product = self.get_product_by_artikelnummer(artikelnummer)
                if product:
                    found_exact_artikelnummer = True
                    add_product({
                        "id": product["id"],
                        "score": 1.0,  # Exakte Artikelnummer = höchste Priorität
                        "artikelnummer": product["artikelnummer"],
                        "artikelname": product["artikelname"],
                        "produkttyp": product.get("produkttyp", ""),
                        "hersteller": product.get("hersteller", ""),
                        "kategoriepfad": product.get("kategoriepfad", ""),
                        "beschreibung": product.get("beschreibung", ""),
                        "kurzbeschreibung": product.get("kurzbeschreibung", ""),
                        "payload": product.get("payload", {})
                    }, "artikelnummer")
        
        # 2. Prüfe ob es eine teilweise Artikelnummer ist (mindestens 4 Ziffern)
        # Wenn keine exakte Übereinstimmung gefunden wurde, suche nach teilweisen
        if len(results) < limit:
            # Finde alle Zahlen mit 4-10 Ziffern
            all_numbers = re.findall(r'\b\d{4,10}\b', query)
            # Wenn keine exakte Übereinstimmung, verwende alle Zahlen; sonst nur die nicht-exakten
            if not found_exact_artikelnummer:
                partial_numbers = all_numbers
            else:
                partial_numbers = [num for num in all_numbers if num not in artikelnummern]
            
            for partial_num in partial_numbers:
                partial_results = self.search_by_partial_artikelnummer(partial_num, limit=limit - len(results))
                for product in partial_results:
                    add_product(product, "artikelnummer_teilweise")
        
        # 3. Extrahiere Hersteller-Namen aus der Query (häufige Hersteller)
        if len(results) < limit:
            hersteller_keywords = ["deye", "victron", "pylontech", "inlium", "votronic", "husatech", "sofar"]
            query_lower = query.lower()
            found_hersteller = None
            found_produkttyp = None
            
            for hersteller in hersteller_keywords:
                if hersteller in query_lower:
                    found_hersteller = hersteller
                    break
            
            # Extrahiere Produkttyp aus Query
            produkttyp_keywords = {
                "wechselrichter": ["wechselrichter", "inverter"],
                "stringwechselrichter": ["stringwechselrichter", "string wechselrichter"],
                "hybridwechselrichter": ["hybridwechselrichter", "hybrid wechselrichter", "hybrid"],
                "batterie": ["batterie", "battery", "akku"],
                "speichersystem": ["speichersystem", "speicher", "storage"],
                "solarmodul": ["solarmodul", "panel", "modul"]
            }
            
            for typ, keywords in produkttyp_keywords.items():
                if any(keyword in query_lower for keyword in keywords):
                    found_produkttyp = typ
                    break
            
            # Suche nach Hersteller (mit optionalem Produkttyp)
            if found_hersteller:
                # Suche ohne Produkttyp-Filter zuerst (um alle Produkte des Herstellers zu finden)
                hersteller_results = self.search_by_hersteller(
                    found_hersteller,
                    produkttyp=None,  # Kein Filter, um alle Produkte zu finden
                    limit=limit - len(results)
                )
                
                # Wenn ein Produkttyp gefunden wurde, filtere die Ergebnisse
                if found_produkttyp:
                    # Erweitere die Suche: "wechselrichter" sollte auch "stringwechselrichter" und "hybridwechselrichter" finden
                    if found_produkttyp == "wechselrichter":
                        filtered_results = [r for r in hersteller_results 
                                          if "wechselrichter" in r.get("produkttyp", "").lower()]
                    else:
                        filtered_results = [r for r in hersteller_results 
                                          if found_produkttyp in r.get("produkttyp", "").lower()]
                    
                    # Wenn gefilterte Ergebnisse vorhanden, verwende diese; sonst alle
                    if filtered_results:
                        hersteller_results = filtered_results
                
                for product in hersteller_results:
                    add_product(product, "hersteller")
        
        # 4. Suche nach Artikelname (wenn noch nicht genug Ergebnisse)
        if len(results) < limit:
            artikelname_results = self.search_by_artikelname(query, limit=limit - len(results))
            for product in artikelname_results:
                add_product(product, "artikelname")
        
        # 5. Semantische Suche (wenn noch nicht genug Ergebnisse)
        if len(results) < limit:
            semantic_results = self.search_products(
                query=query,
                limit=limit - len(results),
                produkttyp=produkttyp,
                min_score=min_score
            )
            for product in semantic_results:
                add_product(product, "semantisch")
        
        # Sortiere nach Score (höchste zuerst)
        results.sort(key=lambda x: x.get("score", 0), reverse=True)
        
        return results[:limit]
    
    def compare_products(self, artikelnummern: List[str]) -> List[Dict]:
        """Vergleicht mehrere Produkte anhand ihrer Artikelnummern"""
        products = []
        for artikelnummer in artikelnummern:
            product = self.get_product_by_artikelnummer(artikelnummer)
            if product:
                products.append(product)
        return products
    
    def find_matching_storage(
        self,
        pv_leistung_kwp: float,
        stromverbrauch_kwh: Optional[float] = None,
        autarkie_wunsch: Optional[float] = None
    ) -> List[Dict]:
        """Findet passende Speichersysteme für eine PV-Anlage"""
        
        # Query für Speichersuche erstellen
        query_parts = ["Speichersystem", "Batteriespeicher"]
        
        if pv_leistung_kwp:
            query_parts.append(f"{pv_leistung_kwp} kWp PV-Anlage")
        
        if stromverbrauch_kwh:
            # Faustformel: Speicher sollte 1-2 Tage Verbrauch abdecken
            empfohlene_kapazitaet = stromverbrauch_kwh * 1.5 / 365  # Tagesverbrauch * 1.5
            query_parts.append(f"{empfohlene_kapazitaet:.1f} kWh Speicherkapazität")
        
        query = " ".join(query_parts)
        
        # Suche nach Speichersystemen
        products = self.search_products(
            query=query,
            produkttyp="speichersystem",
            limit=10
        )
        
        # Zusätzlich nach Batterien suchen
        battery_products = self.search_products(
            query=query,
            produkttyp="batterie",
            limit=5
        )
        
        # Kombiniere und sortiere nach Relevanz
        all_products = products + battery_products
        all_products.sort(key=lambda x: x["score"], reverse=True)
        
        return all_products[:10]  # Top 10 Ergebnisse
    
    def find_pv_components(
        self,
        gewuenschte_leistung_kwp: float,
        mit_speicher: bool = True,
        notstromfaehig: bool = False,
        balkonkraftwerk: bool = False
    ) -> Dict[str, List[Dict]]:
        """
        Findet passende PV-Komponenten und Sets.
        
        PRIORITÄT:
        1. Fertige Sets (mit Stückliste) - optimal zusammengestellt
        2. Einzelkomponenten (Solarmodule, Wechselrichter, Speicher)
        
        Args:
            gewuenschte_leistung_kwp: Gewünschte PV-Leistung in kWp
            mit_speicher: Ob Speicher gewünscht ist
            notstromfaehig: Ob Notstromfähigkeit gewünscht ist
            balkonkraftwerk: Ob es ein Balkonkraftwerk sein soll
        
        Returns:
            Dict mit kategorisierten Produkten:
            {
                "sets": [...],              # Fertige Sets mit Stückliste
                "solarmodule": [...],       # Einzelne Solarmodule
                "wechselrichter": [...],    # Wechselrichter
                "speichersysteme": [...]    # Speicher (wenn gewünscht)
            }
        """
        try:
            # Hole alle Produkte
            results = self.qdrant_client.scroll(
                collection_name=COLLECTION_NAME,
                limit=10000
            )
            
            points, _ = results if isinstance(results, tuple) else (results, None)
            
            # Kategorisiere Produkte
            sets = []
            solarmodule = []
            wechselrichter = []
            speichersysteme = []
            
            for point in points:
                payload = point.payload
                produkttyp = payload.get("produkttyp", "").lower()
                kompatibilitaet = payload.get("kompatibilitaet", {})
                stueckliste = kompatibilitaet.get("stueckliste", [])
                
                product = {
                    "id": point.id,
                    "artikelnummer": payload.get("artikelnummer", ""),
                    "artikelname": payload.get("artikelname", ""),
                    "produkttyp": payload.get("produkttyp", ""),
                    "hersteller": payload.get("hersteller", ""),
                    "kurzbeschreibung": payload.get("kurzbeschreibung", ""),
                    "kategoriepfad": payload.get("kategoriepfad", ""),
                    "payload": payload
                }
                
                # 1. SETS: Produkte mit Stückliste (fertige Kombinationen)
                if stueckliste and len(stueckliste) >= 2:
                    # Prüfe ob das Set zur gewünschten Leistung passt
                    name_lower = payload.get("artikelname", "").lower()
                    
                    # Extrahiere kW/kWp aus dem Namen
                    kw_match = re.search(r'(\d+(?:[.,]\d+)?)\s*(?:kw|kwp)', name_lower)
                    kwh_match = re.search(r'(\d+(?:[.,]\d+)?)\s*kwh', name_lower)
                    
                    set_leistung_kw = None
                    if kw_match:
                        set_leistung_kw = float(kw_match.group(1).replace(',', '.'))
                    
                    # Berechne Score basierend auf Passgenauigkeit
                    score = 0.5  # Basis-Score für Sets
                    
                    if set_leistung_kw:
                        # Score erhöhen wenn Leistung ähnlich
                        diff_ratio = abs(set_leistung_kw - gewuenschte_leistung_kwp) / max(gewuenschte_leistung_kwp, 1)
                        if diff_ratio < 0.2:  # ±20%
                            score = 0.95
                        elif diff_ratio < 0.5:  # ±50%
                            score = 0.8
                        else:
                            score = 0.6
                    
                    # Notstrom-Filter
                    if notstromfaehig:
                        if "notstrom" in name_lower or "backup" in name_lower or "ersatz" in name_lower:
                            score += 0.1
                    
                    # Speicher-Filter
                    if mit_speicher:
                        if kwh_match or "speicher" in name_lower or "batterie" in name_lower:
                            score += 0.1
                        else:
                            score -= 0.2  # Abwerten wenn kein Speicher aber gewünscht
                    
                    product["score"] = min(score, 1.0)
                    product["stueckliste"] = stueckliste
                    product["ist_set"] = True
                    sets.append(product)
                
                # 2. BALKONKRAFTWERK: Mikrowechselrichter
                elif balkonkraftwerk and produkttyp == "mikrowechselrichter":
                    product["score"] = 0.85
                    wechselrichter.append(product)
                
                # 3. SOLARMODULE
                elif produkttyp == "solarmodul":
                    # Extrahiere Watt aus dem Namen
                    name_lower = payload.get("artikelname", "").lower()
                    watt_match = re.search(r'(\d+)\s*w(?:att)?', name_lower)
                    
                    if watt_match:
                        modul_watt = int(watt_match.group(1))
                        # Berechne wie viele Module für gewünschte Leistung
                        benoetigte_module = (gewuenschte_leistung_kwp * 1000) / modul_watt
                        product["benoetigte_anzahl"] = round(benoetigte_module)
                        product["modul_leistung_w"] = modul_watt
                        product["score"] = 0.7
                    else:
                        product["score"] = 0.5
                    
                    solarmodule.append(product)
                
                # 4. WECHSELRICHTER (Hybrid & String)
                elif "wechselrichter" in produkttyp:
                    name_lower = payload.get("artikelname", "").lower()
                    
                    # Extrahiere kW aus dem Namen
                    kw_match = re.search(r'(\d+(?:[.,]\d+)?)\s*kw', name_lower)
                    
                    score = 0.6
                    if kw_match:
                        wr_leistung_kw = float(kw_match.group(1).replace(',', '.'))
                        # Score erhöhen wenn Leistung ähnlich
                        diff_ratio = abs(wr_leistung_kw - gewuenschte_leistung_kwp) / max(gewuenschte_leistung_kwp, 1)
                        if diff_ratio < 0.3:
                            score = 0.85
                        elif diff_ratio < 0.6:
                            score = 0.7
                    
                    # Hybrid bevorzugen wenn Speicher gewünscht
                    if mit_speicher and "hybrid" in produkttyp:
                        score += 0.1
                    
                    # Notstrom-Filter
                    if notstromfaehig:
                        if "notstrom" in name_lower or "backup" in name_lower:
                            score += 0.1
                    
                    product["score"] = min(score, 1.0)
                    wechselrichter.append(product)
                
                # 5. SPEICHERSYSTEME (wenn gewünscht)
                elif mit_speicher and produkttyp in ["speichersystem", "batterie"]:
                    name_lower = payload.get("artikelname", "").lower()
                    
                    # Extrahiere kWh aus dem Namen
                    kwh_match = re.search(r'(\d+(?:[.,]\d+)?)\s*kwh', name_lower)
                    
                    score = 0.6
                    if kwh_match:
                        speicher_kwh = float(kwh_match.group(1).replace(',', '.'))
                        # Empfohlene Speichergröße: ca. 1-1.5 kWh pro kWp
                        empfohlen_kwh = gewuenschte_leistung_kwp * 1.2
                        diff_ratio = abs(speicher_kwh - empfohlen_kwh) / max(empfohlen_kwh, 1)
                        if diff_ratio < 0.3:
                            score = 0.85
                        elif diff_ratio < 0.6:
                            score = 0.7
                    
                    product["score"] = min(score, 1.0)
                    speichersysteme.append(product)
            
            # Sortiere alle Listen nach Score
            sets.sort(key=lambda x: x.get("score", 0), reverse=True)
            solarmodule.sort(key=lambda x: x.get("score", 0), reverse=True)
            wechselrichter.sort(key=lambda x: x.get("score", 0), reverse=True)
            speichersysteme.sort(key=lambda x: x.get("score", 0), reverse=True)
            
            return {
                "sets": sets[:10],  # Top 10 Sets
                "solarmodule": solarmodule[:5],
                "wechselrichter": wechselrichter[:5],
                "speichersysteme": speichersysteme[:5] if mit_speicher else []
            }
            
        except Exception as e:
            print(f"Fehler bei PV-Komponenten-Suche: {e}")
            return {
                "sets": [],
                "solarmodule": [],
                "wechselrichter": [],
                "speichersysteme": []
            }

