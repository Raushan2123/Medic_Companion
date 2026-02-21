# app/services/llm/extraction.py
from typing import Any, Dict, List

# from app.core.llm_config import OLLAMA_MODEL_EXTRACT
from app.core.llm_config import HF_MODEL_EXTRACT
from app.services.hf_client import hf_chat_json
# from app.services.ollama_client import ollama_chat_json
# from app.services.hf_client import hf_chat_json
from app.services.llm.extraction_schema import MEDS_SCHEMA
from app.services.llm.extraction_prompt import EXTRACT_SYSTEM_PROMPT
from app.services.llm.extraction_sanitize import sanitize_extracted_meds

def llm_extract_meds(text: str) -> List[Dict[str, Any]]:
    user = f"TEXT:\n{text}\n\nExtract meds from the text."
    raw = hf_chat_json(
        model=HF_MODEL_EXTRACT,
        system=EXTRACT_SYSTEM_PROMPT,
        user=user,
        schema=MEDS_SCHEMA,
    )
    return sanitize_extracted_meds(raw)
