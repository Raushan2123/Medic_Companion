from pathlib import Path
from dotenv import load_dotenv

def load_env() -> None:
    root = Path(__file__).resolve().parents[2]  # medicine_ai_service/
    env_path = root / "config.env"              # ✅ changed
    load_dotenv(dotenv_path=env_path, override=False)