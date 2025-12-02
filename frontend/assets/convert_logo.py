#!/usr/bin/env python3
"""
Konvertiert das Husky-Logo in Web-Format
"""
from PIL import Image
import sys
import os

def convert_logo(input_path, output_path="husky-logo.png", size=(120, 120)):
    """
    Konvertiert ein Bild in Web-Format (PNG)
    
    Args:
        input_path: Pfad zum Eingabebild
        output_path: Ausgabepfad (Standard: husky-logo.png)
        size: Zielgröße (Standard: 120x120px)
    """
    try:
        # Öffne Bild
        img = Image.open(input_path)
        
        # Konvertiere zu RGBA (für transparenten Hintergrund)
        if img.mode != 'RGBA':
            img = img.convert('RGBA')
        
        # Resize mit hoher Qualität
        img.thumbnail(size, Image.Resampling.LANCZOS)
        
        # Speichere als PNG
        img.save(output_path, 'PNG', optimize=True)
        
        print(f"✅ Logo erfolgreich konvertiert: {output_path}")
        print(f"   Größe: {img.size[0]}x{img.size[1]}px")
        return True
        
    except Exception as e:
        print(f"❌ Fehler beim Konvertieren: {e}")
        return False

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Verwendung: python3 convert_logo.py <eingabebild> [ausgabedatei]")
        print("Beispiel: python3 convert_logo.py husky.jpg husky-logo.png")
        sys.exit(1)
    
    input_file = sys.argv[1]
    output_file = sys.argv[2] if len(sys.argv) > 2 else "husky-logo.png"
    
    if not os.path.exists(input_file):
        print(f"❌ Datei nicht gefunden: {input_file}")
        sys.exit(1)
    
    convert_logo(input_file, output_file)

