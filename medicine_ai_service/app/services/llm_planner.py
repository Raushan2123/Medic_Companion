# import re
# import uuid
# from typing import Any, Dict, List

# from app.core.llm_config import OLLAMA_MODEL_PLAN
# from app.services.ollama_client import ollama_chat_json

# PLAN_SCHEMA = {
#     "type": "object",
#     "properties": {
#         "needs_info": {"type": "boolean"},
#         "questions": {"type": "array", "items": {"type": "string"}},
#         "schedule": {
#             "type": "array",
#             "items": {
#                 "type": "object",
#                 "properties": {
#                     "med_name": {"type": "string"},
#                     "time_local": {"type": "string", "description": "HH:MM 24-hour"},
#                     "bucket": {"type": "string", "enum": ["MORNING", "AFTERNOON", "NIGHT"]},
#                     "notes": {"type": "string"},
#                 },
#                 "required": ["med_name", "time_local", "bucket"],
#             },
#         },
#         "precautions": {"type": "array", "items": {"type": "string"}},
#         "why": {"type": "array", "items": {"type": "string"}},
#         "actions": {
#             "type": "array",
#             "items": {
#                 "type": "object",
#                 "properties": {
#                     "type": {"type": "string", "enum": ["CREATE_REMINDERS", "SET_ESCALATION_RULE", "CREATE_CALENDAR_EVENT"]},
#                     "needs_approval": {"type": "boolean"},
#                     "payload": {"type": "object"},
#                 },
#                 "required": ["type", "needs_approval", "payload"],
#             },
#         },
#     },
#     "required": ["needs_info", "questions", "schedule", "precautions", "why", "actions"],
# }

# SYSTEM = (
#     "You are a medication adherence planner.\n"
#     "Safety rules:\n"
#     "- Do NOT diagnose or prescribe.\n"
#     "- Do NOT claim drug interactions.\n"
#     "- Only convert user-provided meds into a simple reminder schedule.\n"
#     "- If any med has frequency UNKNOWN/PRN or missing info, set needs_info=true and ask short questions.\n"
#     "- Keep schedule simple (morning/afternoon/night). Max 8 reminders/day.\n"
#     "- Output ONLY valid JSON matching the schema.\n"
# )

# _TIME_RE = re.compile(r"^\d{2}:\d{2}$")

# def _dose_id() -> str:
#     return "dose_" + uuid.uuid4().hex[:10]

# def _valid_time(hhmm: str) -> bool:
#     if not _TIME_RE.match(hhmm):
#         return False
#     hh, mm = hhmm.split(":")
#     h = int(hh); m = int(mm)
#     return 0 <= h <= 23 and 0 <= m <= 59

# def llm_build_plan(meds: List[Dict[str, Any]], input_text: str, timezone: str) -> Dict[str, Any]:
#     user = {
#         "timezone": timezone,
#         "user_goal": input_text,
#         "meds": meds,
#         "defaults": {
#             "miss_threshold": 2,
#             "simple_times": {"MORNING": "09:00", "AFTERNOON": "14:00", "NIGHT": "20:00"}
#         }
#     }

#     out = ollama_chat_json(
#         model=OLLAMA_MODEL_PLAN,
#         system=SYSTEM,
#         user=f"PLAN_INPUT:\n{user}",
#         schema=PLAN_SCHEMA,
#     )

#     # Validate & normalize output
#     schedule_out = []
#     for s in (out.get("schedule") or []):
#         t = str(s.get("time_local", "")).strip()
#         b = str(s.get("bucket", "")).strip()
#         mn = str(s.get("med_name", "")).strip()
#         if not mn or b not in ["MORNING", "AFTERNOON", "NIGHT"] or not _valid_time(t):
#             continue
#         schedule_out.append({
#             "dose_id": _dose_id(),
#             "med_name": mn,
#             "time_local": t,
#             "bucket": b,
#             "notes": str(s.get("notes", "") or "").strip(),
#         })

#     out["schedule"] = schedule_out

#     # If schedule empty and meds exist, force needs_info (safer)
#     if meds and len(schedule_out) == 0:
#         out["needs_info"] = True
#         qs = out.get("questions") or []
#         qs.append("I couldn't create reminder times. Confirm frequency (OD/BID/TID) for each medicine.")
#         out["questions"] = list(dict.fromkeys(qs))

#     return out