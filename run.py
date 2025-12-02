#!/usr/bin/env python3
"""
Starter-Script für den Produkt-Chatbot
"""
import uvicorn
from config import config as chatbot_config
HOST = chatbot_config.HOST
PORT = chatbot_config.PORT

if __name__ == "__main__":
    print(f"""
    ╔══════════════════════════════════════════════════════════╗
    ║         Produkt-Chatbot - Husatech                      ║
    ║                                                          ║
    ║  Server startet auf: http://{HOST}:{PORT}              ║
    ║                                                          ║
    ║  Öffne den Browser und navigiere zu:                    ║
    ║  http://127.0.0.1:{PORT}                                ║
    ╚══════════════════════════════════════════════════════════╝
    """)
    
    uvicorn.run(
        "backend.api:app",
        host=HOST,
        port=PORT,
        reload=True,
        log_level="info"
    )

