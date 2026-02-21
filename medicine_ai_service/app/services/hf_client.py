# import json
# from typing import Any, Dict, Optional

# import requests

# from app.core.llm_config import (
#     HF_API_KEY,
#     LLM_TEMPERATURE,
#     LLM_TIMEOUT_S,
# )

# HF_API_BASE = "https://api-inference.huggingface.co/models"


# class HFError(RuntimeError):
#     pass


# def _safe_json_parse(text: str) -> Dict[str, Any]:
#     """Parse JSON even if model returns extra text."""
#     text = (text or "").strip()

#     # Try direct parse
#     try:
#         return json.loads(text)
#     except Exception:
#         pass

#     # Extract first JSON object block
#     start = text.find("{")
#     end = text.rfind("}")
#     if start != -1 and end != -1 and end > start:
#         try:
#             return json.loads(text[start : end + 1])
#         except Exception:
#             pass

#     raise HFError(f"Invalid JSON from LLM: {text[:300]}...")


# def hf_chat_json(
#     model: str,
#     system: str,
#     user: str,
#     schema: Optional[Dict[str, Any]] = None,
#     temperature: Optional[float] = None,
#     timeout_s: Optional[int] = None,
# ) -> Dict[str, Any]:
#     """
#     Calls HuggingFace Inference API and returns JSON parsed output.
#     We simulate structured JSON enforcement via prompt instructions.
#     """

#     if not HF_API_KEY:
#         raise HFError("HF_API_KEY is not set.")

#     url = f"{HF_API_BASE}/{model}"

#     headers = {
#         "Authorization": f"Bearer {HF_API_KEY}",
#         "Content-Type": "application/json",
#     }

#     # Construct structured prompt (similar to Ollama schema enforcement)
#     prompt = f"{system}\n\nUser:\n{user}\n"

#     if schema is not None:
#         prompt += (
#             "\nReturn ONLY valid JSON matching this schema:\n"
#             f"{json.dumps(schema, indent=2)}\n"
#             "Do not include explanations. Do not include markdown."
#         )

#     payload: Dict[str, Any] = {
#         "inputs": prompt,
#         "parameters": {
#             "temperature": temperature if temperature is not None else LLM_TEMPERATURE,
#             "max_new_tokens": 1024,
#             "return_full_text": False,
#         },
#     }

#     response = requests.post(
#         url,
#         headers=headers,
#         json=payload,
#         timeout=timeout_s or LLM_TIMEOUT_S,
#     )

#     if response.status_code == 503:
#         raise HFError("Model is loading (503). Try again shortly.")

#     if response.status_code >= 400:
#         raise HFError(f"HF {response.status_code}: {response.text}")

#     data = response.json()

#     # HF returns list of generated sequences
#     if not isinstance(data, list) or not data:
#         raise HFError(f"Unexpected HF response: {data}")

#     generated_text = data[0].get("generated_text", "")

#     return _safe_json_parse(generated_text)

import json
import os
from typing import Any, Dict, Optional

from huggingface_hub import InferenceClient

from app.core.llm_config import (
    HF_TEMPERATURE,
    HF_MAX_TOKENS,
    HF_TIMEOUT_S,
)

class HFLLMError(RuntimeError):
    pass

def _safe_json_parse(text: str) -> Dict[str, Any]:
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
    raise HFLLMError(f"Model did not return valid JSON. Got: {text[:200]}...")

def hf_chat_json(
    *,
    model: str,
    system: str,
    user: str,
    schema: Optional[Dict[str, Any]] = None,
    temperature: Optional[float] = None,
    max_tokens: Optional[int] = None,
    timeout_s: Optional[int] = None,
) -> Dict[str, Any]:
    # ✅ read token at runtime (prevents stale cached value)
    token = os.getenv("HF_TOKEN", "").strip()
    if not token:
        raise HFLLMError("HF_TOKEN is missing. Set it in config.env and restart.")

    # ✅ READ PROVIDER AT RUNTIME (prevents stale cached value)
    provider = os.getenv("HF_PROVIDER", "auto").strip() or "auto"

    client = InferenceClient(
        provider=provider,
        api_key=token,
        timeout=float(timeout_s or HF_TIMEOUT_S),
    )

    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]

    # ✅ correct response_format for HF Inference Providers / Together
    response_format = None
    if schema:
        response_format = {
            "type": "json_schema",
            "json_schema": {
                "name": "MedPlan",     # any string
                "schema": schema,      # your JSON schema dict
                "strict": True,
            },
        }
    else:
        # optional: force valid JSON object when you don't have a schema
        response_format = {"type": "json_object"}

    out = client.chat_completion(
        model=model,
        messages=messages,
        temperature=temperature if temperature is not None else HF_TEMPERATURE,
        max_tokens=max_tokens if max_tokens is not None else HF_MAX_TOKENS,
        response_format=response_format,
    )

    content = out.choices[0].message.content or ""
    return _safe_json_parse(content)