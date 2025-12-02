"""
Prompt-Manager für das Laden und Speichern von Prompts

Verwaltet alle Prompts zentral aus einer JSON-Datei.
Ermöglicht das Bearbeiten von Prompts über die UI.
"""
import json
import os
from pathlib import Path
from typing import Dict, List, Optional, Any
from datetime import datetime
import shutil


class PromptManager:
    """
    Verwaltet alle Chatbot-Prompts aus einer zentralen JSON-Datei.
    
    Features:
    - Laden aller Prompts beim Start
    - Speichern von bearbeiteten Prompts
    - Backup vor Änderungen
    - Zugriff auf einzelne Prompts über ID
    """
    
    def __init__(self, prompts_file: Optional[str] = None):
        """
        Initialisiert den Prompt-Manager.
        
        Args:
            prompts_file: Pfad zur prompts.json Datei (optional)
        """
        if prompts_file:
            self.prompts_file = Path(prompts_file)
        else:
            # Standard: prompts.json im gleichen Verzeichnis
            self.prompts_file = Path(__file__).parent / "prompts.json"
        
        self.backup_dir = self.prompts_file.parent / "backups"
        self._prompts_data: Dict = {}
        self._prompts_cache: Dict[str, Any] = {}  # Cache für schnellen Zugriff
        
        # Lade Prompts beim Initialisieren
        self.load_prompts()
    
    def load_prompts(self) -> bool:
        """
        Lädt alle Prompts aus der JSON-Datei.
        
        Returns:
            True wenn erfolgreich, False bei Fehler
        """
        try:
            if not self.prompts_file.exists():
                print(f"⚠️  Prompts-Datei nicht gefunden: {self.prompts_file}")
                return False
            
            with open(self.prompts_file, 'r', encoding='utf-8') as f:
                self._prompts_data = json.load(f)
            
            # Cache aufbauen für schnellen Zugriff
            self._build_cache()
            
            print(f"✅ Prompts geladen: {len(self._prompts_cache)} Prompts aus {self.prompts_file}")
            return True
            
        except json.JSONDecodeError as e:
            print(f"❌ Fehler beim Parsen der Prompts-Datei: {e}")
            return False
        except Exception as e:
            print(f"❌ Fehler beim Laden der Prompts: {e}")
            return False
    
    def _build_cache(self):
        """Baut einen Cache für schnellen Zugriff auf Prompts über ihre ID."""
        self._prompts_cache = {}
        
        for category in self._prompts_data.get('categories', []):
            for prompt in category.get('prompts', []):
                prompt_id = prompt.get('id')
                if prompt_id:
                    self._prompts_cache[prompt_id] = {
                        'category_id': category.get('id'),
                        'category_name': category.get('name'),
                        **prompt
                    }
    
    def get_prompt(self, prompt_id: str) -> Optional[str]:
        """
        Holt den Inhalt eines Prompts über seine ID.
        
        Args:
            prompt_id: Die eindeutige ID des Prompts
            
        Returns:
            Der Prompt-Inhalt als String, oder None wenn nicht gefunden
        """
        prompt_data = self._prompts_cache.get(prompt_id)
        if prompt_data:
            content = prompt_data.get('content')
            # Bei Listen (Keywords) als String zurückgeben
            if isinstance(content, list):
                return content  # Liste zurückgeben für Keywords
            return content
        return None
    
    def get_prompt_data(self, prompt_id: str) -> Optional[Dict]:
        """
        Holt alle Daten eines Prompts (inkl. Metadaten).
        
        Args:
            prompt_id: Die eindeutige ID des Prompts
            
        Returns:
            Dict mit allen Prompt-Daten, oder None
        """
        return self._prompts_cache.get(prompt_id)
    
    def get_all_prompts(self) -> Dict:
        """
        Gibt alle Prompts-Daten zurück (für API/UI).
        
        Returns:
            Vollständige Prompts-Datenstruktur
        """
        return self._prompts_data
    
    def get_categories(self) -> List[Dict]:
        """
        Gibt alle Kategorien mit ihren Prompts zurück.
        
        Returns:
            Liste der Kategorien
        """
        return self._prompts_data.get('categories', [])
    
    def get_editable_prompts(self) -> List[Dict]:
        """
        Gibt nur die bearbeitbaren Prompts zurück.
        
        Returns:
            Liste der bearbeitbaren Prompts
        """
        editable = []
        for prompt_id, prompt_data in self._prompts_cache.items():
            if prompt_data.get('editable', True):
                editable.append(prompt_data)
        return editable
    
    def update_prompt(self, prompt_id: str, new_content: str) -> bool:
        """
        Aktualisiert den Inhalt eines Prompts.
        
        Args:
            prompt_id: Die ID des zu aktualisierenden Prompts
            new_content: Der neue Inhalt
            
        Returns:
            True wenn erfolgreich, False bei Fehler
        """
        # Prüfe ob Prompt existiert und bearbeitbar ist
        prompt_data = self._prompts_cache.get(prompt_id)
        if not prompt_data:
            print(f"❌ Prompt nicht gefunden: {prompt_id}")
            return False
        
        if not prompt_data.get('editable', True):
            print(f"❌ Prompt ist nicht bearbeitbar: {prompt_id}")
            return False
        
        # Erstelle Backup vor Änderung
        self._create_backup()
        
        # Aktualisiere in der Datenstruktur
        for category in self._prompts_data.get('categories', []):
            for prompt in category.get('prompts', []):
                if prompt.get('id') == prompt_id:
                    prompt['content'] = new_content
                    break
        
        # Aktualisiere Cache
        self._prompts_cache[prompt_id]['content'] = new_content
        
        # Speichere in Datei
        return self.save_prompts()
    
    def save_prompts(self) -> bool:
        """
        Speichert alle Prompts in die JSON-Datei.
        
        Returns:
            True wenn erfolgreich, False bei Fehler
        """
        try:
            # Aktualisiere last_updated
            self._prompts_data['last_updated'] = datetime.now().strftime('%Y-%m-%d')
            
            with open(self.prompts_file, 'w', encoding='utf-8') as f:
                json.dump(self._prompts_data, f, ensure_ascii=False, indent=2)
            
            print(f"✅ Prompts gespeichert: {self.prompts_file}")
            return True
            
        except Exception as e:
            print(f"❌ Fehler beim Speichern der Prompts: {e}")
            return False
    
    def _create_backup(self):
        """Erstellt ein Backup der aktuellen Prompts-Datei."""
        try:
            # Erstelle Backup-Verzeichnis wenn nicht vorhanden
            self.backup_dir.mkdir(exist_ok=True)
            
            # Backup-Dateiname mit Timestamp
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            backup_file = self.backup_dir / f"prompts_backup_{timestamp}.json"
            
            # Kopiere aktuelle Datei
            shutil.copy2(self.prompts_file, backup_file)
            
            # Behalte nur die letzten 10 Backups
            self._cleanup_old_backups(keep=10)
            
            print(f"📁 Backup erstellt: {backup_file}")
            
        except Exception as e:
            print(f"⚠️  Backup konnte nicht erstellt werden: {e}")
    
    def _cleanup_old_backups(self, keep: int = 10):
        """Entfernt alte Backups, behält nur die neuesten."""
        try:
            backups = sorted(self.backup_dir.glob("prompts_backup_*.json"))
            if len(backups) > keep:
                for old_backup in backups[:-keep]:
                    old_backup.unlink()
                    
        except Exception as e:
            print(f"⚠️  Fehler beim Aufräumen alter Backups: {e}")
    
    def reset_prompt(self, prompt_id: str) -> bool:
        """
        Setzt einen Prompt auf den Standardwert zurück.
        
        Lädt den ursprünglichen Wert aus dem neuesten Backup.
        
        Args:
            prompt_id: Die ID des zurückzusetzenden Prompts
            
        Returns:
            True wenn erfolgreich, False bei Fehler
        """
        # TODO: Implementieren wenn benötigt
        # Könnte aus einem "defaults.json" laden
        print(f"⚠️  Reset für {prompt_id} noch nicht implementiert")
        return False
    
    # =========================================================================
    # Convenience-Methoden für häufig verwendete Prompts
    # =========================================================================
    
    def get_chat_system_prompt(self) -> str:
        """Holt den Chat System-Prompt."""
        return self.get_prompt('chat_system_prompt') or ""
    
    def get_compare_system_prompt(self) -> str:
        """Holt den Vergleichs-System-Prompt."""
        return self.get_prompt('compare_system_prompt') or ""
    
    def get_storage_recommendation_prompt(self) -> str:
        """Holt den Speicher-Empfehlungs-Prompt."""
        return self.get_prompt('storage_recommendation_prompt') or ""
    
    def get_pv_recommendation_prompt(self) -> str:
        """Holt den PV-Anlagen-Empfehlungs-Prompt."""
        return self.get_prompt('pv_recommendation_prompt') or """
Erstelle eine detaillierte PV-Anlagen-Empfehlung basierend auf den Kundenangaben.

WICHTIG - PRIORISIERE FERTIGE SETS:
1. Empfehle zuerst passende Komplett-Sets (wenn verfügbar)
2. Erkläre die Vorteile des Sets (optimal aufeinander abgestimmt, einfache Installation)
3. Nur wenn kein passendes Set verfügbar: Empfehle Einzelkomponenten

STRUKTUR DER EMPFEHLUNG:
1. **Zusammenfassung** der Anforderungen
2. **Empfohlene Sets** (mit Artikelnummern) 
3. **Alternative Einzelkomponenten** (falls gewünscht)
4. **Erwarteter Ertrag** und Wirtschaftlichkeit
5. **Hinweise** zur Installation und Kompatibilität

Nenne immer die Artikelnummern in Klammern: (Art.-Nr. XXXXXXX)
"""
    
    def get_context_prompt(self, mode: str) -> str:
        """
        Holt den Kontext-Prompt für einen bestimmten Modus.
        
        Args:
            mode: 'standard', 'pdf_details', 'overview'
        """
        prompt_ids = {
            'standard': 'context_standard',
            'pdf_details': 'context_pdf_details',
            'overview': 'context_overview'
        }
        prompt_id = prompt_ids.get(mode, 'context_standard')
        return self.get_prompt(prompt_id) or ""
    
    def get_welcome_message(self) -> str:
        """Holt die Willkommensnachricht."""
        return self.get_prompt('welcome_message') or "Hallo! Wie kann ich Ihnen helfen?"
    
    def get_artikelnummer_reminder(self) -> str:
        """Holt die Artikelnummer-Erinnerung."""
        return self.get_prompt('artikelnummer_reminder') or ""
    
    def get_artikelnummer_hint(self) -> str:
        """Holt den Artikelnummer-Hinweis für mehrere gefundene Produkte."""
        return self.get_prompt('artikelnummer_hint') or ""
    
    def get_error_message(self, error_type: str = 'general', error: str = '') -> str:
        """
        Holt eine Fehlermeldung.
        
        Args:
            error_type: 'general', 'compare'
            error: Der Fehlertext zum Einsetzen
        """
        prompt_ids = {
            'general': 'error_general',
            'compare': 'error_compare'
        }
        prompt_id = prompt_ids.get(error_type, 'error_general')
        message = self.get_prompt(prompt_id) or "Ein Fehler ist aufgetreten: {error}"
        return message.format(error=error)
    
    def get_compare_minimum_message(self) -> str:
        """Holt die Nachricht für zu wenige Produkte beim Vergleich."""
        return self.get_prompt('compare_minimum_products') or "Für einen Vergleich benötige ich mindestens 2 Produkte."
    
    def get_pdf_detail_keywords(self) -> List[str]:
        """Holt die Liste der PDF-Detail-Keywords."""
        keywords = self.get_prompt('pdf_detail_keywords')
        if isinstance(keywords, list):
            return keywords
        return []
    
    def get_vektor_text_keywords(self) -> List[str]:
        """Holt die Liste der Vektor-Text-Keywords."""
        keywords = self.get_prompt('vektor_text_keywords')
        if isinstance(keywords, list):
            return keywords
        return []
    
    def get_followup_keywords(self) -> List[str]:
        """Holt die Liste der Nachfrage-Keywords."""
        keywords = self.get_prompt('followup_keywords')
        if isinstance(keywords, list):
            return keywords
        return []


# Singleton-Instanz für globalen Zugriff
_prompt_manager_instance: Optional[PromptManager] = None


def get_prompt_manager() -> PromptManager:
    """
    Gibt die globale PromptManager-Instanz zurück.
    Erstellt sie bei Bedarf.
    """
    global _prompt_manager_instance
    if _prompt_manager_instance is None:
        _prompt_manager_instance = PromptManager()
    return _prompt_manager_instance

