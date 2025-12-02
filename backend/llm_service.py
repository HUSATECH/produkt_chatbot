"""
LLM-Service für Chatbot-Konversationen

Verwendet den PromptManager für alle Prompts und Keywords.
"""
from typing import List, Dict, Optional
import openai
import json
import sys
from pathlib import Path

# Pfad für Imports hinzufügen
CHATBOT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(CHATBOT_ROOT))

# Import Config (als Modul, nicht als Package)
from config import config as chatbot_config
OPENAI_API_KEY = chatbot_config.OPENAI_API_KEY
OPENAI_MODEL_CHAT = chatbot_config.OPENAI_MODEL_CHAT
OPENAI_MODEL_COMPARE = chatbot_config.OPENAI_MODEL_COMPARE
OPENAI_MODEL_RECOMMENDATION = chatbot_config.OPENAI_MODEL_RECOMMENDATION
MAX_SEARCH_RESULTS = chatbot_config.MAX_SEARCH_RESULTS
PLATFORM_API_URL = chatbot_config.PLATFORM_API_URL
from backend.rag_engine import RAGEngine

# Import PromptManager für zentrale Prompt-Verwaltung
from prompts.prompt_manager import get_prompt_manager

# Import PlatformAPIClient aus RAG-System
RAG_SYSTEM_LIBS = Path(__file__).parent.parent.parent / "RAG-System" / "libs"
if RAG_SYSTEM_LIBS.exists():
    sys.path.insert(0, str(RAG_SYSTEM_LIBS))
    from platform_api_client import PlatformAPIClient
else:
    raise ImportError(f"RAG-System/libs nicht gefunden: {RAG_SYSTEM_LIBS}")

