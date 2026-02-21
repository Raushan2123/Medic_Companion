# from typing import Any, Dict, List

# from app.core.llm_config import OLLAMA_MODEL_EXTRACT
# from app.services.ollama_client import ollama_chat_json

# MEDS_SCHEMA = {
#     "type": "object",
#     "properties": {
#         "meds": {
#             "type": "array",
#             "items": {
#                 "type": "object",
#                 "properties": {
#                     "name": {"type": "string"},
#                     "strength": {"type": "string"},
#                     "frequency": {"type": "string", "description": "OD/BID/TID/QID/WEEKLY/PRN/UNKNOWN"},
#                     "with_food": {"type": "boolean"},
#                     "instructions": {"type": "string"},
#                 },
#                 "required": ["name", "frequency"],
#             },
#         }
#     },
#     "required": ["meds"],
# }

# SYSTEM = (
#     "You extract medication details from OCR text.\n"
#     "Hard rules:\n"
#     "- Use ONLY what is explicitly present.\n"
#     "- Do NOT invent medicine names.\n"
#     "- If frequency is missing, set frequency='UNKNOWN'.\n"
#     "- Output ONLY valid JSON matching the schema.\n"
# )

# def llm_extract_meds(ocr_text: str) -> List[Dict[str, Any]]:
#     user = f"OCR_TEXT:\n{ocr_text}\n\nReturn meds."
#     out = ollama_chat_json(
#         model=OLLAMA_MODEL_EXTRACT,
#         system=SYSTEM,
#         user=user,
#         schema=MEDS_SCHEMA,
#     )
#     meds = out.get("meds", []) or []
#     cleaned: List[Dict[str, Any]] = []
#     for m in meds:
#         name = (m.get("name") or "").strip()
#         if not name:
#             continue
#         freq = (m.get("frequency") or "UNKNOWN").upper().strip() or "UNKNOWN"
#         cleaned.append({
#             "name": name,
#             "strength": (m.get("strength") or "").strip(),
#             "frequency": freq,
#             "with_food": bool(m.get("with_food", False)),
#             "instructions": (m.get("instructions") or "").strip(),
#         })
#     return cleaned