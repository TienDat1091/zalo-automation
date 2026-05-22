# config.py - Easy Zalo Configuration
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BASE_DIR)  # Zalo_Automation/

# Shared database paths (same as web app)
DATA_DIR = os.path.join(PROJECT_ROOT, 'docs', 'data')
TRIGGERS_DB = os.path.join(DATA_DIR, 'triggers.db')
MESSAGES_DB = os.path.join(DATA_DIR, 'messages.db')

# Node.js web server (existing)
WEB_SERVER_HOST = 'localhost'
WEB_SERVER_PORT = 3000
WEB_SERVER_URL = f'http://{WEB_SERVER_HOST}:{WEB_SERVER_PORT}'
WEB_SERVER_WS = f'ws://{WEB_SERVER_HOST}:{WEB_SERVER_PORT}'

# Python Flask server
FLASK_HOST = '127.0.0.1'
FLASK_PORT = 5000
FLASK_DEBUG = False

# App info
APP_NAME = 'Easy Zalo'
APP_VERSION = '1.0.0'