class LLMService:
    """Service für LLM-Interaktionen mit RAG-Unterstützung
    
    Verwendet verschiedene Modelle für verschiedene Aufgaben:
    - GPT-4o für normalen Chat (gute Qualität, nicht zu teuer)
    - GPT-5.1 für Produktvergleiche (beste Qualität)
    - GPT-5.1 für PV-Empfehlungen (beste Qualität)
    
    Alle Prompts werden über den PromptManager geladen und sind bearbeitbar.
    """
    
    def __init__(self):
        self.openai_client = openai.OpenAI(api_key=OPENAI_API_KEY)
        self.model_chat = OPENAI_MODEL_CHAT
        self.model_compare = OPENAI_MODEL_COMPARE
        self.model_recommendation = OPENAI_MODEL_RECOMMENDATION
        self.rag_engine = RAGEngine()
        self.platform_api_client = PlatformAPIClient(api_url=PLATFORM_API_URL)
        
        # PromptManager für zentrale Prompt-Verwaltung
        self.prompt_manager = get_prompt_manager()
        
        # Keywords aus PromptManager laden
        self._load_keywords()
    
    def _load_keywords(self):
        """Lädt Keywords aus dem PromptManager."""
        self.pdf_detail_keywords = self.prompt_manager.get_pdf_detail_keywords()
        self.vektor_text_keywords = self.prompt_manager.get_vektor_text_keywords()
        self.followup_keywords = self.prompt_manager.get_followup_keywords()
    
    def reload_prompts(self):
        """
        Lädt alle Prompts und Keywords neu.
        
        Wird aufgerufen wenn Prompts über die UI geändert wurden.
        """
        self.prompt_manager.load_prompts()
        self._load_keywords()
        print("✅ LLMService: Prompts und Keywords neu geladen")
    
    def create_system_prompt(self) -> str:
        """Erstellt System-Prompt für den Chatbot aus dem PromptManager."""
        return self.prompt_manager.get_chat_system_prompt()
    
    def format_product_context(self, products: List[Dict]) -> str:
        """Formatiert Produktdaten für LLM-Kontext"""
        if not products:
            return "Keine passenden Produkte gefunden."
        
        context_parts = []
        for i, product in enumerate(products, 1):
            payload = product.get("payload", {})
            
            product_info = f"""
Produkt {i}:
- Artikelnummer: {product.get('artikelnummer', 'N/A')}
- Name: {product.get('artikelname', 'N/A')}
- Produkttyp: {product.get('produkttyp', 'N/A')}
- Hersteller: {product.get('hersteller', 'N/A')}
- Kategorie: {product.get('kategoriepfad', 'N/A')}
- Ähnlichkeits-Score: {product.get('score', 0):.2f}
"""
            
            # Kurzbeschreibung hinzufügen
            if product.get('kurzbeschreibung'):
                product_info += f"- Kurzbeschreibung: {product['kurzbeschreibung'][:200]}\n"
            
            # Produktspezifische Spezifikationen hinzufügen
            produkttyp = product.get('produkttyp', '')
            if produkttyp == 'batterie' and payload.get('batterie_spezifikationen'):
                specs = payload['batterie_spezifikationen']
                product_info += f"- Kapazität: {specs.get('kapazitaet_ah', 'N/A')} Ah / {specs.get('kapazitaet_kwh', 'N/A')} kWh\n"
                product_info += f"- Spannung: {specs.get('spannung_v', 'N/A')} V\n"
                product_info += f"- Zelltyp: {specs.get('zelltyp', 'N/A')}\n"
            
            elif produkttyp == 'speichersystem' and payload.get('speichersystem_spezifikationen'):
                specs = payload['speichersystem_spezifikationen']
                product_info += f"- Speicherkapazität: {specs.get('speicherkapazitaet_kwh', 'N/A')} kWh\n"
                product_info += f"- Wechselrichter integriert: {specs.get('wechselrichter_integriert', False)}\n"
                if specs.get('wechselrichter_leistung_w'):
                    product_info += f"- Wechselrichter-Leistung: {specs.get('wechselrichter_leistung_w')} W\n"
            
            elif produkttyp == 'wechselrichter' and payload.get('wechselrichter_spezifikationen'):
                specs = payload['wechselrichter_spezifikationen']
                product_info += f"- Nennleistung: {specs.get('nennleistung_w', 'N/A')} W\n"
                product_info += f"- Eingangsspannung: {specs.get('eingangsspannung_v', 'N/A')} V\n"
                product_info += f"- Ausgangsspannung: {specs.get('ausgangsspannung_v', 'N/A')} V\n"
            
            # WICHTIG: Kompatibilitäts-Daten hinzufügen (für Phase 2 Test)
            kompatibilitaet = payload.get('kompatibilitaet', {})
            if kompatibilitaet:
                kompatible_artikelnummern = kompatibilitaet.get('kompatible_artikelnummern', [])
                kompatible_produkttypen = kompatibilitaet.get('kompatible_produkttypen', [])
                stueckliste = kompatibilitaet.get('stueckliste', [])
                
                if kompatible_artikelnummern:
                    product_info += f"- Kompatible Artikelnummern: {', '.join(kompatible_artikelnummern[:5])}"
                    if len(kompatible_artikelnummern) > 5:
                        product_info += f" (+ {len(kompatible_artikelnummern) - 5} weitere)\n"
                    else:
                        product_info += "\n"
                
                if kompatible_produkttypen:
                    product_info += f"- Kompatible Produkttypen: {', '.join(kompatible_produkttypen)}\n"
                
                if stueckliste:
                    product_info += f"- Stückliste ({len(stueckliste)} Komponenten):\n"
                    for komponente in stueckliste[:5]:  # Erste 5 Komponenten
                        artikelnummer = komponente.get('artikelnummer', 'N/A')
                        menge = komponente.get('menge', 1)
                        rolle = komponente.get('rolle', 'Komponente')
                        product_info += f"  * {menge}x {artikelnummer} ({rolle})\n"
                    if len(stueckliste) > 5:
                        product_info += f"  ... und {len(stueckliste) - 5} weitere Komponenten\n"
            
            context_parts.append(product_info)
        
        return "\n".join(context_parts)
    
    def format_product_context_detailed(self, products: List[Dict], use_vektor_text: bool = False) -> str:
        """
        Formatiert Produktdaten MIT detaillierten PDF-Informationen.
        
        Wird verwendet wenn der Kunde nach technischen Details, Datenblättern
        oder spezifischen Spezifikationen fragt.
        
        Args:
            products: Liste der gefundenen Produkte
            use_vektor_text: Wenn True, nutze vektor_text für strukturierte Übersicht
        """
        if not products:
            return "Keine passenden Produkte gefunden."
        
        context_parts = []
        for i, product in enumerate(products, 1):
            payload = product.get("payload", {})
            
            # Basis-Informationen
            product_info = f"""
═══════════════════════════════════════════════════════════════════
PRODUKT {i}: {product.get('artikelname', 'N/A')}
═══════════════════════════════════════════════════════════════════
📦 Artikelnummer: {product.get('artikelnummer', 'N/A')}
🏭 Hersteller: {product.get('hersteller', 'N/A')}
🏷️ Produkttyp: {product.get('produkttyp', 'N/A')}
📁 Kategorie: {product.get('kategoriepfad', 'N/A')}
"""
            
            # Option 1: vektor_text verwenden (strukturierte Übersicht)
            if use_vektor_text and payload.get('vektor_text'):
                vektor = payload['vektor_text']
                # Begrenze auf 12000 Zeichen für Token-Limit
                if len(vektor) > 12000:
                    vektor = vektor[:12000] + "\n\n[... weitere Details verfügbar ...]"
                product_info += f"\n📊 VOLLSTÄNDIGE PRODUKTDATEN:\n{vektor}\n"
            else:
                # Option 2: Einzelfelder kombinieren (für gezielte PDF-Fragen)
                
                # Vollständige Beschreibung
                beschreibung = payload.get('beschreibung', '')
                if beschreibung:
                    # HTML-Tags entfernen
                    import re
                    beschreibung_clean = re.sub(r'<[^>]+>', ' ', beschreibung)
                    beschreibung_clean = re.sub(r'&[a-z]+;', '', beschreibung_clean)
                    beschreibung_clean = re.sub(r'\s+', ' ', beschreibung_clean).strip()
                    product_info += f"\n📝 PRODUKTBESCHREIBUNG:\n{beschreibung_clean[:3000]}\n"
                
                # Alle produktspezifischen Spezifikationen
                produkttyp = product.get('produkttyp', '')
                specs_key = f"{produkttyp}_spezifikationen"
                specs = payload.get(specs_key, {})
                
                # Fallback auf andere Spezifikationsfelder
                if not specs:
                    for key in payload.keys():
                        if key.endswith('_spezifikationen') and payload[key]:
                            specs = payload[key]
                            specs_key = key
                            break
                
                if specs and isinstance(specs, dict):
                    product_info += f"\n📊 TECHNISCHE SPEZIFIKATIONEN ({specs_key.replace('_', ' ').upper()}):\n"
                    for key, value in specs.items():
                        if value is not None and value != '' and value != []:
                            label = key.replace('_', ' ').title()
                            if isinstance(value, list):
                                value = ', '.join(map(str, value))
                            elif isinstance(value, bool):
                                value = 'Ja' if value else 'Nein'
                            product_info += f"  • {label}: {value}\n"
                
                # PDF-DOKUMENTE - Das Herzstück für detaillierte Anfragen!
                pdf_texte = payload.get('pdf_texte', [])
                if pdf_texte:
                    product_info += f"\n📄 DATENBLATT-INFORMATIONEN ({len(pdf_texte)} Dokument(e)):\n"
                    product_info += "─" * 50 + "\n"
                    for j, pdf_text in enumerate(pdf_texte[:2], 1):  # Max 2 PDFs für Token-Limit
                        # Begrenze auf 5000 Zeichen pro PDF
                        pdf_preview = pdf_text[:5000]
                        if len(pdf_text) > 5000:
                            pdf_preview += "\n[... weitere Details im vollständigen Datenblatt ...]"
                        product_info += f"\n📄 Dokument {j}:\n{pdf_preview}\n"
                        product_info += "─" * 50 + "\n"
                
                # Sicherheit & Zertifizierungen
                sicherheit = payload.get('sicherheit', {})
                if sicherheit and isinstance(sicherheit, dict):
                    product_info += f"\n🔒 SICHERHEIT & ZERTIFIZIERUNGEN:\n"
                    for key, value in sicherheit.items():
                        if value:
                            label = key.replace('_', ' ').title()
                            if isinstance(value, list):
                                value = ', '.join(map(str, value))
                            product_info += f"  • {label}: {value}\n"
                
                # Gewicht & Maße
                gewicht_felder = ['Artikelgewicht_kg', 'Versandgewicht_kg', 'Laenge_cm', 'Breite_cm', 'Hoehe_cm']
                gewicht_info = []
                for feld in gewicht_felder:
                    if payload.get(feld):
                        label = feld.replace('_', ' ').replace('kg', '(kg)').replace('cm', '(cm)')
                        gewicht_info.append(f"{label}: {payload[feld]}")
                if gewicht_info:
                    product_info += f"\n⚖️ GEWICHT & MASSE:\n  • " + "\n  • ".join(gewicht_info) + "\n"
                
                # Kompatibilität
                kompatibilitaet = payload.get('kompatibilitaet', {})
                if kompatibilitaet and isinstance(kompatibilitaet, dict):
                    product_info += f"\n🔗 KOMPATIBILITÄT:\n"
                    if kompatibilitaet.get('kompatible_artikelnummern'):
                        arts = kompatibilitaet['kompatible_artikelnummern'][:10]
                        product_info += f"  • Kompatible Produkte: {', '.join(arts)}\n"
                    if kompatibilitaet.get('stueckliste'):
                        product_info += f"  • Stückliste: {len(kompatibilitaet['stueckliste'])} Komponenten\n"
            
            context_parts.append(product_info)
        
        return "\n".join(context_parts)
    
    def format_product_context_with_pricing(self, products: List[Dict]) -> str:
        """Formatiert Produktdaten für LLM-Kontext mit Preis-Informationen aus Platform-API"""
        if not products:
            return "Keine passenden Produkte gefunden."
        
        context_parts = []
        
        for i, product in enumerate(products, 1):
            artikelnummer = product.get("artikelnummer", "")
            artikelname = product.get("artikelname", "")
            hersteller = product.get("hersteller", "")
            produkttyp = product.get("produkttyp", "")
            beschreibung = product.get("beschreibung", "")[:500]  # Begrenze Länge
            kurzbeschreibung = product.get("kurzbeschreibung", "")
            payload = product.get("payload", {})
            
            # Preis-Daten aus Platform-API
            pricing = product.get("pricing", {})
            pricing_info = ""
            if pricing:
                # Platform-API gibt verschiedene Strukturen zurück
                # Prüfe verschiedene mögliche Strukturen
                verkaufspreis_gross = None
                einkaufspreis_gross = None
                discount_percent = 0
                strike_price = None
                
                # Struktur 1: Direkte Felder (aus get_pricing_data - Standard-Struktur)
                if isinstance(pricing, dict):
                    verkaufspreis_gross = pricing.get("verkaufspreis_19_mwst")
                    einkaufspreis_gross = pricing.get("einkaufspreis_19_mwst")
                    discount_percent = pricing.get("aktueller_rabatt", 0)
                    strike_price = pricing.get("ursprungs_preis")
                    
                    # Struktur 2: Verschachtelte Struktur (falls vorhanden)
                    if verkaufspreis_gross is None:
                        shop = pricing.get("shop", {})
                        if isinstance(shop, dict):
                            verkaufspreis_gross = shop.get("gross")
                    
                    if einkaufspreis_gross is None:
                        purchase = pricing.get("purchase", {})
                        if isinstance(purchase, dict):
                            einkaufspreis_gross = purchase.get("gross")
                    
                    if discount_percent == 0:
                        discount = pricing.get("discount", {})
                        if isinstance(discount, dict):
                            discount_percent = discount.get("percent", 0)
                            strike_price = discount.get("strike_price") or strike_price
                
                pricing_info = "\n💰 PREISE:\n"
                if verkaufspreis_gross:
                    if strike_price and discount_percent > 0:
                        pricing_info += f"  - Verkaufspreis: ~~{strike_price:.2f} €~~ **{verkaufspreis_gross:.2f} €** ({discount_percent}% Rabatt)\n"
                    else:
                        pricing_info += f"  - Verkaufspreis: {verkaufspreis_gross:.2f} €\n"
                if einkaufspreis_gross:
                    pricing_info += f"  - Einkaufspreis: {einkaufspreis_gross:.2f} €\n"
                if not verkaufspreis_gross and not einkaufspreis_gross:
                    pricing_info += "  - Preise: Nicht verfügbar\n"
            else:
                pricing_info = "\n💰 PREISE: Nicht verfügbar\n"
            
            # Basis-Informationen
            context = f"""
PRODUKT {i}:
- Artikelnummer: {artikelnummer}
- Name: {artikelname}
- Hersteller: {hersteller}
- Produkttyp: {produkttyp}
- Kurzbeschreibung: {kurzbeschreibung}
{pricing_info}
- Beschreibung: {beschreibung}
"""
            
            # Produktspezifische Spezifikationen hinzufügen
            if produkttyp == 'batterie' and payload.get('batterie_spezifikationen'):
                specs = payload['batterie_spezifikationen']
                context += f"- Kapazität: {specs.get('kapazitaet_ah', 'N/A')} Ah / {specs.get('kapazitaet_kwh', 'N/A')} kWh\n"
                context += f"- Spannung: {specs.get('spannung_v', 'N/A')} V\n"
                context += f"- Zelltyp: {specs.get('zelltyp', 'N/A')}\n"
            
            elif produkttyp == 'speichersystem' and payload.get('speichersystem_spezifikationen'):
                specs = payload['speichersystem_spezifikationen']
                context += f"- Speicherkapazität: {specs.get('speicherkapazitaet_kwh', 'N/A')} kWh\n"
                context += f"- Wechselrichter integriert: {specs.get('wechselrichter_integriert', False)}\n"
                if specs.get('wechselrichter_leistung_w'):
                    context += f"- Wechselrichter-Leistung: {specs.get('wechselrichter_leistung_w')} W\n"
            
            elif produkttyp == 'wechselrichter' and payload.get('wechselrichter_spezifikationen'):
                specs = payload['wechselrichter_spezifikationen']
                context += f"- Nennleistung: {specs.get('nennleistung_w', 'N/A')} W\n"
                context += f"- Eingangsspannung: {specs.get('eingangsspannung_v', 'N/A')} V\n"
                context += f"- Ausgangsspannung: {specs.get('ausgangsspannung_v', 'N/A')} V\n"
            
            context_parts.append(context)
        
        return "\n".join(context_parts)
    
    def chat(
        self,
        user_message: str,
        conversation_history: Optional[List[Dict]] = None
    ) -> Dict:
        """
        Führt Chat-Konversation mit RAG-Unterstützung.
        
        INTELLIGENTE FELD-ANSTEUERUNG:
        - Standard: Kompakte Produktinfos (Spezifikationen + Kurzbeschreibung)
        - Bei Detail-Keywords: Vollständige PDF-Informationen
        - Bei Übersicht-Keywords: Strukturierter vektor_text
        - Bei Nachfrage auf vorheriges Produkt: Automatisch PDF-Details
        """
        
        # System-Prompt
        system_prompt = self.create_system_prompt()
        
        # Prüfe ob Artikelnummer in der Nachricht enthalten ist
        import re
        artikelnummern_in_message = re.findall(r'\b\d{7}(?:-\d{3})?\b', user_message)
        has_artikelnummer = len(artikelnummern_in_message) > 0
        
        # ============================================================================
        # NACHFRAGE-ERKENNUNG: Bezieht sich die Anfrage auf das vorherige Produkt?
        # ============================================================================
        previous_product_artikelnummer = None
        is_followup_question = False
        
        # Prüfe Konversationshistorie auf vorheriges Produkt
        if conversation_history and not has_artikelnummer:
            user_message_lower_check = user_message.lower()
            
            # Prüfe ob die Nachricht Nachfrage-Keywords enthält
            has_followup_keywords = any(kw in user_message_lower_check for kw in self.followup_keywords)
            
            if has_followup_keywords:
                # Suche in der Historie nach Artikelnummern
                for msg in reversed(conversation_history[-6:]):  # Letzte 6 Nachrichten
                    if msg.get('role') in ['user', 'assistant']:
                        content = msg.get('content', '')
                        # Suche nach 7-stelligen Artikelnummern
                        found_artikelnummern = re.findall(r'\b\d{7}(?:-\d{3})?\b', content)
                        if found_artikelnummern:
                            previous_product_artikelnummer = found_artikelnummern[-1]  # Letzte gefundene
                            is_followup_question = True
                            break
        
        # ============================================================================
        # INTELLIGENTE KEYWORD-ERKENNUNG für Feld-Ansteuerung
        # ============================================================================
        user_message_lower = user_message.lower()
        
        # Prüfe ob detaillierte PDF-Infos angefragt werden
        wants_pdf_details = any(kw in user_message_lower for kw in self.pdf_detail_keywords)
        
        # Prüfe ob strukturierte Übersicht (vektor_text) angefragt wird
        wants_vektor_overview = any(kw in user_message_lower for kw in self.vektor_text_keywords)
        
        # Bei Nachfrage auf vorheriges Produkt: Automatisch PDF-Details aktivieren
        if is_followup_question and previous_product_artikelnummer:
            wants_pdf_details = True
            has_artikelnummer = True
            artikelnummern_in_message = [previous_product_artikelnummer]
        
        # Intelligente Suche: Artikelnummer → Artikelname → Semantisch
        # Bei Nachfrage: Suche nach dem vorherigen Produkt
        search_query = previous_product_artikelnummer if is_followup_question else user_message
        products = self.rag_engine.smart_search(search_query, limit=MAX_SEARCH_RESULTS, min_score=0.3)
        
        # Prüfe ob nur Teilnamen gefunden wurden (keine exakte Artikelnummer)
        has_exact_match = any(
            p.get("match_type") == "artikelnummer" or 
            (p.get("match_type") == "artikelname" and p.get("score", 0) >= 1.0)
            for p in products
        )
        
        # Wenn mehrere Produkte mit Teilnamen gefunden wurden, füge Hinweis hinzu
        partial_name_matches = [p for p in products if p.get("match_type") == "artikelname" and p.get("score", 0) < 1.0]
        ask_for_artikelnummer = len(partial_name_matches) > 1 and not has_exact_match
        
        # ============================================================================
        # KONTEXT-AUSWAHL basierend auf Anfrage-Typ
        # ============================================================================
        context_mode = "standard"  # Für Logging
        
        if wants_vektor_overview and has_artikelnummer and len(products) == 1:
            # ÜBERSICHT: Nutze vektor_text für strukturierte Gesamtübersicht
            context_mode = "vektor_text"
            product_context = self.format_product_context_detailed(products, use_vektor_text=True)
            context_hint = "\n\n" + self.prompt_manager.get_context_prompt('overview')
            
        elif wants_pdf_details and has_artikelnummer:
            # DETAILS: Nutze PDF-Texte für technische Detail-Anfragen
            context_mode = "pdf_details"
            product_context = self.format_product_context_detailed(products, use_vektor_text=False)
            context_hint = "\n\n" + self.prompt_manager.get_context_prompt('pdf_details')
            
        else:
            # STANDARD: Kompakte Produktinfos
            context_mode = "standard"
            product_context = self.format_product_context(products)
            context_hint = "\n\n" + self.prompt_manager.get_context_prompt('standard')
        
        # Erweitere System-Prompt mit Produktkontext
        prompt_addition = ""
        if ask_for_artikelnummer:
            prompt_addition = "\n\n" + self.prompt_manager.get_artikelnummer_hint()
        
        enhanced_system_prompt = f"""{system_prompt}

AKTUELLE PRODUKTDATEN:
{product_context}
{prompt_addition}
{context_hint}

Verwende diese Produktinformationen, um die Frage des Kunden zu beantworten."""
        
        # Konversations-Historie vorbereiten
        messages = [
            {"role": "system", "content": enhanced_system_prompt}
        ]
        
        # Historie hinzufügen
        if conversation_history:
            messages.extend(conversation_history[-10:])  # Letzte 10 Nachrichten
        
        # User-Nachricht hinzufügen
        messages.append({"role": "user", "content": user_message})
        
        # LLM-Aufruf (verwendet GPT-4o für normalen Chat)
        try:
            # GPT-5.1 verwendet max_completion_tokens statt max_tokens
            request_params = {
                "model": self.model_chat,  # GPT-4o für gute Qualität
                "messages": messages,
                "temperature": 0.7
            }
            
            # GPT-5.1 benötigt max_completion_tokens statt max_tokens
            if "gpt-5" in self.model_chat.lower():
                request_params["max_completion_tokens"] = 1000
            else:
                request_params["max_tokens"] = 1000
            
            response = self.openai_client.chat.completions.create(**request_params)
            
            assistant_message = response.choices[0].message.content
            
            # Füge Hinweis IMMER hinzu, wenn keine Artikelnummer angegeben wurde
            hinweis = ""
            if not has_artikelnummer:
                artikelnummer_reminder = self.prompt_manager.get_artikelnummer_reminder()
                if artikelnummer_reminder:
                    hinweis = artikelnummer_reminder + "\n\n"
            
            # Kombiniere Hinweis mit Antwort (Hinweis VOR der Antwort)
            final_response = hinweis + assistant_message
            
            return {
                "response": final_response,
                "products": products,
                "model": self.model_chat
            }
        except Exception as e:
            return {
                "response": self.prompt_manager.get_error_message('general', str(e)),
                "products": [],
                "error": str(e)
            }
    
    def compare_products_chat(self, artikelnummern: List[str]) -> Dict:
        """Erstellt Vergleichsantwort für mehrere Produkte mit Preisen aus Platform-API"""
        products = self.rag_engine.compare_products(artikelnummern)
        
        if len(products) < 2:
            return {
                "response": self.prompt_manager.get_compare_minimum_message(),
                "products": products
            }
        
        # Lade Preise für alle Produkte aus Platform-API
        products_with_pricing = []
        for product in products:
            artikelnummer = product.get("artikelnummer", "")
            pricing_data = None
            
            if artikelnummer:
                try:
                    pricing_data = self.platform_api_client.get_pricing_data(artikelnummer)
                except Exception as e:
                    print(f"⚠️  Fehler beim Laden der Preise für {artikelnummer}: {e}")
                    pricing_data = None
            
            # Füge Preis-Daten zum Produkt hinzu
            product_with_pricing = product.copy()
            product_with_pricing["pricing"] = pricing_data
            products_with_pricing.append(product_with_pricing)
        
        # Erstelle Vergleichs-Prompt mit Preis-Informationen
        comparison_context = self.format_product_context_with_pricing(products_with_pricing)
        
        # Lade Vergleichs-Prompt aus PromptManager
        compare_prompt = self.prompt_manager.get_compare_system_prompt()
        
        system_prompt = f"""{self.create_system_prompt()}

PRODUKTE ZUM VERGLEICH:
{comparison_context}

{compare_prompt}"""
        
        try:
            # GPT-5.1 verwendet max_completion_tokens statt max_tokens
            request_params = {
                "model": self.model_compare,  # GPT-5.1 für beste Qualität bei Vergleichen
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": "Vergleiche diese Produkte detailliert."}
                ],
                "temperature": 0.7
            }
            
            # GPT-5.1 benötigt max_completion_tokens statt max_tokens
            if "gpt-5" in self.model_compare.lower():
                request_params["max_completion_tokens"] = 1500
            else:
                request_params["max_tokens"] = 1500
            
            response = self.openai_client.chat.completions.create(**request_params)
            
            # DEBUG: Logge LLM-Response
            print(f"🔍 Backend: LLM-Response erhalten")
            print(f"🔍 Backend: Response-Type: {type(response)}")
            print(f"🔍 Backend: Response-Choices: {len(response.choices) if hasattr(response, 'choices') else 'N/A'}")
            
            if hasattr(response, 'choices') and len(response.choices) > 0:
                llm_content = response.choices[0].message.content
                print(f"🔍 Backend: LLM-Content Länge: {len(llm_content) if llm_content else 0}")
                print(f"🔍 Backend: LLM-Content (erste 500 Zeichen): {llm_content[:500] if llm_content else 'LEER'}")
            else:
                print(f"❌ Backend: KEINE CHOICES IN RESPONSE!")
                llm_content = ""
            
            # DEBUG: Logge Preise vor Response
            for product in products_with_pricing:
                artikelnummer = product.get("artikelnummer", "")
                pricing = product.get("pricing", {})
                print(f"🔍 Backend: Produkt {artikelnummer} Preise: {pricing}")
            
            return {
                "response": llm_content if llm_content else "Entschuldigung, es konnte kein Vergleichstext generiert werden.",
                "products": products_with_pricing,  # Enthält jetzt Preis-Daten
                "model": self.model_compare
            }
        except Exception as e:
            print(f"❌ Backend: FEHLER beim LLM-Aufruf: {e}")
            import traceback
            print(f"❌ Backend: Traceback: {traceback.format_exc()}")
            return {
                "response": self.prompt_manager.get_error_message('compare', str(e)),
                "products": products_with_pricing if 'products_with_pricing' in locals() else products,
                "error": str(e)
            }
    
    def find_storage_recommendation(
        self,
        pv_leistung_kwp: float,
        stromverbrauch_kwh: Optional[float] = None,
        autarkie_wunsch: Optional[float] = None
    ) -> Dict:
        """Findet und empfiehlt passende Speichersysteme"""
        products = self.rag_engine.find_matching_storage(
            pv_leistung_kwp=pv_leistung_kwp,
            stromverbrauch_kwh=stromverbrauch_kwh,
            autarkie_wunsch=autarkie_wunsch
        )
        
        product_context = self.format_product_context(products)
        
        # Berechne Empfehlungen
        recommendations = []
        if stromverbrauch_kwh:
            tagesverbrauch = stromverbrauch_kwh / 365
            empfohlene_kapazitaet = tagesverbrauch * 1.5  # 1.5 Tage Autarkie
            recommendations.append(f"Empfohlene Speicherkapazität: {empfohlene_kapazitaet:.1f} kWh (basierend auf {stromverbrauch_kwh} kWh/Jahr)")
        
        if pv_leistung_kwp:
            # Faustformel: 1 kWp produziert ca. 1000 kWh/Jahr
            jahresertrag = pv_leistung_kwp * 1000
            recommendations.append(f"Erwarteter PV-Ertrag: {jahresertrag:.0f} kWh/Jahr")
        
        # Lade Speicher-Empfehlungs-Prompt aus PromptManager
        storage_prompt = self.prompt_manager.get_storage_recommendation_prompt()
        
        system_prompt = f"""{self.create_system_prompt()}

PV-ANLAGE PARAMETER:
- PV-Leistung: {pv_leistung_kwp} kWp
- Stromverbrauch: {stromverbrauch_kwh if stromverbrauch_kwh else 'Nicht angegeben'} kWh/Jahr
- Autarkie-Wunsch: {autarkie_wunsch if autarkie_wunsch else 'Nicht angegeben'}%

PASSENDE SPEICHERSYSTEME:
{product_context}

EMPFEHLUNGEN:
{chr(10).join(recommendations)}

{storage_prompt}"""
        
        try:
            # GPT-5.1 verwendet max_completion_tokens statt max_tokens
            request_params = {
                "model": self.model_recommendation,  # GPT-5.1 für beste Qualität bei PV-Empfehlungen
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": "Welche Speichersysteme passen zu meiner PV-Anlage?"}
                ],
                "temperature": 0.7
            }
            
            # GPT-5.1 benötigt max_completion_tokens statt max_tokens
            if "gpt-5" in self.model_recommendation.lower():
                request_params["max_completion_tokens"] = 1500
            else:
                request_params["max_tokens"] = 1500
            
            response = self.openai_client.chat.completions.create(**request_params)
            
            return {
                "response": response.choices[0].message.content,
                "products": products,
                "recommendations": recommendations
            }
        except Exception as e:
            return {
                "response": self.prompt_manager.get_error_message('general', str(e)),
                "products": products,
                "error": str(e)
            }

