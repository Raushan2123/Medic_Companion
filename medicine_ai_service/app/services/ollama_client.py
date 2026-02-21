import json
from typing import Any, Dict, Optional

import requests

from app.core.llm_config import (
    OLLAMA_BASE_URL,
    OLLAMA_TEMPERATURE,
    OLLAMA_TIMEOUT_S,
)

class OllamaError(RuntimeError):
    pass

def _safe_json_parse(text: str) -> Dict[str, Any]:
    """Parse JSON even if model returns extra text."""
    text = (text or "").strip()
    try:
        return json.loads(text)
    except Exception:
        pass

    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(text[start : end + 1])
        except Exception:
            pass

    raise OllamaError(f"Invalid JSON from LLM: {text[:200]}...")

def ollama_chat_json(
    model: str,
    system: str,
    user: str,
    schema: Optional[Dict[str, Any]] = None,
    temperature: Optional[float] = None,
    timeout_s: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Calls Ollama /api/chat and returns JSON from assistant message content.
    We enforce JSON output with `format` when possible.
    """
    url = f"{OLLAMA_BASE_URL}/chat"
    payload: Dict[str, Any] = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "stream": False,
        "options": {"temperature": temperature if temperature is not None else OLLAMA_TEMPERATURE},
    }
    # If schema is provided, ask Ollama for structured JSON output
    if schema is not None:
        payload["format"] = schema  # many models support JSON schema here

    r = requests.post(url, json=payload, timeout=timeout_s or OLLAMA_TIMEOUT_S)
    if r.status_code >= 400:
        raise OllamaError(f"Ollama {r.status_code}: {r.text}")

    data = r.json()
    content = (data.get("message") or {}).get("content", "")
    return _safe_json_parse(content)