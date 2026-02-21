# app/services/llm/planner.py
from typing import Any, Dict, List

# from app.core.llm_config import OLLAMA_MODEL_PLAN
from app.core.llm_config import HF_MODEL_PLAN
from app.services.hf_client import hf_chat_json
# from app.services.ollama_client import ollama_chat_json
# from app.services.hf_client import hf_chat_json
from app.services.llm.schemas import PLAN_SCHEMA
from app.services.llm.prompts import PLAN_SYSTEM_PROMPT
from app.services.llm.sanitize import sanitize_plan_output

def llm_build_plan(meds, input_text, timezone):
    user_payload = {
        "timezone": timezone,
        "user_goal": input_text,
        "meds": meds,
        "rules": "Return schedule entries only for medicines in input meds list."
    }
    raw = hf_chat_json(
        model=HF_MODEL_PLAN,
        system=PLAN_SYSTEM_PROMPT,
        user=f"PLAN_INPUT:\n{user_payload}",
        schema=PLAN_SCHEMA,
    )
    return sanitize_plan_output(raw, meds)
