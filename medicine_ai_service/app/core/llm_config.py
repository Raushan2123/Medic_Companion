import os

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434/api")
OLLAMA_MODEL_EXTRACT = os.getenv("OLLAMA_MODEL_EXTRACT", "llama3.2")
OLLAMA_MODEL_PLAN = os.getenv("OLLAMA_MODEL_PLAN", "llama3.2")

OLLAMA_TEMPERATURE = float(os.getenv("OLLAMA_TEMPERATURE", "0.2"))
OLLAMA_TIMEOUT_S = int(os.getenv("OLLAMA_TIMEOUT_S", "90"))  # ✅ add this

USE_LLM_EXTRACTION = os.getenv("USE_LLM_EXTRACTION", "true").lower() == "true"
USE_LLM_PLANNING = os.getenv("USE_LLM_PLANNING", "true").lower() == "true"