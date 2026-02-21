# app/db/db_config.py

import sqlite3
from pathlib import Path


# Base project directory (medicine_ai_service/)
BASE_DIR = Path(__file__).resolve().parents[2]

# Database directory (medicine_ai_service/app/db/)
DB_DIR = BASE_DIR / "app" / "db"
DB_DIR.mkdir(parents=True, exist_ok=True)

# Database file path
DB_PATH = DB_DIR / "checkpoints.db"


def get_sqlite_connection() -> sqlite3.Connection:
    """
    Create and configure SQLite connection with recommended PRAGMA settings.
    """
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)

    # Performance & concurrency settings
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    conn.execute("PRAGMA busy_timeout=5000;")

    return conn