// API Base URL
const API_BASE = window.location.origin;

// Konversations-Historie
let conversationHistory = [];

// Markdown zu HTML Konverter
function markdownToHTML(markdown) {
    if (!markdown) return '';
    
    // Code-Blöcke zuerst behandeln (damit sie nicht von anderen Regeln betroffen werden)
    const codeBlocks = [];
    let html = markdown.replace(/```([\s\S]*?)```/g, (match, code) => {
        const id = `CODEBLOCK_${codeBlocks.length}`;
        codeBlocks.push({ id, code: code.trim() });
        return id;
    });
    
    // Zeilenweise verarbeiten
    const lines = html.split('\n');
    const processedLines = [];
    let inList = false;
    let inCodeBlock = false;
    
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        
        // Code-Block Marker erkennen
        if (line.includes('CODEBLOCK_')) {
            inCodeBlock = !inCodeBlock;
            processedLines.push(line);
            continue;
        }
        
        if (inCodeBlock) {
            processedLines.push(line);
            continue;
        }
        
        // Überschriften
        if (line.match(/^###\s+/)) {
            if (inList) { processedLines.push('</ul>'); inList = false; }
            processedLines.push(`<h3>${line.replace(/^###\s+/, '')}</h3>`);
            continue;
        }
        if (line.match(/^##\s+/)) {
            if (inList) { processedLines.push('</ul>'); inList = false; }
            processedLines.push(`<h2>${line.replace(/^##\s+/, '')}</h2>`);
            continue;
        }
        if (line.match(/^#\s+/)) {
            if (inList) { processedLines.push('</ul>'); inList = false; }
            processedLines.push(`<h1>${line.replace(/^#\s+/, '')}</h1>`);
            continue;
        }
        
        // Horizontale Linie
        if (line.trim() === '---') {
            if (inList) { processedLines.push('</ul>'); inList = false; }
            processedLines.push('<hr>');
            continue;
        }
        
        // Listen
        const listMatch = line.match(/^[\s]*[-*]\s+(.+)$/);
        const numberedMatch = line.match(/^\d+\.\s+(.+)$/);
        
        if (listMatch || numberedMatch) {
            if (!inList) {
                processedLines.push('<ul>');
                inList = true;
            }
            const content = listMatch ? listMatch[1] : numberedMatch[1];
            processedLines.push(`<li>${content}</li>`);
            continue;
        }
        
        // Normale Zeile
        if (inList) {
            processedLines.push('</ul>');
            inList = false;
        }
        
        if (line.trim()) {
            processedLines.push(line);
        } else {
            processedLines.push('<br>');
        }
    }
    
    if (inList) {
        processedLines.push('</ul>');
    }
    
    html = processedLines.join('\n');
    
    // Code inline: `code`
    html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');
    
    // Links: [text](url)
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    
    // Fettdruck: **text** oder __text__
    html = html.replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__([^_\n]+?)__/g, '<strong>$1</strong>');
    
    // Kursiv: *text* oder _text_ (aber nicht wenn es ** ist)
    html = html.replace(/(?<!\*)\*([^*\n]+?)\*(?!\*)/g, '<em>$1</em>');
    html = html.replace(/(?<!_)_([^_\n]+?)_(?!_)/g, '<em>$1</em>');
    
    // Code-Blöcke wieder einfügen
    codeBlocks.forEach(({ id, code }) => {
        html = html.replace(id, `<pre><code>${code}</code></pre>`);
    });
    
    // Doppelte <br> entfernen (außer in Code-Blöcken)
    html = html.replace(/(<br>\s*){2,}/g, '<br><br>');
    
    return html;
}

// Chat-Funktionen
function handleKeyPress(event) {
    if (event.key === 'Enter') {
        sendMessage();
    }
}

async function sendMessage() {
    const input = document.getElementById('chat-input');
    const message = input.value.trim();
    
    if (!message) return;
    
    // User-Nachricht anzeigen
    addMessage('user', message);
    input.value = '';
    
    // Loading-Indikator
    const loadingId = addMessage('assistant', '<div class="loading"></div>');
    
    try {
        const response = await fetch(`${API_BASE}/api/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: message,
                conversation_history: conversationHistory
            })
        });
        
        const data = await response.json();
        
        // Loading entfernen
        removeMessage(loadingId);
        
        // Antwort anzeigen
        addMessage('assistant', data.response);
        
        // Produkte anzeigen, falls vorhanden
        if (data.products && data.products.length > 0) {
            displayProducts(data.products, 'assistant');
        }
        
        // Historie aktualisieren
        conversationHistory.push(
            { role: 'user', content: message },
            { role: 'assistant', content: data.response }
        );
        
    } catch (error) {
        removeMessage(loadingId);
        addMessage('assistant', `Fehler: ${error.message}`);
    }
}

function addMessage(role, content) {
    const messagesContainer = document.getElementById('chat-messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;
    messageDiv.id = `msg-${Date.now()}`;
    
    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    
    // Markdown zu HTML konvertieren für Assistant-Nachrichten
    if (role === 'assistant') {
        bubble.innerHTML = markdownToHTML(content);
    } else {
        // User-Nachrichten: HTML escapen für Sicherheit
        const textNode = document.createTextNode(content);
        bubble.appendChild(textNode);
    }
    
    const time = document.createElement('div');
    time.className = 'message-time';
    time.textContent = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    
    messageDiv.appendChild(bubble);
    messageDiv.appendChild(time);
    messagesContainer.appendChild(messageDiv);
    
    // Scroll nach unten
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    return messageDiv.id;
}

function removeMessage(messageId) {
    const message = document.getElementById(messageId);
    if (message) {
        message.remove();
    }
}

function displayProducts(products, role) {
    const messagesContainer = document.getElementById('chat-messages');
    const productsDiv = document.createElement('div');
    productsDiv.className = `message ${role}`;
    
    products.forEach(product => {
        const card = document.createElement('div');
        card.className = 'product-card';
        card.onclick = () => showProductDetails(product);
        
        card.innerHTML = `
            <h4>${product.artikelname || 'Unbekannt'}</h4>
            <div class="artikelnummer">Artikelnummer: ${product.artikelnummer || 'N/A'}</div>
            <div class="details">
                ${product.produkttyp ? `Typ: ${product.produkttyp}` : ''}
                ${product.hersteller ? ` | Hersteller: ${product.hersteller}` : ''}
            </div>
            ${product.score ? `<div class="score">Relevanz: ${(product.score * 100).toFixed(1)}%</div>` : ''}
        `;
        
        productsDiv.appendChild(card);
    });
    
    messagesContainer.appendChild(productsDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Funktion zur Extraktion aller technischen Spezifikationen
function extractAllTechnicalSpecs(product, payload) {
    const specs = [];
    const seenKeys = new Set(); // Vermeidet Duplikate
    
    // Hilfsfunktion zum Hinzufügen von Specs ohne Duplikate
    function addSpec(label, value, priority = 0) {
        if (!value || value === null || value === undefined || value === '') return;
        if (seenKeys.has(label.toLowerCase())) return; // Duplikat vermeiden
        
        // Konvertiere Wert zu String und formatiere
        let displayValue = value;
        
        // Spezielle Formatierung für Zyklenlebensdauer
        if (label.toLowerCase() === 'zyklenlebensdauer' && typeof value === 'object' && value !== null) {
            // Format: "80% - 2500, 70% - 3000, 50% - 5000"
            const entries = Object.entries(value);
            if (entries.length > 0) {
                displayValue = entries.map(([key, val]) => `${key} - ${val}`).join(', ');
            } else {
                displayValue = JSON.stringify(value);
            }
        } else if (typeof value === 'boolean') {
            displayValue = value ? 'Ja' : 'Nein';
        } else if (typeof value === 'number') {
            displayValue = value.toString();
        } else if (typeof value === 'object') {
            displayValue = JSON.stringify(value);
        } else {
            displayValue = String(value);
        }
        
        specs.push({ label, value: displayValue, priority });
        seenKeys.add(label.toLowerCase());
    }
    
    // Hilfsfunktion für dynamische Feld-Extraktion mit Label-Mapping
    function extractFieldsFromObject(obj, labelMapping, priority, prefix = '') {
        if (!obj || typeof obj !== 'object') return;
        
        for (const [key, value] of Object.entries(obj)) {
            if (value === null || value === undefined || value === '') continue;
            
            // Überspringe interne Felder
            if (key.startsWith('_') || key === 'quelle') continue;
            
            // Bestimme Label (mit Mapping oder automatisch)
            let label = labelMapping[key] || key
                .replace(/_/g, ' ')
                .replace(/([A-Z])/g, ' $1')
                .replace(/^./, str => str.toUpperCase())
                .trim();
            
            // Formatiere Wert
            let displayValue = value;
            
            if (Array.isArray(value)) {
                if (value.length === 0) continue;
                displayValue = value.join(', ');
            } else if (typeof value === 'boolean') {
                displayValue = value ? 'Ja' : 'Nein';
            } else if (typeof value === 'number') {
                // Füge Einheiten hinzu basierend auf Feldname
                if (key.includes('_kwh') || key.includes('kapazitaet')) {
                    displayValue = `${value} kWh`;
                } else if (key.includes('_v') || key.includes('spannung')) {
                    displayValue = `${value} V`;
                } else if (key.includes('_w') || key.includes('leistung')) {
                    displayValue = `${value} W`;
                } else if (key.includes('_a') || key.includes('strom')) {
                    displayValue = `${value} A`;
                } else if (key.includes('_kg') || key.includes('gewicht')) {
                    displayValue = `${value} kg`;
                } else if (key.includes('_cm') || key.includes('laenge') || key.includes('breite') || key.includes('hoehe')) {
                    displayValue = `${value} cm`;
                } else if (key.includes('_hz') || key.includes('frequenz')) {
                    displayValue = `${value} Hz`;
                } else if (key.includes('wirkungsgrad') || key.includes('entladetiefe') || (key.includes('prozent') && typeof value === 'number')) {
                    displayValue = `${value}%`;
                } else {
                    displayValue = value.toString();
                }
            } else if (typeof value === 'object') {
                // Verschachtelte Objekte schön formatieren (z.B. Komponenten-Specs)
                const formattedParts = [];
                for (const [subKey, subValue] of Object.entries(value)) {
                    if (subValue !== null && subValue !== undefined && subValue !== '') {
                        const subLabel = subKey.replace(/_/g, ' ').replace(/^./, str => str.toUpperCase());
                        let subDisplayValue = subValue;
                        if (typeof subValue === 'boolean') {
                            subDisplayValue = subValue ? 'Ja' : 'Nein';
                        } else if (typeof subValue === 'number') {
                            // Einheiten für verschachtelte Werte
                            if (subKey.includes('kwh') || subKey.includes('kapazitaet')) {
                                subDisplayValue = `${subValue} kWh`;
                            } else if (subKey.includes('_w') || subKey.includes('leistung')) {
                                subDisplayValue = `${subValue} W`;
                            } else if (subKey.includes('_v') || subKey.includes('spannung')) {
                                subDisplayValue = `${subValue} V`;
                            } else if (subKey.includes('wirkungsgrad')) {
                                subDisplayValue = `${subValue}%`;
                            }
                        }
                        formattedParts.push(`${subLabel}: ${subDisplayValue}`);
                    }
                }
                displayValue = formattedParts.join(', ');
            } else {
                displayValue = String(value);
            }
            
            addSpec(prefix + label, displayValue, priority);
        }
    }
    
    const produkttyp = (product.produkttyp || '').toLowerCase();
    
    // ============================================================
    // 0. SET-PRODUKTE: Höchste Priorität - immer ganz oben!
    // ============================================================
    if (payload.ist_set || payload.set_spezifikationen || payload.set_gesamt || payload.komponenten_spezifikationen) {
        const setSpecs = payload.set_spezifikationen || {};
        const setGesamt = payload.set_gesamt || setSpecs.set_gesamt || {};
        const komponenten = payload.komponenten_spezifikationen || setSpecs.komponenten || {};
        const setTyp = payload.set_typ_detail || setSpecs.set_typ || '';
        const erkannteTypen = payload.erkannte_komponenten_typen || setSpecs.erkannte_typen || [];
        
        // Set-Typ IMMER ganz oben (Priorität 100)
        if (setTyp) {
            addSpec('Set-Typ', setTyp.replace(/_/g, ' ').replace(/^./, s => s.toUpperCase()), 100);
        }
        
        // Enthaltene Komponenten
        if (erkannteTypen && erkannteTypen.length > 0) {
            addSpec('Enthält', erkannteTypen.map(t => t.replace(/^./, s => s.toUpperCase())).join(', '), 99);
        }
        
        // Set-Gesamtdaten (Priorität 98)
        if (setGesamt && typeof setGesamt === 'object' && Object.keys(setGesamt).length > 0) {
            // Formatiere Set-Gesamt schön
            const gesamtParts = [];
            for (const [key, value] of Object.entries(setGesamt)) {
                if (value !== null && value !== undefined && value !== '') {
                    let label = key.replace(/_/g, ' ').replace(/^./, s => s.toUpperCase());
                    let displayValue = value;
                    
                    if (typeof value === 'boolean') {
                        displayValue = value ? 'Ja' : 'Nein';
                    } else if (typeof value === 'number') {
                        if (key.includes('kwh') || key.includes('kapazitaet')) {
                            displayValue = `${value} kWh`;
                        } else if (key.includes('_w') || key.includes('leistung')) {
                            displayValue = `${value} W`;
                        } else if (key.includes('_v') || key.includes('spannung')) {
                            displayValue = `${value} V`;
                        }
                    }
                    gesamtParts.push(`${label}: ${displayValue}`);
                }
            }
            if (gesamtParts.length > 0) {
                addSpec('Set gesamt', gesamtParts.join(', '), 98);
            }
        }
        
        // Komponenten-Spezifikationen (Priorität 97-95)
        if (komponenten && typeof komponenten === 'object') {
            let kompPriority = 97;
            for (const [kompTyp, kompSpecs] of Object.entries(komponenten)) {
                if (kompSpecs && typeof kompSpecs === 'object' && Object.keys(kompSpecs).length > 0) {
                    // Formatiere Komponenten-Specs schön
                    const kompParts = [];
                    for (const [key, value] of Object.entries(kompSpecs)) {
                        if (value !== null && value !== undefined && value !== '') {
                            let label = key.replace(/_/g, ' ').replace(/^./, s => s.toUpperCase());
                            let displayValue = value;
                            
                            if (typeof value === 'boolean') {
                                displayValue = value ? 'Ja' : 'Nein';
                            } else if (typeof value === 'number') {
                                if (key.includes('kwh') || key.includes('kapazitaet')) {
                                    displayValue = `${value} kWh`;
                                } else if (key.includes('_w') || key.includes('leistung')) {
                                    displayValue = `${value} W`;
                                } else if (key.includes('_v') || key.includes('spannung')) {
                                    displayValue = `${value} V`;
                                } else if (key.includes('wirkungsgrad')) {
                                    displayValue = `${value}%`;
                                }
                            }
                            kompParts.push(`${label}: ${displayValue}`);
                        }
                    }
                    if (kompParts.length > 0) {
                        const kompLabel = kompTyp.replace(/_/g, ' ').replace(/^./, s => s.toUpperCase());
                        addSpec(kompLabel, kompParts.join(', '), kompPriority);
                        kompPriority--;
                    }
                }
            }
        }
    }
    
    // ============================================================
    // 1. PRODUKTSPEZIFISCHE SPEZIFIKATIONEN (höchste Priorität)
    // Basierend auf: Projekt-Husa-Bot/Produktfelder
    // ============================================================
    
    // 1. BATTERIE (15+ Felder)
    const batterieLabels = {
        'kapazitaet_ah': 'Kapazität (Ah)',
        'kapazitaet_kwh': 'Kapazität (kWh)',
        'spannung_v': 'Spannung',
        'zelltyp': 'Zelltyp',
        'zellanzahl': 'Zellenanzahl',
        'entladetiefe': 'Entladetiefe',
        'max_entladestrom_a': 'Max. Entladestrom',
        'max_ladestrom_a': 'Max. Ladestrom',
        'zykluslebensdauer': 'Zyklenlebensdauer',
        'temperaturbereich': 'Temperaturbereich',
        'bms': 'BMS (Batterie-Management)',
        'parallelschaltung': 'Parallelschaltung',
        'reihenschaltung': 'Reihenschaltung',
        'selbstentladung_prozent_monat': 'Selbstentladung/Monat',
        'ladezeit_stunden': 'Ladezeit',
        'gewicht_kg': 'Gewicht',
        'abmessungen_mm': 'Abmessungen',
        'integrierte_heizung': 'Integrierte Heizung'
    };
    
    if (produkttyp === 'batterie' && payload.batterie_spezifikationen) {
        extractFieldsFromObject(payload.batterie_spezifikationen, batterieLabels, 10);
    }
    
    // 2. WECHSELRICHTER (16+ Felder)
    const wechselrichterLabels = {
        'nennleistung_w': 'Nennleistung',
        'max_leistung_w': 'Max. Leistung',
        'eingangsspannung_v': 'Eingangsspannung',
        'ausgangsspannung_v': 'Ausgangsspannung',
        'eingangsstrom_a': 'Eingangsstrom',
        'ausgangsstrom_a': 'Ausgangsstrom',
        'wirkungsgrad': 'Wirkungsgrad',
        'phasen': 'Phasen',
        'mppt': 'MPPT',
        'mppt_spannung_v': 'MPPT Spannung',
        'mppt_anzahl': 'MPPT Anzahl',
        'max_leerlaufspannung_v': 'Max. Leerlaufspannung',
        'wellenform': 'Wellenform',
        'frequenz_hz': 'Frequenz',
        'schutzklasse': 'Schutzklasse'
    };
    
    if (produkttyp === 'wechselrichter' && payload.wechselrichter_spezifikationen) {
        extractFieldsFromObject(payload.wechselrichter_spezifikationen, wechselrichterLabels, 10);
    }
    
    // 3. HYBRIDWECHSELRICHTER (11+ Felder)
    const hybridwechselrichterLabels = {
        'pv_leistung_max_w': 'PV-Leistung max',
        'pv_spannung_max_v': 'PV-Spannung max',
        'pv_spannung_min_v': 'PV-Spannung min',
        'pv_strom_max_a': 'PV-Strom max',
        'batterie_spannung_v': 'Batterie-Spannung',
        'batterie_kapazitaet_min_kwh': 'Batterie-Kapazität min',
        'batterie_kapazitaet_max_kwh': 'Batterie-Kapazität max',
        'notstrom': 'Notstrom',
        'notstrom_leistung_w': 'Notstrom-Leistung',
        'netzparallel': 'Netzparallel',
        'inselbetrieb': 'Inselbetrieb',
        'kompatible_batterien': 'Kompatible Batterien',
        'phasen': 'Phasen',
        'wirkungsgrad': 'Wirkungsgrad',
        'nennleistung_w': 'Nennleistung',
        'max_leistung_w': 'Max. Leistung'
    };
    
    if (produkttyp === 'hybridwechselrichter' && payload.hybridwechselrichter_spezifikationen) {
        extractFieldsFromObject(payload.hybridwechselrichter_spezifikationen, hybridwechselrichterLabels, 10);
    }
    
    // 4. SPEICHERSYSTEM (14+ Felder)
    const speichersystemLabels = {
        'speicherkapazitaet_kwh': 'Speicherkapazität',
        'speichertyp': 'Speichertyp',
        'batterie_spannung_v': 'Batterie-Spannung',
        'wechselrichter_integriert': 'Wechselrichter integriert',
        'wechselrichter_leistung_w': 'Wechselrichter-Leistung',
        'notstrom': 'Notstrom',
        'notstrom_leistung_w': 'Notstrom-Leistung',
        'erweiterbar': 'Erweiterbar',
        'max_module': 'Max. Module',
        'modul_kapazitaet_kwh': 'Modul-Kapazität',
        'entladetiefe': 'Entladetiefe',
        'wirkungsgrad_roundtrip': 'Roundtrip-Wirkungsgrad',
        'max_entladeleistung_w': 'Max. Entladeleistung',
        'max_ladeleistung_w': 'Max. Ladeleistung',
        'inselbetrieb': 'Inselbetrieb',
        'kompatible_wechselrichter': 'Kompatible Wechselrichter',
        'max_speicherkapazitaet_kwh': 'Max. Speicherkapazität',
        'selbstloeschend': 'Selbstlöschend'
    };
    
    if (produkttyp === 'speichersystem' && payload.speichersystem_spezifikationen) {
        extractFieldsFromObject(payload.speichersystem_spezifikationen, speichersystemLabels, 10);
    }
    
    // 5. SOLARMODUL (17+ Felder)
    const solarmodulLabels = {
        'modulleistung_wp': 'Modulleistung',
        'modulspannung_voc_v': 'Leerlaufspannung (Voc)',
        'modulspannung_vmp_v': 'MPP-Spannung (Vmp)',
        'modulstrom_isc_a': 'Kurzschlussstrom (Isc)',
        'modulstrom_imp_a': 'MPP-Strom (Imp)',
        'modultyp': 'Modultyp',
        'zellenanzahl': 'Zellenanzahl',
        'zelltyp': 'Zelltyp',
        'wirkungsgrad': 'Wirkungsgrad',
        'temperaturkoeffizient_pmax': 'Temp.-Koeff. Pmax',
        'temperaturkoeffizient_voc': 'Temp.-Koeff. Voc',
        'temperaturkoeffizient_isc': 'Temp.-Koeff. Isc',
        'max_systemspannung_v': 'Max. Systemspannung',
        'max_serienschaltung': 'Max. Serienschaltung',
        'max_parallelschaltung': 'Max. Parallelschaltung',
        'abmessungen_mm': 'Abmessungen',
        'gewicht_kg': 'Gewicht',
        'rahmenhoehe': 'Rahmenhöhe',
        'rahmenfarbe': 'Rahmenfarbe',
        'bifazial': 'Bifazial',
        'full_black': 'Full Black',
        'transparent': 'Transparent/Lichtdurchlässig'
    };
    
    if (produkttyp === 'solarmodul' && payload.solarmodul_spezifikationen) {
        extractFieldsFromObject(payload.solarmodul_spezifikationen, solarmodulLabels, 10);
    }
    
    // 6. LADEREGLER (12+ Felder)
    const ladereglerLabels = {
        'laderegler_typ': 'Laderegler-Typ',
        'ladestrom_a': 'Ladestrom',
        'ladestrom_max_a': 'Max. Ladestrom',
        'pv_leistung_max_w': 'PV-Leistung max',
        'pv_spannung_max_v': 'PV-Spannung max',
        'pv_spannung_min_v': 'PV-Spannung min',
        'pv_strom_max_a': 'PV-Strom max',
        'batterie_spannung_v': 'Batterie-Spannung',
        'spannungsbereich_v': 'Spannungsbereich',
        'temperaturkompensation': 'Temperaturkompensation',
        'ladephasen': 'Ladephasen',
        'ladeprotokolle': 'Ladeprotokolle',
        'unterstuetzte_batterietypen': 'Unterstützte Batterietypen'
    };
    
    if (produkttyp === 'laderegler' && payload.laderegler_spezifikationen) {
        extractFieldsFromObject(payload.laderegler_spezifikationen, ladereglerLabels, 10);
    }
    
    // 7. SPANNUNGSWANDLER (8+ Felder)
    const spannungswandlerLabels = {
        'eingangsspannung_v': 'Eingangsspannung',
        'ausgangsspannung_v': 'Ausgangsspannung',
        'leistung_w': 'Leistung',
        'strom_max_a': 'Max. Strom',
        'wirkungsgrad': 'Wirkungsgrad',
        'isoliert': 'Galvanisch isoliert',
        'schutzklasse': 'Schutzklasse',
        'temperaturbereich': 'Temperaturbereich',
        'unterstuetzte_batterietypen': 'Unterstützte Batterietypen'
    };
    
    if (produkttyp === 'spannungswandler' && payload.spannungswandler_spezifikationen) {
        extractFieldsFromObject(payload.spannungswandler_spezifikationen, spannungswandlerLabels, 10);
    }
    
    // 8. MIKROWECHSELRICHTER (9+ Felder)
    const mikrowechselrichterLabels = {
        'modulleistung_max_wp': 'Max. Modulleistung',
        'modulspannung_max_v': 'Max. Modulspannung',
        'modulspannung_min_v': 'Min. Modulspannung',
        'modulstrom_max_a': 'Max. Modulstrom',
        'ausgangsspannung_v': 'Ausgangsspannung',
        'ausgangsleistung_w': 'Ausgangsleistung',
        'wirkungsgrad': 'Wirkungsgrad',
        'mppt': 'MPPT',
        'netzparallel': 'Netzparallel',
        'phasen': 'Phasen'
    };
    
    if (produkttyp === 'mikrowechselrichter' && payload.mikrowechselrichter_spezifikationen) {
        extractFieldsFromObject(payload.mikrowechselrichter_spezifikationen, mikrowechselrichterLabels, 10);
    }
    
    // 9. STRINGWECHSELRICHTER (12+ Felder)
    const stringwechselrichterLabels = {
        'nennleistung_w': 'Nennleistung',
        'pv_leistung_max_w': 'PV-Leistung max',
        'pv_spannung_max_v': 'PV-Spannung max',
        'pv_spannung_min_v': 'PV-Spannung min',
        'pv_strom_max_a': 'PV-Strom max',
        'mppt_anzahl': 'MPPT Anzahl',
        'mppt_spannung_v': 'MPPT Spannung',
        'ausgangsspannung_v': 'Ausgangsspannung',
        'ausgangsleistung_w': 'Ausgangsleistung',
        'wirkungsgrad': 'Wirkungsgrad',
        'phasen': 'Phasen',
        'netzparallel': 'Netzparallel',
        'max_leerlaufspannung_v': 'Max. Leerlaufspannung'
    };
    
    if (produkttyp === 'stringwechselrichter' && payload.stringwechselrichter_spezifikationen) {
        extractFieldsFromObject(payload.stringwechselrichter_spezifikationen, stringwechselrichterLabels, 10);
    }
    
    // 10. POWERSTATION (14+ Felder)
    const powerstationLabels = {
        'kapazitaet_wh': 'Kapazität (Wh)',
        'kapazitaet_kwh': 'Kapazität (kWh)',
        'nennleistung_w': 'Nennleistung',
        'max_leistung_w': 'Max. Leistung',
        'batterie_typ': 'Batterietyp',
        'wechselrichter_integriert': 'Wechselrichter integriert',
        'notstrom': 'Notstrom/USV',
        'notstrom_leistung_w': 'Notstrom-Leistung',
        'ladezeit_stunden': 'Ladezeit',
        'anschluesse': 'Anschlüsse',
        'usb_ports': 'USB-Anschlüsse',
        'ac_ausgaenge': 'AC-Ausgänge',
        'dc_ausgaenge': 'DC-Ausgänge',
        'solar_ladung': 'Solar-Ladung',
        'solar_eingang_max_w': 'Solar-Eingang max',
        'netz_ladung': 'Netz-Ladung',
        'gewicht_kg': 'Gewicht',
        'abmessungen': 'Abmessungen',
        'display': 'Display',
        'app_steuerung': 'App-Steuerung',
        'wifi': 'WLAN',
        'bluetooth': 'Bluetooth',
        'erweiterbar': 'Erweiterbar',
        'zykluslebensdauer': 'Zyklenlebensdauer',
        'selbstloeschend': 'Selbstlöschend'
    };
    
    if (produkttyp === 'powerstation' && payload.powerstation_spezifikationen) {
        extractFieldsFromObject(payload.powerstation_spezifikationen, powerstationLabels, 10);
    }
    
    // 11. ZUBEHOER (10+ Felder) - Generisches Schema
    const zubehoerLabels = {
        'typ': 'Typ',
        'spannung_v': 'Spannung',
        'strom_a': 'Strom',
        'leistung_w': 'Leistung',
        'schutzklasse': 'Schutzklasse',
        'temperaturbereich': 'Temperaturbereich',
        'anschlussart': 'Anschlussart',
        'material': 'Material',
        'abmessungen_mm': 'Abmessungen',
        'gewicht_kg': 'Gewicht'
    };
    
    if (produkttyp === 'zubehoer' && payload.technische_spezifikationen) {
        extractFieldsFromObject(payload.technische_spezifikationen, zubehoerLabels, 10);
    }
    
    // ============================================================
    // GENERISCHER FALLBACK: Unbekannte Produkttypen
    // ============================================================
    const bekannteSpezifikationen = [
        'batterie_spezifikationen', 'wechselrichter_spezifikationen',
        'hybridwechselrichter_spezifikationen', 'speichersystem_spezifikationen',
        'solarmodul_spezifikationen', 'laderegler_spezifikationen',
        'spannungswandler_spezifikationen', 'mikrowechselrichter_spezifikationen',
        'stringwechselrichter_spezifikationen', 'powerstation_spezifikationen',
        'technische_spezifikationen', 'set_spezifikationen', 'komponenten_spezifikationen'
    ];
    
    for (const key of Object.keys(payload)) {
        if (key.endsWith('_spezifikationen') && !bekannteSpezifikationen.includes(key)) {
            const specData = payload[key];
            if (specData && typeof specData === 'object') {
                console.log(`Generischer Fallback: Extrahiere ${key}`);
                extractFieldsFromObject(specData, {}, 8);
            }
        }
    }
    
    // 2. Allgemeine technische Spezifikationen (mittlere Priorität)
    if (payload.technische_spezifikationen) {
        const s = payload.technische_spezifikationen;
        addSpec('Nennleistung', s.nennleistung_w ? `${s.nennleistung_w} W` : null, 5);
        addSpec('Max. Leistung', s.max_leistung_w ? `${s.max_leistung_w} W` : null, 5);
        addSpec('Eingangsspannung', s.eingangsspannung_v ? `${s.eingangsspannung_v} V` : null, 5);
        addSpec('Ausgangsspannung', s.ausgangsspannung_v, 5);
        addSpec('Eingangsstrom', s.eingangsstrom_a ? `${s.eingangsstrom_a} A` : null, 5);
        addSpec('Ausgangsstrom', s.ausgangsstrom_a ? `${s.ausgangsstrom_a} A` : null, 5);
        addSpec('Wirkungsgrad', s.wirkungsgrad ? `${s.wirkungsgrad}%` : null, 5);
        addSpec('Wellenform', s.wellenform, 5);
        addSpec('Phasen', s.phasen, 5);
        addSpec('Frequenz', s.frequenz_hz ? `${s.frequenz_hz} Hz` : null, 5);
        addSpec('MPPT', s.mppt, 5);
        addSpec('MPPT Spannung', s.mppt_spannung_v, 5);
        addSpec('MPPT Anzahl', s.mppt_anzahl, 5);
        addSpec('Schutzklasse', s.schutzklasse, 5);
        addSpec('Temperaturbereich', s.temperaturbereich, 5);
    }
    
    // 3. Eigenschaften - ALLE Felder dynamisch extrahieren
    const eigenschaftenLabels = {
        'notstrom': 'Notstrom',
        'erweiterbar': 'Erweiterbar',
        'modular': 'Modular',
        'wartungsfrei': 'Wartungsfrei',
        'app_steuerung': 'App-Steuerung',
        'wifi': 'WLAN',
        'bluetooth': 'Bluetooth',
        'display': 'Display'
    };
    
    if (payload.eigenschaften) {
        extractFieldsFromObject(payload.eigenschaften, eigenschaftenLabels, 3);
    }
    
    // 4. Sicherheit, Zertifikate & Normen - ALLE Felder dynamisch extrahieren
    const sicherheitLabels = {
        'schutzklasse': 'Schutzklasse',
        'ip_schutzklasse': 'IP-Schutzklasse',
        'schutzart': 'Schutzart',
        'zertifizierungen': 'Zertifizierungen',
        'zertifikate': 'Zertifikate',
        'normen': 'Normen',
        'vde_norm': 'VDE-Norm',
        'ce_kennzeichnung': 'CE-Kennzeichnung',
        'tuev': 'TÜV-Zertifiziert',
        'schutzfunktionen': 'Schutzfunktionen',
        'ueberspannungsschutz': 'Überspannungsschutz',
        'kurzschlussschutz': 'Kurzschlussschutz',
        'verpolungsschutz': 'Verpolungsschutz',
        'tiefentladeschutz': 'Tiefentladeschutz',
        'ueberladeschutz': 'Überladeschutz',
        'temperaturschutz': 'Temperaturschutz',
        'selbstloeschend': 'Selbstlöschend'
    };
    
    if (payload.sicherheit) {
        extractFieldsFromObject(payload.sicherheit, sicherheitLabels, 2);
    }
    
    // Direkte Sicherheitsfelder im Payload (falls nicht verschachtelt)
    if (payload.ip_schutzklasse) addSpec('IP-Schutzklasse', payload.ip_schutzklasse, 2);
    if (payload.zertifikate) addSpec('Zertifikate', payload.zertifikate, 2);
    if (payload.normen) addSpec('Normen', payload.normen, 2);
    
    // 5. Abmessungen und Gewicht
    if (payload.Laenge_cm && payload.Laenge_cm > 0) {
        addSpec('Länge', `${payload.Laenge_cm} cm`, 1);
    }
    if (payload.Breite_cm && payload.Breite_cm > 0) {
        addSpec('Breite', `${payload.Breite_cm} cm`, 1);
    }
    if (payload.Hoehe_cm && payload.Hoehe_cm > 0) {
        addSpec('Höhe', `${payload.Hoehe_cm} cm`, 1);
    }
    if (payload.Artikelgewicht_kg && payload.Artikelgewicht_kg > 0) {
        addSpec('Gewicht', `${payload.Artikelgewicht_kg} kg`, 1);
    }
    if (payload.Versandgewicht_kg && payload.Versandgewicht_kg > 0) {
        addSpec('Versandgewicht', `${payload.Versandgewicht_kg} kg`, 1);
    }
    
    // 6. Allgemeine Felder
    addSpec('Qualität', payload.qualitaet, 0);
    addSpec('Vollständig', payload.vollstaendig !== undefined ? (payload.vollstaendig ? 'Ja' : 'Nein') : null, 0);
    addSpec('PDF-Dokumente', payload.pdf_count, 0);
    
    // Sortiere nach Priorität (höchste zuerst) und dann alphabetisch
    specs.sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority;
        return a.label.localeCompare(b.label);
    });
    
    return specs;
}

async function showProductDetails(product) {
    const display = document.getElementById('product-display');
    display.classList.remove('hidden');
    
    const payload = product.payload || {};
    
    // Lade Preis- und Lieferanten-Daten aus Platform-API (automatisch für alle Produkte)
    let pricingData = null;
    let supplierData = null;
    const artikelnummer = product.artikelnummer || payload.artikelnummer;
    
    if (artikelnummer) {
        try {
            const response = await fetch(`${API_BASE}/api/product/${artikelnummer}/pricing`);
            const data = await response.json();
            if (data.success) {
                pricingData = data.pricing || {};
                supplierData = data.supplier || {};
            }
        } catch (error) {
            console.warn('Fehler beim Laden der Preis-Daten:', error);
        }
    }
    
    // Bereinige HTML aus Beschreibung
    function stripHTML(html) {
        if (!html) return '';
        const tmp = document.createElement('DIV');
        tmp.innerHTML = html;
        return tmp.textContent || tmp.innerText || '';
    }
    
    // Formatierung für Preise
    function formatPrice(price) {
        if (price === null || price === undefined) return 'N/A';
        return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(price);
    }
    
    // Erstelle Preis-HTML
    function createPricingHTML(pricing) {
        if (!pricing || Object.keys(pricing).length === 0) return '';
        
        let html = '';
        
        // Einkaufspreis - nur der Preis, der von der API kommt (ohne MwSt-Varianten)
        // Priorität: einkaufspreis_netto > einkaufspreis_19_mwst > einkaufspreis_0_mwst
        let einkaufspreis = null;
        if (pricing.einkaufspreis_netto !== null && pricing.einkaufspreis_netto !== undefined) {
            einkaufspreis = pricing.einkaufspreis_netto;
        } else if (pricing.einkaufspreis_19_mwst !== null && pricing.einkaufspreis_19_mwst !== undefined) {
            einkaufspreis = pricing.einkaufspreis_19_mwst;
        } else if (pricing.einkaufspreis_0_mwst !== null && pricing.einkaufspreis_0_mwst !== undefined) {
            einkaufspreis = pricing.einkaufspreis_0_mwst;
        }
        
        if (einkaufspreis !== null && einkaufspreis !== undefined) {
            html += `<div class="info-row"><span class="info-label">Einkaufspreis:</span><span class="info-value">${formatPrice(einkaufspreis)}</span></div>`;
        }
        
        // Verkaufspreise
        if (pricing.verkaufspreis_netto || pricing.verkaufspreis_0_mwst || pricing.verkaufspreis_19_mwst) {
            html += '<div class="info-row"><span class="info-label">Verkaufspreis:</span><span class="info-value"><ul class="pricing-list">';
            if (pricing.verkaufspreis_netto) html += `<li>Netto: ${formatPrice(pricing.verkaufspreis_netto)}</li>`;
            if (pricing.verkaufspreis_0_mwst) html += `<li>0% MwSt: ${formatPrice(pricing.verkaufspreis_0_mwst)}</li>`;
            if (pricing.verkaufspreis_19_mwst) html += `<li>19% MwSt: ${formatPrice(pricing.verkaufspreis_19_mwst)}</li>`;
            html += '</ul></span></div>';
        }
        
        // Angebot & Streichpreise (nur bei echten Shop-Angeboten)
        if (pricing.ist_angebot && pricing.ursprungs_preis && pricing.reduzierter_preis && pricing.aktueller_rabatt > 0) {
            html += '<div class="info-row"><span class="info-label">Angebot:</span><span class="info-value">';
            html += `<span class="strike-price">${formatPrice(pricing.ursprungs_preis)}</span> `;
            html += `<span class="reduced-price">${formatPrice(pricing.reduzierter_preis)}</span> `;
            html += `<span class="discount-badge">-${pricing.aktueller_rabatt}%</span>`;
            html += '</span></div>';
        } else if (pricing.ist_angebot && pricing.aktueller_rabatt && pricing.aktueller_rabatt > 0) {
            html += `<div class="info-row"><span class="info-label">Aktuelles Angebot:</span><span class="info-value discount-badge">-${pricing.aktueller_rabatt}%</span></div>`;
        }
        
        // Stücklistenpreise (verbessert)
        if (pricing.stuecklistenpreise && pricing.stuecklistenpreise.length > 0) {
            html += '<div class="info-row full-width"><span class="info-label">Stücklistenpreise:</span><span class="info-value"><ul class="pricing-list bom-list">';
            pricing.stuecklistenpreise.forEach(item => {
                html += `<li><strong>${item.artikelnummer}</strong>: `;
                if (item.einkaufspreis_netto) html += `EK ${formatPrice(item.einkaufspreis_netto)}`;
                if (item.einkaufspreis_netto && item.verkaufspreis_netto) html += ' | ';
                if (item.verkaufspreis_netto) html += `VK ${formatPrice(item.verkaufspreis_netto)}`;
                html += '</li>';
            });
            html += '</ul></span></div>';
        }
        
        return html;
    }
    
    // Erstelle Lieferanten-HTML (verbessert - zeigt nur Namen wenn vorhanden)
    function createSupplierHTML(supplier) {
        if (!supplier || !supplier.standardlieferant) return '';
        
        const lieferant = supplier.standardlieferant;
        
        // Zeige Standardlieferant nur wenn Name vorhanden ist
        if (lieferant.name) {
            let html = '<div class="info-row"><span class="info-label">Standardlieferant:</span><span class="info-value">';
            html += `<strong>${lieferant.name}</strong>`;
            if (lieferant.lieferantennummer) {
                html += ` <span class="supplier-number">(${lieferant.lieferantennummer})</span>`;
            }
            html += '</span></div>';
            return html;
        }
        
        return '';
    }
    
    // Erstelle Stücklisten-HTML (als letzte Information in Grundinformationen)
    function createStuecklisteHTML(payload) {
        const kompatibilitaet = payload.kompatibilitaet;
        if (!kompatibilitaet) return '';
        
        const stueckliste = kompatibilitaet.stueckliste;
        if (!stueckliste || !Array.isArray(stueckliste) || stueckliste.length === 0) return '';
        
        let html = '<div class="info-row"><span class="info-label">Stückliste:</span><span class="info-value"><ul class="stueckliste-list">';
        
        stueckliste.forEach(komponente => {
            const artikelnummer = komponente.artikelnummer || 'N/A';
            const menge = komponente.menge || 1;
            const rolle = komponente.rolle || 'Komponente';
            
            html += `<li><strong>${menge}x</strong> ${artikelnummer}`;
            if (rolle && rolle !== 'Komponente') {
                html += ` <span class="rolle">(${rolle})</span>`;
            }
            html += '</li>';
        });
        
        html += '</ul></span></div>';
        return html;
    }
    
    let detailsHTML = `
        <div class="product-details-container">
            <div class="product-details-header">
                <div class="header-content">
                    <h3>${product.artikelname || 'Unbekannt'}</h3>
                    <div class="product-details-meta">
                        <span class="meta-item"><strong>Artikelnummer:</strong> ${product.artikelnummer || 'N/A'}</span>
                        <span class="meta-item"><strong>Produkttyp:</strong> ${product.produkttyp || 'N/A'}</span>
                        <span class="meta-item"><strong>Hersteller:</strong> ${product.hersteller || 'N/A'}</span>
                    </div>
                </div>
                <button class="close-details-btn" onclick="closeProductDetails()" title="Details schließen">&times;</button>
            </div>
            
            <div class="product-details-content">
                <div class="product-details-column">
                    <h4>Grundinformationen</h4>
                    <div class="info-section">
                        <div class="info-row">
                            <span class="info-label">Artikelnummer:</span>
                            <span class="info-value">${product.artikelnummer || 'N/A'}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Produkt-ID:</span>
                            <span class="info-value">${payload.artikel_id || product.artikel_id || 'N/A'}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Produkttyp:</span>
                            <span class="info-value">${product.produkttyp || 'N/A'}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Hersteller:</span>
                            <span class="info-value">${product.hersteller || 'N/A'}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Kategorie:</span>
                            <span class="info-value">${product.kategoriepfad || 'N/A'}</span>
                        </div>
                        ${(product.produkt_url || payload.produkt_url) ? `
                        <div class="info-row">
                            <span class="info-label">Produkt-Link:</span>
                            <span class="info-value">
                                <a href="${product.produkt_url || payload.produkt_url}" target="_blank" class="product-link-btn">
                                    🔗 Zum Produkt
                                </a>
                            </span>
                        </div>
                        ` : ''}
                        ${createPricingHTML(pricingData)}
                        ${createSupplierHTML(supplierData)}
                        ${createStuecklisteHTML(payload)}
                    </div>
                </div>
                
                <div class="product-details-column">
                    <h4>Beschreibung</h4>
                    <div class="info-section">
                        ${product.kurzbeschreibung ? `
                        <div class="info-row full-width">
                            <span class="info-value">${product.kurzbeschreibung}</span>
                        </div>
                        ` : (product.beschreibung ? `
                        <div class="info-row full-width">
                            <span class="info-value description-text">${stripHTML(product.beschreibung).substring(0, 500)}${stripHTML(product.beschreibung).length > 500 ? '...' : ''}</span>
                        </div>
                        ` : '<div class="info-row full-width"><span class="info-value">Keine Beschreibung verfügbar</span></div>')}
                    </div>
                </div>
                
                <div class="product-details-column">
                    <h4>Technische Spezifikationen</h4>
                    <div class="info-section">
    `;
    
    // Intelligente Extraktion aller technischen Daten
    const techSpecs = extractAllTechnicalSpecs(product, payload);
    techSpecs.forEach(spec => {
        detailsHTML += `<div class="info-row"><span class="info-label">${spec.label}:</span><span class="info-value">${spec.value}</span></div>`;
    });
    
    detailsHTML += `
                    </div>
                </div>
            </div>
        </div>
    `;
    
    display.innerHTML = detailsHTML;
}

// Modal-Funktionen
function showProductSearch() {
    document.getElementById('product-search-modal').classList.remove('hidden');
}

function showProductCompare() {
    document.getElementById('product-compare-modal').classList.remove('hidden');
}

function showStorageRecommendation() {
    document.getElementById('storage-recommendation-modal').classList.remove('hidden');
}

function showPVRecommendation() {
    document.getElementById('pv-recommendation-modal').classList.remove('hidden');
}

async function getPVRecommendation() {
    // Sammle alle Eingaben
    const dachflaeche = document.getElementById('pv-dachflaeche').value ? 
        parseFloat(document.getElementById('pv-dachflaeche').value) : null;
    const leistungKwp = document.getElementById('pv-leistung-kwp').value ? 
        parseFloat(document.getElementById('pv-leistung-kwp').value) : null;
    const neigung = parseInt(document.getElementById('pv-neigung').value) || 30;
    const ausrichtung = document.getElementById('pv-ausrichtung').value || 'sued';
    const stromverbrauch = document.getElementById('pv-stromverbrauch').value ? 
        parseFloat(document.getElementById('pv-stromverbrauch').value) : null;
    const mitSpeicher = document.getElementById('pv-mit-speicher').checked;
    const notstrom = document.getElementById('pv-notstrom').checked;
    const balkon = document.getElementById('pv-balkon').checked;
    const budget = document.getElementById('pv-budget').value ? 
        parseFloat(document.getElementById('pv-budget').value) : null;
    const beschreibung = document.getElementById('pv-beschreibung').value || null;
    
    // Validierung
    if (!dachflaeche && !leistungKwp) {
        alert('Bitte gib entweder die Dachfläche oder die gewünschte Leistung an.');
        return;
    }
    
    const resultsDiv = document.getElementById('pv-results');
    resultsDiv.innerHTML = '<div class="loading-container"><div class="loading"></div><span>Berechne PV-Empfehlung...</span></div>';
    
    try {
        const response = await fetch(`${API_BASE}/api/pv-recommendation`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                dachflaeche_m2: dachflaeche,
                gewuenschte_leistung_kwp: leistungKwp,
                dachneigung_grad: neigung,
                dachausrichtung: ausrichtung,
                stromverbrauch_kwh: stromverbrauch,
                mit_speicher: mitSpeicher,
                notstromfaehig: notstrom,
                balkonkraftwerk: balkon,
                max_budget: budget,
                beschreibung: beschreibung
            })
        });
        
        const data = await response.json();
        
        // Formatiere Ergebnisse
        let html = '<div class="pv-results-content">';
        
        // Parameter-Zusammenfassung
        if (data.parameter) {
            html += '<div class="pv-params-summary">';
            html += '<h4>📊 Berechnungsgrundlage</h4>';
            html += '<div class="params-grid">';
            html += `<span>Leistung: <strong>${data.parameter.gewuenschte_leistung_kwp?.toFixed(1) || '?'} kWp</strong></span>`;
            html += `<span>Erwarteter Ertrag: <strong>${data.parameter.erwarteter_ertrag_kwh?.toLocaleString() || '?'} kWh/Jahr</strong></span>`;
            html += `<span>Ausrichtung: <strong>${data.parameter.dachausrichtung?.toUpperCase() || '?'}</strong></span>`;
            html += `<span>Speicher: <strong>${data.parameter.mit_speicher ? 'Ja' : 'Nein'}</strong></span>`;
            html += '</div>';
            html += '</div>';
        }
        
        // Empfehlungstext
        html += '<div class="pv-recommendation-text">';
        html += `<div class="message assistant"><div class="message-bubble">${markdownToHTML(data.response)}</div></div>`;
        html += '</div>';
        
        // Gefundene Sets
        if (data.components && data.components.sets && data.components.sets.length > 0) {
            html += '<div class="pv-sets-section">';
            html += '<h4>🎯 Gefundene Komplett-Sets</h4>';
            html += '<div class="pv-product-grid">';
            for (const set of data.components.sets.slice(0, 5)) {
                const score = Math.round((set.score || 0) * 100);
                html += `<div class="pv-product-card set-card">`;
                html += `<div class="product-score">${score}% passend</div>`;
                html += `<h5>${set.artikelname || 'Unbekannt'}</h5>`;
                html += `<p class="product-artikelnummer">Art.-Nr.: ${set.artikelnummer || 'N/A'}</p>`;
                if (set.stueckliste && set.stueckliste.length > 0) {
                    html += `<p class="product-components">📦 ${set.stueckliste.length} Komponenten enthalten</p>`;
                }
                html += `</div>`;
            }
            html += '</div>';
            html += '</div>';
        }
        
        html += '</div>';
        resultsDiv.innerHTML = html;
        
    } catch (error) {
        console.error('PV-Empfehlung Fehler:', error);
        resultsDiv.innerHTML = `<div class="error">Fehler bei der Berechnung: ${error.message}</div>`;
    }
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.add('hidden');
}

function closeProductDetails() {
    document.getElementById('product-display').classList.add('hidden');
}

// Produktsuche
async function performSearch() {
    const query = document.getElementById('search-query').value.trim();
    const produkttyp = document.getElementById('product-type-filter').value;
    
    if (!query) {
        alert('Bitte geben Sie einen Suchbegriff ein.');
        return;
    }
    
    const resultsDiv = document.getElementById('search-results');
    resultsDiv.innerHTML = '<div class="loading"></div> Suche...';
    
    try {
        const url = `${API_BASE}/api/search?query=${encodeURIComponent(query)}&limit=10${produkttyp ? `&produkttyp=${produkttyp}` : ''}`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.products && data.products.length > 0) {
            resultsDiv.innerHTML = data.products.map((product, index) => `
                <div class="product-result" onclick='showProductDetailsFromSearch(${index})'>
                    <h3>${product.artikelname || 'Unbekannt'}</h3>
                    <div class="details">
                        <strong>Artikelnummer:</strong> ${product.artikelnummer || 'N/A'}<br>
                        <strong>Typ:</strong> ${product.produkttyp || 'N/A'} | 
                        <strong>Hersteller:</strong> ${product.hersteller || 'N/A'}<br>
                        <strong>Relevanz:</strong> ${(product.score * 100).toFixed(1)}%
                    </div>
                </div>
            `).join('');
            
            // Speichere Produkte für späteren Zugriff
            window.searchResults = data.products;
        } else {
            resultsDiv.innerHTML = '<p>Keine Produkte gefunden.</p>';
        }
    } catch (error) {
        resultsDiv.innerHTML = `<p>Fehler: ${error.message}</p>`;
    }
}

// Funktion zum Extrahieren von strukturierten Informationen aus Vergleichstext
function extractStructuredComparison(responseText, products) {
    const result = {
        produkt1: {
            einsatzgebiete: [],
            kurzbeschreibung: '',
            empfehlung: ''
        },
        produkt2: {
            einsatzgebiete: [],
            kurzbeschreibung: '',
            empfehlung: ''
        },
        vergleich: {
            vergleich_allgemein: [],  // Stichpunkte zum allgemeinen Vergleich
            technische_unterschiede: [],  // Technische Unterschiede
            preis_leistung: [],  // Preis-Leistungs-Verhältnis
            wann_besser: [],  // Wann welches Produkt besser ist
            vergleich_text: '',  // Vollständiger Vergleichstext
            produkt1_alles: {
                vorteile: [],
                nachteile: [],
                weitere_info: []
            },
            produkt2_alles: {
                vorteile: [],
                nachteile: [],
                weitere_info: []
            }
        }
    };
    
    if (!responseText || !products || products.length < 2) {
        return result;
    }
    
    // Sicherstellen dass responseText ein String ist
    if (typeof responseText !== 'string') {
        responseText = String(responseText || '');
    }
    
    const produkt1Name = (products[0].artikelname || '').toLowerCase();
    const produkt2Name = (products[1].artikelname || '').toLowerCase();
    const produkt1ArtNr = (products[0].artikelnummer || '').toLowerCase();
    const produkt2ArtNr = (products[1].artikelnummer || '').toLowerCase();
    
    // Teile Text in Abschnitte
    const sections = responseText.split(/===/);
    
    let currentProduct = null;
    let currentSection = null;
    
    for (const section of sections) {
        const sectionLower = section.toLowerCase();
        
        // Erkenne Produkt-Abschnitte
        if (sectionLower.includes('produkt 1') || 
            sectionLower.includes(produkt1Name) || 
            sectionLower.includes(produkt1ArtNr)) {
            currentProduct = 'produkt1';
        } else if (sectionLower.includes('produkt 2') || 
                   sectionLower.includes(produkt2Name) || 
                   sectionLower.includes(produkt2ArtNr)) {
            currentProduct = 'produkt2';
        } else if (sectionLower.includes('produktvergleich')) {
            currentProduct = 'vergleich';
        }
        
        if (!currentProduct) continue;
        
        // Parse strukturierte Inhalte
        const lines = section.split('\n');
        let inEinsatzgebiete = false;
        let inKurzbeschreibung = false;
        let inEmpfehlung = false;
        let inVorteile = false;
        let inNachteile = false;
        let inVergleich = false;
        let inVergleichAllgemein = false;
        let inTechnischeUnterschiede = false;
        let inPreisLeistung = false;
        let inWannBesser = false;
        let inWeitereInfo = false;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            const lineLower = line.toLowerCase();
            
            // Erkenne Überschriften für Produkt 1 & 2 (Kurzbeschreibung mit Verwendung, Kompatibilität, Eigenschaften)
            if (lineLower.includes('ideale einsatzgebiete') || lineLower.includes('einsatzgebiete')) {
                inEinsatzgebiete = true;
                inKurzbeschreibung = false;
                inEmpfehlung = false;
                continue;
            } else if (lineLower.includes('kurzbeschreibung') || lineLower.includes('verwendung') || lineLower.includes('kompatibilität') || lineLower.includes('spezielle eigenschaften')) {
                inKurzbeschreibung = true;
                inEinsatzgebiete = false;
                inEmpfehlung = false;
                continue;
            } else if (lineLower.includes('empfehlung')) {
                inEmpfehlung = true;
                inEinsatzgebiete = false;
                inKurzbeschreibung = false;
                continue;
            } else if (lineLower.includes('vorteile produkt 1') || lineLower.includes('vorteile produkt1')) {
                inVorteile = true;
                currentSection = 'produkt1';
                continue;
            } else if (lineLower.includes('nachteile produkt 1') || lineLower.includes('nachteile produkt1')) {
                inNachteile = true;
                currentSection = 'produkt1';
                continue;
            } else if (lineLower.includes('vorteile produkt 2') || lineLower.includes('vorteile produkt2')) {
                inVorteile = true;
                currentSection = 'produkt2';
                continue;
            } else if (lineLower.includes('nachteile produkt 2') || lineLower.includes('nachteile produkt2')) {
                inNachteile = true;
                currentSection = 'produkt2';
                continue;
            } else if (lineLower.includes('vergleich:') || lineLower.includes('**vergleich**')) {
                inVergleich = true;
                continue;
            }
            
            // Extrahiere Inhalte
            if (currentProduct === 'produkt1' || currentProduct === 'produkt2') {
                if (inEinsatzgebiete && line.match(/^[-*•]\s+/)) {
                    const content = line.replace(/^[-*•]\s+/, '').trim();
                    if (content && content.length > 10) {
                        result[currentProduct].einsatzgebiete.push(content);
                    }
                } else if (inKurzbeschreibung && line.length > 10 && !line.match(/^\*\*/)) {
                    // Extrahiere Verwendung, Kompatibilität, Spezielle Eigenschaften
                    const lineLower = line.toLowerCase();
                    if (lineLower.includes('verwendung:') || lineLower.includes('verwendung ')) {
                        const match = line.match(/(?:verwendung:?\s*)(.+)/i);
                        if (match) {
                            result[currentProduct].verwendung = match[1].trim();
                        }
                    } else if (lineLower.includes('kompatibilität:') || lineLower.includes('kompatibel')) {
                        const match = line.match(/(?:kompatibilität:?\s*|kompatibel:?\s*)(.+)/i);
                        if (match) {
                            result[currentProduct].kompatibilitaet = match[1].trim();
                        }
                    } else if (lineLower.includes('spezielle eigenschaften:') || lineLower.includes('eigenschaften:')) {
                        const match = line.match(/(?:spezielle eigenschaften:?\s*|eigenschaften:?\s*)(.+)/i);
                        if (match) {
                            result[currentProduct].eigenschaften = match[1].trim();
                        }
                    } else if (line.match(/^[-*•]\s+/)) {
                        // Bullet Point - könnte zu einem der Felder gehören
                        const content = line.replace(/^[-*•]\s+/, '').trim();
                        if (content.length > 10) {
                            if (!result[currentProduct].verwendung && !result[currentProduct].kompatibilitaet && !result[currentProduct].eigenschaften) {
                                result[currentProduct].verwendung = content;
                            } else if (!result[currentProduct].kompatibilitaet) {
                                result[currentProduct].kompatibilitaet = content;
                            } else if (!result[currentProduct].eigenschaften) {
                                result[currentProduct].eigenschaften = content;
                            }
                        }
                    } else if (line.length > 20) {
                        // Fallback: Füge zu kurzbeschreibung hinzu
                        if (!result[currentProduct].kurzbeschreibung) {
                            result[currentProduct].kurzbeschreibung = line;
                        } else {
                            result[currentProduct].kurzbeschreibung += ' ' + line;
                        }
                    }
                } else if (inEmpfehlung && line.length > 10 && !line.match(/^\*\*/)) {
                    if (!result[currentProduct].empfehlung) {
                        result[currentProduct].empfehlung = line;
                    } else {
                        result[currentProduct].empfehlung += ' ' + line;
                    }
                }
            } else if (currentProduct === 'vergleich') {
                // Erkenne neue Überschriften für Vergleichs-Abschnitt
                if (lineLower.includes('vergleich allgemein') || lineLower.includes('**vergleich allgemein**') || lineLower.match(/^vergleich allgemein:/i)) {
                    inVergleichAllgemein = true;
                    inTechnischeUnterschiede = false;
                    inPreisLeistung = false;
                    inWannBesser = false;
                    inVorteile = false;
                    inNachteile = false;
                    inWeitereInfo = false;
                    currentSection = null;
                    continue;
                } else if (lineLower.includes('technische unterschiede')) {
                    inVergleichAllgemein = false;
                    inTechnischeUnterschiede = true;
                    inPreisLeistung = false;
                    inWannBesser = false;
                    currentSection = null;
                    continue;
                } else if (lineLower.includes('preis-leistungs-verhältnis') || lineLower.includes('preis-leistung')) {
                    inVergleichAllgemein = false;
                    inTechnischeUnterschiede = false;
                    inPreisLeistung = true;
                    inWannBesser = false;
                    currentSection = null;
                    continue;
                } else if (lineLower.includes('wann welches produkt besser ist') || lineLower.includes('wann besser')) {
                    inVergleichAllgemein = false;
                    inTechnischeUnterschiede = false;
                    inPreisLeistung = false;
                    inWannBesser = true;
                    currentSection = null;
                    continue;
                } else if ((lineLower.includes('produkt 1:') && !lineLower.includes('alles')) || 
                          (lineLower.match(/^produkt 1:/i))) {
                    inVergleichAllgemein = false;
                    inTechnischeUnterschiede = false;
                    inPreisLeistung = false;
                    inWannBesser = false;
                    inVorteile = false;
                    inNachteile = false;
                    inWeitereInfo = false;
                    currentSection = 'produkt1_alles';
                    continue;
                } else if ((lineLower.includes('produkt 2:') && !lineLower.includes('alles')) ||
                          (lineLower.match(/^produkt 2:/i))) {
                    inVergleichAllgemein = false;
                    inTechnischeUnterschiede = false;
                    inPreisLeistung = false;
                    inWannBesser = false;
                    inVorteile = false;
                    inNachteile = false;
                    inWeitereInfo = false;
                    currentSection = 'produkt2_alles';
                    continue;
                } else if (lineLower.includes('vorteile:') && currentSection && currentSection.includes('produkt')) {
                    inVorteile = true;
                    inNachteile = false;
                    inWeitereInfo = false;
                    continue;
                } else if (lineLower.includes('nachteile:') && currentSection && currentSection.includes('produkt')) {
                    inNachteile = true;
                    inVorteile = false;
                    inWeitereInfo = false;
                    continue;
                } else if (lineLower.includes('weitere wichtige informationen') || lineLower.includes('weitere informationen')) {
                    inWeitereInfo = true;
                    inVorteile = false;
                    inNachteile = false;
                    continue;
                }
                
                // Extrahiere Inhalte basierend auf aktuellem Abschnitt
                if (inVergleichAllgemein && line.match(/^[-*•]\s+/)) {
                    // Vergleich allgemein - Stichpunkte
                    const content = line.replace(/^[-*•]\s+/, '').trim();
                    if (content && content.length > 10) {
                        result.vergleich.vergleich_allgemein.push(content);
                    }
                } else if (inTechnischeUnterschiede && line.match(/^[-*•]\s+/)) {
                    // Technische Unterschiede - zu separatem Array
                    const content = line.replace(/^[-*•]\s+/, '').trim();
                    if (content && content.length > 10) {
                        result.vergleich.technische_unterschiede.push(content);
                    }
                } else if (inPreisLeistung && line.match(/^[-*•]\s+/)) {
                    // Preis-Leistungs-Verhältnis - zu separatem Array
                    const content = line.replace(/^[-*•]\s+/, '').trim();
                    if (content && content.length > 10) {
                        result.vergleich.preis_leistung.push(content);
                    }
                } else if (inWannBesser && line.match(/^[-*•]\s+/)) {
                    // Wann welches Produkt besser ist - zu separatem Array
                    const content = line.replace(/^[-*•]\s+/, '').trim();
                    if (content && content.length > 10) {
                        result.vergleich.wann_besser.push(content);
                    }
                } else if (currentSection === 'produkt1_alles') {
                    if (inVorteile && line.match(/^[-*•]\s+/)) {
                        const content = line.replace(/^[-*•]\s+/, '').trim();
                        if (content && content.length > 10) {
                            result.vergleich.produkt1_alles.vorteile.push(content);
                        }
                    } else if (inNachteile && line.match(/^[-*•]\s+/)) {
                        const content = line.replace(/^[-*•]\s+/, '').trim();
                        if (content && content.length > 10) {
                            result.vergleich.produkt1_alles.nachteile.push(content);
                        }
                    } else if (inWeitereInfo && line.match(/^[-*•]\s+/)) {
                        const content = line.replace(/^[-*•]\s+/, '').trim();
                        if (content && content.length > 10) {
                            result.vergleich.produkt1_alles.weitere_info.push(content);
                        }
                    }
                } else if (currentSection === 'produkt2_alles') {
                    if (inVorteile && line.match(/^[-*•]\s+/)) {
                        const content = line.replace(/^[-*•]\s+/, '').trim();
                        if (content && content.length > 10) {
                            result.vergleich.produkt2_alles.vorteile.push(content);
                        }
                    } else if (inNachteile && line.match(/^[-*•]\s+/)) {
                        const content = line.replace(/^[-*•]\s+/, '').trim();
                        if (content && content.length > 10) {
                            result.vergleich.produkt2_alles.nachteile.push(content);
                        }
                    } else if (inWeitereInfo && line.match(/^[-*•]\s+/)) {
                        const content = line.replace(/^[-*•]\s+/, '').trim();
                        if (content && content.length > 10) {
                            result.vergleich.produkt2_alles.weitere_info.push(content);
                        }
                    }
                }
            }
        }
    }
    
    // Bereinige Ergebnisse
    ['produkt1', 'produkt2'].forEach(prod => {
        // Sicherstellen dass kurzbeschreibung und empfehlung Strings sind
        if (result[prod].kurzbeschreibung) {
            result[prod].kurzbeschreibung = String(result[prod].kurzbeschreibung).trim().substring(0, 500);
        } else {
            result[prod].kurzbeschreibung = '';
        }
        if (result[prod].empfehlung) {
            result[prod].empfehlung = String(result[prod].empfehlung).trim().substring(0, 300);
        } else {
            result[prod].empfehlung = '';
        }
        result[prod].einsatzgebiete = result[prod].einsatzgebiete.slice(0, 5);
    });
    
    // Sicherstellen dass vergleich_text ein String ist
    if (result.vergleich.vergleich_text) {
        result.vergleich.vergleich_text = String(result.vergleich.vergleich_text).trim().substring(0, 1000);
    } else {
        result.vergleich.vergleich_text = '';
    }
    
    console.log('Extrahierte strukturierte Informationen:', result);
    return result;
}

// Funktion zum Extrahieren von Produkt-spezifischen Informationen aus Vergleichstext (LEGACY - wird nicht mehr verwendet)
function extractProductInfo(responseText, productName, artikelnummer, allProducts) {
    const info = {
        vorteile: [],
        nachteile: [],
        einsatzgebiete: [],
        empfehlungen: [],
        kurzbeschreibung: ''
    };
    
    if (!responseText || !productName) {
        console.log('extractProductInfo: Kein Text oder Produktname');
        return info;
    }
    
    // Normalisiere Produktname für Suche
    const normalizedName = productName.toLowerCase();
    const normalizedArtNr = artikelnummer.toLowerCase();
    const productNameParts = productName.split(' ').filter(p => p.length > 3).map(p => p.toLowerCase());
    
    // Erstelle Liste aller anderen Produktnamen (für Ausschluss)
    const otherProductNames = allProducts
        .filter(p => (p.artikelname || '').toLowerCase() !== normalizedName)
        .map(p => (p.artikelname || '').toLowerCase())
        .filter(n => n && n.length > 5);
    
    console.log(`Extrahieren für: ${productName} (${artikelnummer})`);
    console.log(`Produktname-Teile:`, productNameParts);
    console.log(`Andere Produkte:`, otherProductNames);
    
    // Strategie 1: Suche nach Produktnamen im gesamten Text und extrahiere Kontext
    const productIndices = [];
    let searchIndex = 0;
    const searchText = responseText.toLowerCase();
    
    // Suche nach vollständigem Produktnamen
    while ((searchIndex = searchText.indexOf(normalizedName, searchIndex)) !== -1) {
        productIndices.push(searchIndex);
        searchIndex += normalizedName.length;
    }
    
    // Suche nach Produktname-Teilen (falls vollständiger Name nicht gefunden)
    if (productIndices.length === 0) {
        for (const part of productNameParts) {
            if (part.length > 4) {
                searchIndex = 0;
                while ((searchIndex = searchText.indexOf(part, searchIndex)) !== -1) {
                    productIndices.push(searchIndex);
                    searchIndex += part.length;
                }
            }
        }
    }
    
    // Suche nach Artikelnummer
    if (normalizedArtNr && normalizedArtNr.length > 3) {
        searchIndex = 0;
        while ((searchIndex = searchText.indexOf(normalizedArtNr, searchIndex)) !== -1) {
            productIndices.push(searchIndex);
            searchIndex += normalizedArtNr.length;
        }
    }
    
    console.log(`Gefundene Indizes:`, productIndices.length);
    
    // Für jeden Fund: Extrahiere Kontext
    for (const productIndex of productIndices) {
        const contextStart = Math.max(0, productIndex - 400);
        const contextEnd = Math.min(responseText.length, productIndex + 600);
        const context = responseText.substring(contextStart, contextEnd);
        
        // Teile Kontext in Sätze und Zeilen
        const sentences = context.split(/[.!?]\s+/).filter(s => s.length > 15);
        const lines = context.split('\n').map(l => l.trim()).filter(l => l && l.length > 10);
        
        // Analysiere Sätze
        for (const sentence of sentences) {
            const sLower = sentence.toLowerCase();
            const trimmed = sentence.trim();
            
            // Prüfe ob Satz zu diesem Produkt gehört
            const mentionsProduct = sLower.includes(normalizedName) || 
                                  sLower.includes(normalizedArtNr) ||
                                  productNameParts.some(part => part.length > 4 && sLower.includes(part));
            
            // Prüfe ob Satz zu anderen Produkten gehört
            const mentionsOther = otherProductNames.some(otherName => 
                otherName.length > 5 && sLower.includes(otherName)
            );
            
            if (!mentionsProduct || mentionsOther) continue;
            
            // Kategorisiere Satz
            if (sLower.match(/(vorteil|stärke|besser|höher|mehr|überlegen|positiv|plus|vorzüge)/) && 
                !sLower.includes('nachteil') && trimmed.length > 20 && !info.vorteile.includes(trimmed)) {
                info.vorteile.push(trimmed);
            } else if (sLower.match(/(nachteil|schwäche|weniger|niedriger|schlechter|negativ|minus)/) && 
                      trimmed.length > 20 && !info.nachteile.includes(trimmed)) {
                info.nachteile.push(trimmed);
            } else if (sLower.match(/(einsatz|anwendung|geeignet|ideal|passend|empfohlen|verwendung)/) && 
                      trimmed.length > 20 && !info.einsatzgebiete.includes(trimmed)) {
                info.einsatzgebiete.push(trimmed);
            } else if (sLower.match(/(empfehlung|empfiehlt|geeignet für|ideal für|sollte|wird empfohlen|für.*geeignet)/) && 
                      trimmed.length > 20 && !info.empfehlungen.includes(trimmed)) {
                info.empfehlungen.push(trimmed);
            } else if (trimmed.length > 50 && trimmed.length < 400 && !info.kurzbeschreibung) {
                // Erste längere Beschreibung als Kurzbeschreibung (nur wenn keine anderen Kategorien)
                if (!sLower.match(/(vorteil|nachteil|einsatz|empfehlung|preis|kosten|artikelnummer)/)) {
                    info.kurzbeschreibung = trimmed;
                }
            }
        }
        
        // Analysiere Bullet Points
        for (const line of lines) {
            const lineLower = line.toLowerCase();
            
            // Bullet Points erkennen
            if (line.match(/^[-*•]\s+/) || line.match(/^\d+\.\s+/)) {
                const content = line.replace(/^[-*•]\s+/, '').replace(/^\d+\.\s+/, '').trim();
                const contentLower = content.toLowerCase();
                
                // Prüfe ob es zu diesem Produkt gehört
                const mentionsProduct = contentLower.includes(normalizedName) || 
                                      contentLower.includes(normalizedArtNr) ||
                                      productNameParts.some(part => part.length > 4 && contentLower.includes(part));
                const mentionsOther = otherProductNames.some(otherName => 
                    otherName.length > 5 && contentLower.includes(otherName)
                );
                
                if (!mentionsProduct || mentionsOther || content.length < 15) continue;
                
                // Kategorisiere
                if (contentLower.match(/(vorteil|stärke|besser|höher|mehr|überlegen|positiv)/) && 
                    !contentLower.includes('nachteil') && !info.vorteile.includes(content)) {
                    info.vorteile.push(content);
                } else if (contentLower.match(/(nachteil|schwäche|weniger|niedriger|schlechter|negativ)/) && 
                          !info.nachteile.includes(content)) {
                    info.nachteile.push(content);
                } else if (contentLower.match(/(einsatz|anwendung|geeignet|ideal|passend|empfohlen)/) && 
                          !info.einsatzgebiete.includes(content)) {
                    info.einsatzgebiete.push(content);
                } else if (contentLower.match(/(empfehlung|empfiehlt|geeignet für|ideal für)/) && 
                          !info.empfehlungen.includes(content)) {
                    info.empfehlungen.push(content);
                }
            }
        }
    }
    
    // Strategie 2: Suche nach strukturierten Abschnitten (Überschriften, Listen)
    const textLines = responseText.split('\n').map(l => l.trim()).filter(l => l);
    let currentSection = null;
    let inProductSection = false;
    
    for (let i = 0; i < textLines.length; i++) {
        const line = textLines[i];
        const lineLower = line.toLowerCase();
        
        // Erkenne Produkt-Abschnitte
        if (line.match(/^#{1,3}\s+/) || line.match(/^[-*•]\s*[A-ZÄÖÜ]/)) {
            if (lineLower.includes(normalizedName) || 
                lineLower.includes(normalizedArtNr) ||
                productNameParts.some(part => lineLower.includes(part))) {
                inProductSection = true;
            } else if (otherProductNames.some(otherName => lineLower.includes(otherName))) {
                inProductSection = false;
                currentSection = null;
            }
        }
        
        // Erkenne Abschnitte
        if (inProductSection) {
            if (lineLower.match(/(vorteil|stärke|plus|vorzüge|positiv)/)) {
                currentSection = 'vorteile';
            } else if (lineLower.match(/(nachteil|schwäche|minus|negativ|schwächen)/)) {
                currentSection = 'nachteile';
            } else if (lineLower.match(/(einsatz|anwendung|geeignet|ideal|empfohlen|passend)/)) {
                currentSection = 'einsatzgebiete';
            } else if (lineLower.match(/(empfehlung|empfiehlt|geeignet für|ideal für)/)) {
                currentSection = 'empfehlungen';
            }
        }
        
        // Extrahiere Inhalte aus aktueller Sektion
        if (currentSection && inProductSection) {
            if (line.match(/^[-*•]\s+/) || line.match(/^\d+\.\s+/)) {
                const content = line.replace(/^[-*•]\s+/, '').replace(/^\d+\.\s+/, '').trim();
                if (content && content.length > 15 && !info[currentSection].includes(content)) {
                    info[currentSection].push(content);
                }
            } else if (line.length > 30 && !line.match(/^#{1,3}\s+/)) {
                const contentLower = line.toLowerCase();
                if (!contentLower.match(/^(vorteil|nachteil|einsatz|empfehlung)/) && 
                    !info[currentSection].includes(line)) {
                    info[currentSection].push(line);
                }
            }
        }
    }
    
    // Bereinige und begrenze Ergebnisse
    Object.keys(info).forEach(key => {
        if (key === 'kurzbeschreibung') {
            // Kurzbeschreibung: Max 300 Zeichen
            if (info[key] && info[key].length > 300) {
                info[key] = info[key].substring(0, 297) + '...';
            }
        } else {
            // Entferne Duplikate und zu kurze Einträge
            info[key] = [...new Set(info[key])]
                .filter(item => item && item.length > 15)
                .slice(0, 5); // Max 5 pro Kategorie
        }
    });
    
    console.log(`Extrahierte Informationen für ${productName}:`, info);
    
    return info;
}

// Produktvergleich
async function performCompare() {
    const artikelnummernInput = document.getElementById('compare-artikelnummern').value.trim();
    const artikelnummern = artikelnummernInput.split(',').map(a => a.trim()).filter(a => a);
    
    if (artikelnummern.length < 2) {
        alert('Bitte geben Sie mindestens 2 Artikelnummern an (kommagetrennt).');
        return;
    }
    
    const resultsDiv = document.getElementById('compare-results');
    resultsDiv.innerHTML = '<div class="loading"></div> Vergleiche Produkte...';
    
    try {
        const response = await fetch(`${API_BASE}/api/compare`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ artikelnummern: artikelnummern })
        });
        
        const data = await response.json();
        
        if (data.products && data.products.length > 0) {
            // Preise sind bereits im Response enthalten (vom Backend geladen)
            // Falls nicht vorhanden, lade sie als Fallback
            const productsWithPricing = await Promise.all(
                data.products.map(async (product) => {
                    const artikelnummer = product.artikelnummer || product.payload?.artikelnummer;
                    
                    // WICHTIG: Lade Preise IMMER direkt über die API (wie in showProductDetails)
                    // Das Backend lädt die Preise zwar, aber sie kommen nicht korrekt an
                    // Daher laden wir sie hier direkt, genau wie in der Detailansicht
                    let pricingData = null;
                    
                    if (artikelnummer) {
                        try {
                            // Lade Preise direkt über API (wie in showProductDetails)
                            const response = await fetch(`${API_BASE}/api/product/${artikelnummer}/pricing`);
                            const pricingResult = await response.json();
                            if (pricingResult.success) {
                                pricingData = pricingResult.pricing || {};
                                console.log(`✅ Preise geladen für ${artikelnummer}:`, pricingData);
                            } else {
                                console.warn(`⚠️  Preise konnten nicht geladen werden für ${artikelnummer}`);
                            }
                        } catch (error) {
                            console.error(`❌ Fehler beim Laden der Preise für ${artikelnummer}:`, error);
                        }
                    }
                    
                    return { ...product, pricingData: pricingData };
                })
            );
            
            // Extrahiere strukturierte Informationen aus Vergleichstext
            const responseText = data.response || '';
            
            // WARNUNG wenn kein Response-Text vorhanden
            if (!responseText || responseText.length === 0) {
                console.error('❌ KRITISCH: Kein Response-Text vom Backend!');
            }
            
            // Extrahiere strukturierte Vergleichsinformationen
            const structuredComparison = extractStructuredComparison(responseText, productsWithPricing);
            
            console.log('📊 Strukturierter Vergleich:', structuredComparison);
            
            // Sicherstellen dass structuredComparison korrekt ist
            if (!structuredComparison || !structuredComparison.produkt1 || !structuredComparison.produkt2) {
                console.error('❌ FEHLER: structuredComparison ist nicht korrekt!', structuredComparison);
                // Fallback: Leere Struktur erstellen
                const fallbackComparison = {
                    produkt1: { einsatzgebiete: [], kurzbeschreibung: '', empfehlung: '' },
                    produkt2: { einsatzgebiete: [], kurzbeschreibung: '', empfehlung: '' },
                    vergleich: { vergleich_allgemein: [], produkt1_alles: { vorteile: [], nachteile: [], weitere_info: [] }, produkt2_alles: { vorteile: [], nachteile: [], weitere_info: [] } }
                };
                structuredComparison = fallbackComparison;
            }
            
            // Erstelle Vergleichsansicht nebeneinander
            let html = '<div class="compare-products-container">';
            
            productsWithPricing.forEach((product, index) => {
                // Verwende strukturierte Daten für jedes Produkt (mit Fallback)
                const produktData = index === 0 ? (structuredComparison.produkt1 || {}) : (structuredComparison.produkt2 || {});
                const payload = product.payload || {};
                // WICHTIG: Preise wurden direkt über API geladen (wie in showProductDetails)
                // Verwende pricingData, das direkt über die API geladen wurde
                const pricing = product.pricingData || product.pricing || {};
                
                // DEBUG: Logge Preise vor Anzeige
                console.log(`💰 Produkt ${product.artikelnummer} Preise:`, {
                    'product.pricing': product.pricing,
                    'product.pricingData': product.pricingData,
                    'final_pricing': pricing,
                    'verkaufspreis_0_mwst': pricing.verkaufspreis_0_mwst,
                    'verkaufspreis_19_mwst': pricing.verkaufspreis_19_mwst,
                    'pricing_keys': Object.keys(pricing),
                    'pricing_is_empty': Object.keys(pricing).length === 0,
                    'verkaufspreis_19_mwst_exists': pricing.verkaufspreis_19_mwst !== null && pricing.verkaufspreis_19_mwst !== undefined
                });
                
                const extractedInfo = product.extractedInfo || {};
                
                // DEBUG: Logge was in HTML eingefügt wird
                console.log(`\n🎨 HTML-Generierung für ${product.artikelname}:`, {
                    'extractedInfo vorhanden': !!extractedInfo,
                    'vorteile.length': extractedInfo.vorteile?.length || 0,
                    'nachteile.length': extractedInfo.nachteile?.length || 0,
                    'einsatzgebiete.length': extractedInfo.einsatzgebiete?.length || 0,
                    'empfehlungen.length': extractedInfo.empfehlungen?.length || 0,
                    'kurzbeschreibung': extractedInfo.kurzbeschreibung ? 'Ja' : 'Nein',
                    'extractedInfo komplett': extractedInfo
                });
                
                // Extrahiere Leistungsdaten AUS QDRANT (nicht generiert!)
                const produkttyp = (product.produkttyp || '').toLowerCase();
                let leistungsdaten = [];
                
                if (produkttyp === 'batterie' && payload.batterie_spezifikationen) {
                    const s = payload.batterie_spezifikationen;
                    if (s.kapazitaet_kwh) leistungsdaten.push(`Kapazität: ${s.kapazitaet_kwh} kWh`);
                    if (s.kapazitaet_ah) leistungsdaten.push(`Kapazität: ${s.kapazitaet_ah} Ah`);
                    if (s.spannung_v) leistungsdaten.push(`Spannung: ${s.spannung_v} V`);
                    if (s.zelltyp) leistungsdaten.push(`Zelltyp: ${s.zelltyp}`);
                    if (s.max_entladestrom_a) leistungsdaten.push(`Max. Entladestrom: ${s.max_entladestrom_a} A`);
                    if (s.max_ladestrom_a) leistungsdaten.push(`Max. Ladestrom: ${s.max_ladestrom_a} A`);
                    if (s.zykluslebensdauer) {
                        if (typeof s.zykluslebensdauer === 'object') {
                            const entries = Object.entries(s.zykluslebensdauer);
                            if (entries.length > 0) {
                                leistungsdaten.push(`Zyklenlebensdauer: ${entries.map(([k, v]) => `${k} - ${v}`).join(', ')}`);
                            }
                        } else {
                            leistungsdaten.push(`Zyklenlebensdauer: ${s.zykluslebensdauer}`);
                        }
                    }
                    if (s.entladetiefe) leistungsdaten.push(`Entladetiefe: ${s.entladetiefe}%`);
                } else if (produkttyp === 'speichersystem' && payload.speichersystem_spezifikationen) {
                    const s = payload.speichersystem_spezifikationen;
                    if (s.speicherkapazitaet_kwh) leistungsdaten.push(`Speicherkapazität: ${s.speicherkapazitaet_kwh} kWh`);
                    if (s.wechselrichter_leistung_w) leistungsdaten.push(`Wechselrichter: ${s.wechselrichter_leistung_w} W`);
                    if (s.notstrom) leistungsdaten.push(`Notstrom: ${s.notstrom ? 'Ja' : 'Nein'}`);
                    if (s.batterie_spannung_v) leistungsdaten.push(`Batterie-Spannung: ${s.batterie_spannung_v} V`);
                } else if (produkttyp === 'wechselrichter' && payload.wechselrichter_spezifikationen) {
                    const s = payload.wechselrichter_spezifikationen;
                    if (s.nennleistung_w) leistungsdaten.push(`Nennleistung: ${s.nennleistung_w} W`);
                    if (s.max_leistung_w) leistungsdaten.push(`Max. Leistung: ${s.max_leistung_w} W`);
                    if (s.eingangsspannung_v) leistungsdaten.push(`Eingang: ${s.eingangsspannung_v} V`);
                    if (s.ausgangsspannung_v) leistungsdaten.push(`Ausgang: ${s.ausgangsspannung_v} V`);
                    if (s.wirkungsgrad) leistungsdaten.push(`Wirkungsgrad: ${s.wirkungsgrad}%`);
                }
                
                // Formatierung für Preise
                function formatPrice(price) {
                    if (price === null || price === undefined) return 'N/A';
                    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(price);
                }
                
                const productName = product.artikelname || 'Unbekannt';
                
                // DEBUG: Logge Preise vor HTML-Generierung
                console.log(`💶 DEBUG Preise für ${product.artikelnummer} vor HTML:`, {
                    'pricing': pricing,
                    'verkaufspreis_0_mwst': pricing?.verkaufspreis_0_mwst,
                    'verkaufspreis_19_mwst': pricing?.verkaufspreis_19_mwst,
                    'verkaufspreis_19_mwst_check': pricing && pricing.verkaufspreis_19_mwst !== null && pricing.verkaufspreis_19_mwst !== undefined
                });
                
                html += `
                    <div class="compare-product-card">
                        <h3 class="compare-product-name">${productName}</h3>
                        
                        <div class="compare-product-section">
                            <div class="compare-label">Artikelnummer:</div>
                            <div class="compare-value">${product.artikelnummer || 'N/A'}</div>
                        </div>
                        
                        ${(extractedInfo.einsatzgebiete && extractedInfo.einsatzgebiete.length > 0) ? `
                        <div class="compare-product-section">
                            <div class="compare-label" style="color: #202347;">📍 Einsatzgebiete:</div>
                            <div class="compare-value">
                                <ul class="compare-list">
                                    ${extractedInfo.einsatzgebiete.map(e => `<li>${e}</li>`).join('')}
                                </ul>
                            </div>
                        </div>
                        ` : ''}
                        
                        ${leistungsdaten.length > 0 ? `
                        <div class="compare-product-section">
                            <div class="compare-label">Technische Spezifikationen:</div>
                            <div class="compare-value">
                                <ul class="compare-list">
                                    ${leistungsdaten.map(d => `<li>${d}</li>`).join('')}
                                </ul>
                            </div>
                        </div>
                        ` : ''}
                        
                        
                        <div class="compare-product-section">
                            <div class="compare-label">Preis:</div>
                            <div class="compare-value" id="price-${product.artikelnummer}">
                                ${(() => {
                                    // Erstelle Preis-HTML direkt hier
                                    let priceHtml = '';
                                    if (pricing && pricing.verkaufspreis_0_mwst !== null && pricing.verkaufspreis_0_mwst !== undefined) {
                                        priceHtml += `<div><strong>VK 0%:</strong> ${formatPrice(pricing.verkaufspreis_0_mwst)}</div>`;
                                    } else {
                                        priceHtml += '<div><strong>VK 0%:</strong> Nicht verfügbar</div>';
                                    }
                                    if (pricing && pricing.verkaufspreis_19_mwst !== null && pricing.verkaufspreis_19_mwst !== undefined) {
                                        priceHtml += `<div><strong>VK 19%:</strong> ${formatPrice(pricing.verkaufspreis_19_mwst)}</div>`;
                                    } else {
                                        priceHtml += '<div><strong>VK 19%:</strong> Nicht verfügbar</div>';
                                    }
                                    console.log(`🔍 DEBUG Preis-HTML für ${product.artikelnummer}:`, {
                                        'priceHtml': priceHtml,
                                        'pricing': pricing,
                                        'verkaufspreis_19_mwst': pricing?.verkaufspreis_19_mwst
                                    });
                                    return priceHtml;
                                })()}
                            </div>
                        </div>
                        
                        ${(produktData.verwendung || produktData.kompatibilitaet || produktData.eigenschaften || produktData.kurzbeschreibung) ? `
                        <div class="compare-product-section">
                            <div class="compare-label">Kurzbeschreibung:</div>
                            <div class="compare-value" style="line-height: 1.6;">
                                ${produktData.verwendung ? `<div style="margin-bottom: 8px;"><strong style="color: #202347;">Verwendung:</strong> ${produktData.verwendung}</div>` : ''}
                                ${produktData.kompatibilitaet ? `<div style="margin-bottom: 8px;"><strong style="color: #202347;">Kompatibilität:</strong> ${produktData.kompatibilitaet}</div>` : ''}
                                ${produktData.eigenschaften ? `<div style="margin-bottom: 8px;"><strong style="color: #202347;">Spezielle Eigenschaften:</strong> ${produktData.eigenschaften}</div>` : ''}
                                ${(!produktData.verwendung && !produktData.kompatibilitaet && !produktData.eigenschaften && produktData.kurzbeschreibung) ? produktData.kurzbeschreibung : ''}
                            </div>
                        </div>
                        ` : ''}
                        
                        ${produktData.empfehlung ? `
                        <div class="compare-product-section">
                            <div class="compare-label" style="color: #202347;">💡 Empfehlung:</div>
                            <div class="compare-value">
                                ${produktData.empfehlung}
                            </div>
                        </div>
                        ` : ''}
                        
                        ${(product.produkt_url || payload.produkt_url) ? `
                        <div class="compare-product-section">
                            <div class="compare-label">Produktlink:</div>
                            <div class="compare-value">
                                <a href="${product.produkt_url || payload.produkt_url}" target="_blank" class="compare-link">
                                    🔗 Zum Produkt
                                </a>
                            </div>
                        </div>
                        ` : ''}
                        
                        <button class="compare-details-btn" onclick='showProductDetailsFromCompare(${index})'>
                            Details anzeigen
                        </button>
                    </div>
                `;
            });
            
            html += '</div>';
            
            // WICHTIG: Zeige Vergleichsinhalte als separate Karte über die ganze Breite
            // Schema: 1. Vergleich allgemein, 2. Alles zu Produkt 1, 3. Alles zu Produkt 2
            const vergleich = structuredComparison.vergleich;
            const hasVergleichContent = vergleich.vergleich_allgemein.length > 0 || 
                                       vergleich.produkt1_alles.vorteile.length > 0 ||
                                       vergleich.produkt1_alles.nachteile.length > 0 ||
                                       vergleich.produkt1_alles.weitere_info.length > 0 ||
                                       vergleich.produkt2_alles.vorteile.length > 0 ||
                                       vergleich.produkt2_alles.nachteile.length > 0 ||
                                       vergleich.produkt2_alles.weitere_info.length > 0;
            
            if (hasVergleichContent) {
                html += `
                    <div class="compare-text-card" style="margin-top: 24px; padding: 24px; background: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); width: 100%; grid-column: 1 / -1;">
                        <h3 style="margin-top: 0; margin-bottom: 20px; color: #202347; font-size: 1.3em; font-weight: 600;">📊 Produktvergleich</h3>
                        <div class="compare-text-content">
                            ${vergleich.vergleich_allgemein.length > 0 ? `
                                <div style="margin-bottom: 28px;">
                                    <h3 class="compare-heading">Vergleich Allgemein:</h3>
                                    <ul>
                                        ${vergleich.vergleich_allgemein.map(v => `<li>${v}</li>`).join('')}
                                    </ul>
                                </div>
                            ` : ''}
                            
                            ${vergleich.technische_unterschiede.length > 0 ? `
                                <div style="margin-bottom: 28px;">
                                    <h3 class="compare-heading">Technische Unterschiede</h3>
                                    <ul>
                                        ${vergleich.technische_unterschiede.map(v => `<li>${v}</li>`).join('')}
                                    </ul>
                                </div>
                            ` : ''}
                            
                            ${vergleich.preis_leistung.length > 0 ? `
                                <div style="margin-bottom: 28px;">
                                    <h3 class="compare-heading">Preis-Leistungs-Verhältnis</h3>
                                    <ul>
                                        ${vergleich.preis_leistung.map(v => `<li>${v}</li>`).join('')}
                                    </ul>
                                </div>
                            ` : ''}
                            
                            ${vergleich.wann_besser.length > 0 ? `
                                <div style="margin-bottom: 28px;">
                                    <h3 class="compare-heading">Wann welches Produkt besser ist</h3>
                                    <ul>
                                        ${vergleich.wann_besser.map(v => `<li>${v}</li>`).join('')}
                                    </ul>
                                </div>
                            ` : ''}
                            
                            <div style="margin-bottom: 32px;">
                                <h2 class="compare-heading">PRODUKT 1: ${productsWithPricing[0].artikelname}</h2>
                                ${vergleich.produkt1_alles.vorteile.length > 0 ? `
                                    <div style="margin-bottom: 20px;">
                                        <h3 class="compare-heading" style="color: #059669;">Vorteile:</h3>
                                        <ul style="color: #059669;">
                                            ${vergleich.produkt1_alles.vorteile.map(v => `<li>${v}</li>`).join('')}
                                        </ul>
                                    </div>
                                ` : ''}
                                ${vergleich.produkt1_alles.nachteile.length > 0 ? `
                                    <div style="margin-bottom: 20px;">
                                        <h3 class="compare-heading" style="color: #dc2626;">Nachteile:</h3>
                                        <ul style="color: #dc2626;">
                                            ${vergleich.produkt1_alles.nachteile.map(n => `<li>${n}</li>`).join('')}
                                        </ul>
                                    </div>
                                ` : ''}
                                ${vergleich.produkt1_alles.weitere_info.length > 0 ? `
                                    <div style="margin-top: 20px;">
                                        <h3 class="compare-heading">Weitere wichtige Informationen</h3>
                                        <ul>
                                            ${vergleich.produkt1_alles.weitere_info.map(info => `<li>${info}</li>`).join('')}
                                        </ul>
                                    </div>
                                ` : ''}
                            </div>
                            
                            <div style="margin-bottom: 24px;">
                                <h2 class="compare-heading">PRODUKT 2: ${productsWithPricing[1].artikelname}</h2>
                                ${vergleich.produkt2_alles.vorteile.length > 0 ? `
                                    <div style="margin-bottom: 20px;">
                                        <h3 class="compare-heading" style="color: #059669;">Vorteile:</h3>
                                        <ul style="color: #059669;">
                                            ${vergleich.produkt2_alles.vorteile.map(v => `<li>${v}</li>`).join('')}
                                        </ul>
                                    </div>
                                ` : ''}
                                ${vergleich.produkt2_alles.nachteile.length > 0 ? `
                                    <div style="margin-bottom: 20px;">
                                        <h3 class="compare-heading" style="color: #dc2626;">Nachteile:</h3>
                                        <ul style="color: #dc2626;">
                                            ${vergleich.produkt2_alles.nachteile.map(n => `<li>${n}</li>`).join('')}
                                        </ul>
                                    </div>
                                ` : ''}
                                ${vergleich.produkt2_alles.weitere_info.length > 0 ? `
                                    <div style="margin-top: 20px;">
                                        <h3 class="compare-heading">Weitere wichtige Informationen</h3>
                                        <ul>
                                            ${vergleich.produkt2_alles.weitere_info.map(info => `<li>${info}</li>`).join('')}
                                        </ul>
                                    </div>
                                ` : ''}
                            </div>
                        </div>
                    </div>
                `;
            } else if (responseText && responseText.length > 50) {
                // Fallback: Zeige vollständigen Text wenn Strukturierung fehlschlägt
                html += `
                    <div class="compare-text-card" style="margin-top: 24px; padding: 20px; background: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); width: 100%; grid-column: 1 / -1;">
                        <h3 style="margin-top: 0; margin-bottom: 16px; color: #202347; font-size: 1.2em;">📊 Produktvergleich</h3>
                        <div class="compare-text-content" style="line-height: 1.6; color: #333;">
                            ${markdownToHTML(responseText)}
                        </div>
                    </div>
                `;
            } else {
                // Warnung wenn kein Text generiert wurde
                html += `
                    <div class="compare-text-card" style="margin-top: 24px; padding: 20px; background: #fff3cd; border-radius: 8px; border: 1px solid #ffc107; width: 100%; grid-column: 1 / -1;">
                        <h3 style="margin-top: 0; margin-bottom: 8px; color: #856404;">⚠️ Vergleichstext konnte nicht generiert werden</h3>
                        <p style="margin: 0; color: #856404;">Das System konnte keinen Vergleichstext generieren. Bitte versuchen Sie es erneut oder kontaktieren Sie den Support.</p>
                    </div>
                `;
            }
            
            // Speichere Produkte für späteren Zugriff
            window.compareResults = productsWithPricing;
        
            // DEBUG: Logge HTML vor Einfügen
            console.log('🔍 DEBUG: HTML vor innerHTML:', {
                'html_length': html.length,
                'html_contains_price': html.includes('VK 19%'),
                'html_contains_125': html.includes('125'),
                'html_contains_152': html.includes('152'),
                'html_substring_price': html.substring(html.indexOf('Preis:'), html.indexOf('Preis:') + 500)
            });
        
        resultsDiv.innerHTML = html;
        
            // DEBUG: Prüfe ob Preise im DOM sind
            setTimeout(() => {
                const priceElements = document.querySelectorAll('.compare-value');
                console.log('🔍 DEBUG: Preis-Elemente im DOM:', {
                    'anzahl_price_elements': priceElements.length,
                    'price_elements': Array.from(priceElements).map(el => ({
                        'text': el.textContent.substring(0, 100),
                        'innerHTML': el.innerHTML.substring(0, 200)
                    }))
                });
            }, 100);
        } else {
            resultsDiv.innerHTML = '<p>Keine Produkte zum Vergleichen gefunden.</p>';
        }
    } catch (error) {
        resultsDiv.innerHTML = `<p>Fehler: ${error.message}</p>`;
    }
}

// Speicher-Empfehlung
async function getStorageRecommendation() {
    const pvLeistung = parseFloat(document.getElementById('pv-leistung').value);
    const stromverbrauch = document.getElementById('stromverbrauch').value ? 
        parseFloat(document.getElementById('stromverbrauch').value) : null;
    const autarkie = document.getElementById('autarkie').value ? 
        parseFloat(document.getElementById('autarkie').value) : null;
    
    if (!pvLeistung || pvLeistung <= 0) {
        alert('Bitte geben Sie eine gültige PV-Leistung an.');
        return;
    }
    
    const resultsDiv = document.getElementById('storage-results');
    resultsDiv.innerHTML = '<div class="loading"></div> Berechne Empfehlung...';
    
    try {
        const response = await fetch(`${API_BASE}/api/storage-recommendation`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                pv_leistung_kwp: pvLeistung,
                stromverbrauch_kwh: stromverbrauch,
                autarkie_wunsch: autarkie
            })
        });
        
        const data = await response.json();
        
        let html = `<div class="message assistant"><div class="message-bubble">${data.response.replace(/\n/g, '<br>')}</div></div>`;
        
        if (data.recommendations && data.recommendations.length > 0) {
            html += '<h3>Empfehlungen:</h3><ul>';
            data.recommendations.forEach(rec => {
                html += `<li>${rec}</li>`;
            });
            html += '</ul>';
        }
        
        if (data.products && data.products.length > 0) {
            html += '<h3>Passende Speichersysteme:</h3>';
            data.products.forEach((product, index) => {
                html += `
                    <div class="product-result" onclick='showProductDetailsFromStorage(${index})'>
                        <h3>${product.artikelname || 'Unbekannt'}</h3>
                        <div class="details">
                            <strong>Artikelnummer:</strong> ${product.artikelnummer || 'N/A'}<br>
                            <strong>Typ:</strong> ${product.produkttyp || 'N/A'} | 
                            <strong>Hersteller:</strong> ${product.hersteller || 'N/A'}<br>
                            <strong>Relevanz:</strong> ${(product.score * 100).toFixed(1)}%
                        </div>
                    </div>
                `;
            });
            
            // Speichere Produkte für späteren Zugriff
            window.storageResults = data.products;
        }
        
        resultsDiv.innerHTML = html;
    } catch (error) {
        resultsDiv.innerHTML = `<p>Fehler: ${error.message}</p>`;
    }
}

// Hilfsfunktionen für Produktdetails
function showProductDetailsFromSearch(index) {
    if (window.searchResults && window.searchResults[index]) {
        showProductDetails(window.searchResults[index]);
    }
}

function showProductDetailsFromCompare(index) {
    if (window.compareResults && window.compareResults[index]) {
        showProductDetails(window.compareResults[index]);
    }
}

function showProductDetailsFromStorage(index) {
    if (window.storageResults && window.storageResults[index]) {
        showProductDetails(window.storageResults[index]);
    }
}

// ============================================================================
// PROMPT-EDITOR FUNKTIONEN
// ============================================================================

// Globale Variable für Prompts-Daten
let promptsData = null;

// Zeigt den Prompt-Editor Modal
function showPromptEditor() {
    document.getElementById('prompt-editor-modal').classList.remove('hidden');
    loadPrompts();
}

// Lädt alle Prompts vom Backend
async function loadPrompts() {
    const container = document.getElementById('prompt-categories');
    container.innerHTML = '<div class="loading-prompts"><div class="loading"></div><span>Lade Prompts...</span></div>';
    
    try {
        const response = await fetch(`${API_BASE}/api/prompts`);
        const result = await response.json();
        
        if (result.success && result.data) {
            promptsData = result.data;
            renderPromptCategories(result.data.categories);
        } else {
            container.innerHTML = '<p style="color: #dc2626;">Fehler beim Laden der Prompts.</p>';
        }
    } catch (error) {
        console.error('Fehler beim Laden der Prompts:', error);
        container.innerHTML = `<p style="color: #dc2626;">Fehler: ${error.message}</p>`;
    }
}

// Rendert alle Prompt-Kategorien
function renderPromptCategories(categories) {
    const container = document.getElementById('prompt-categories');
    
    // Sortiere nach order
    const sortedCategories = [...categories].sort((a, b) => (a.order || 0) - (b.order || 0));
    
    let html = '';
    
    for (const category of sortedCategories) {
        const promptCount = category.prompts ? category.prompts.length : 0;
        
        html += `
            <div class="prompt-category" id="category-${category.id}">
                <div class="prompt-category-header" onclick="toggleCategory('${category.id}')">
                    <div class="prompt-category-title">
                        <h3>${category.name}</h3>
                        <span class="prompt-category-count">${promptCount} Prompts</span>
                    </div>
                    <span class="prompt-category-toggle">▼</span>
                </div>
                <p class="prompt-category-description" style="padding: 0 20px 12px 20px; margin: 0;">${category.description || ''}</p>
                <div class="prompt-category-content">
                    ${renderPromptItems(category.prompts || [])}
                </div>
            </div>
        `;
    }
    
    container.innerHTML = html;
}

// Rendert einzelne Prompt-Items einer Kategorie
function renderPromptItems(prompts) {
    let html = '';
    
    for (const prompt of prompts) {
        const isEditable = prompt.editable !== false;
        const isKeywordList = Array.isArray(prompt.content);
        
        html += `
            <div class="prompt-item" id="prompt-${prompt.id}">
                <div class="prompt-item-header">
                    <div class="prompt-item-title">
                        <h4>${prompt.name}</h4>
                        ${prompt.model && prompt.model !== '-' ? 
                            `<span class="prompt-model-badge">${prompt.model}</span>` : 
                            `<span class="prompt-model-badge no-model">System</span>`
                        }
                        ${!isEditable ? '<span class="prompt-readonly-badge">🔒 Nur Ansicht</span>' : ''}
                    </div>
                </div>
                
                <p class="prompt-item-description">${prompt.description || ''}</p>
                
                ${prompt.function ? `
                    <div class="prompt-function-info">
                        <span>📍 Funktion:</span>
                        <code>${prompt.function}</code>
                    </div>
                ` : ''}
                
                <div class="prompt-content-wrapper">
                    ${isKeywordList ? 
                        renderKeywordList(prompt.content) : 
                        renderPromptTextarea(prompt.id, prompt.content, isEditable)
                    }
                </div>
                
                ${isEditable && !isKeywordList ? `
                    <div class="prompt-item-actions">
                        <button class="prompt-save-btn" id="save-btn-${prompt.id}" onclick="savePrompt('${prompt.id}')">
                            💾 Speichern
                        </button>
                    </div>
                ` : ''}
            </div>
        `;
    }
    
    return html;
}

// Rendert ein Textarea für bearbeitbare Prompts
function renderPromptTextarea(promptId, content, isEditable) {
    return `
        <textarea 
            class="prompt-textarea ${!isEditable ? 'readonly' : ''}"
            id="textarea-${promptId}"
            ${!isEditable ? 'disabled' : ''}
            oninput="markPromptAsModified('${promptId}')"
        >${escapeHtml(content || '')}</textarea>
    `;
}

// Rendert eine Keyword-Liste (nicht bearbeitbar)
function renderKeywordList(keywords) {
    if (!Array.isArray(keywords)) return '';
    
    const tags = keywords.map(kw => `<span class="keyword-tag">${escapeHtml(kw)}</span>`).join('');
    return `<div class="prompt-keywords-list">${tags}</div>`;
}

// Hilfsfunktion zum Escapen von HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Klappt eine Kategorie auf/zu
function toggleCategory(categoryId) {
    const category = document.getElementById(`category-${categoryId}`);
    if (category) {
        category.classList.toggle('expanded');
    }
}

// Markiert einen Prompt als modifiziert
function markPromptAsModified(promptId) {
    const saveBtn = document.getElementById(`save-btn-${promptId}`);
    if (saveBtn) {
        saveBtn.classList.remove('saved');
        saveBtn.innerHTML = '💾 Speichern';
    }
}

// Speichert einen einzelnen Prompt
async function savePrompt(promptId) {
    const textarea = document.getElementById(`textarea-${promptId}`);
    const saveBtn = document.getElementById(`save-btn-${promptId}`);
    
    if (!textarea || !saveBtn) return;
    
    const newContent = textarea.value;
    
    // UI-Feedback: Speichern läuft
    saveBtn.classList.add('saving');
    saveBtn.disabled = true;
    saveBtn.innerHTML = '⏳ Speichere...';
    
    try {
        const response = await fetch(`${API_BASE}/api/prompts/${promptId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                prompt_id: promptId,
                content: newContent
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            // Erfolg
            saveBtn.classList.remove('saving');
            saveBtn.classList.add('saved');
            saveBtn.innerHTML = '✅ Gespeichert';
            saveBtn.disabled = false;
            
            showSaveStatus('success', `Prompt "${promptId}" erfolgreich gespeichert!`);
            
            // Nach 2 Sekunden zurücksetzen
            setTimeout(() => {
                saveBtn.classList.remove('saved');
                saveBtn.innerHTML = '💾 Speichern';
            }, 2000);
        } else {
            throw new Error(result.detail || 'Unbekannter Fehler');
        }
    } catch (error) {
        console.error('Fehler beim Speichern:', error);
        
        saveBtn.classList.remove('saving');
        saveBtn.disabled = false;
        saveBtn.innerHTML = '💾 Speichern';
        
        showSaveStatus('error', `Fehler: ${error.message}`);
    }
}

// Lädt Prompts neu
async function reloadPrompts() {
    showSaveStatus('info', 'Lade Prompts neu...');
    
    try {
        const response = await fetch(`${API_BASE}/api/prompts/reload`, {
            method: 'POST'
        });
        
        const result = await response.json();
        
        if (result.success) {
            await loadPrompts();
            showSaveStatus('success', 'Prompts erfolgreich neu geladen!');
        } else {
            throw new Error(result.detail || 'Unbekannter Fehler');
        }
    } catch (error) {
        console.error('Fehler beim Neuladen:', error);
        showSaveStatus('error', `Fehler: ${error.message}`);
    }
}

// Zeigt eine Status-Nachricht an
function showSaveStatus(type, message) {
    const status = document.getElementById('prompt-save-status');
    if (!status) return;
    
    status.className = `prompt-save-status ${type}`;
    status.textContent = message;
    status.classList.remove('hidden');
    
    // Nach 3 Sekunden ausblenden
    setTimeout(() => {
        status.classList.add('hidden');
    }, 3000);
}

// ============================================================================
// INITIALISIERUNG
// ============================================================================

// Initialisierung
document.addEventListener('DOMContentLoaded', async () => {
    // Lade Willkommensnachricht vom Backend (falls verfügbar)
    try {
        const response = await fetch(`${API_BASE}/api/prompts/welcome_message`);
        const result = await response.json();
        
        if (result.success && result.prompt && result.prompt.content) {
            addMessage('assistant', result.prompt.content);
        } else {
            // Fallback
            addMessage('assistant', 'Hallo! Ich bin Ihr Produktberater für Solar- und Batterietechnik. Wie kann ich Ihnen helfen?');
        }
    } catch (error) {
        // Fallback bei Fehler
        addMessage('assistant', 'Hallo! Ich bin Ihr Produktberater für Solar- und Batterietechnik. Wie kann ich Ihnen helfen?');
    }
});

