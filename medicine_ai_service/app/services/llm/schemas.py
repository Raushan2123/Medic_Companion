# app/services/llm/schemas.py

PLAN_SCHEMA = {
    "type": "object",
    "properties": {
        "needs_info": {"type": "boolean"},
        "questions": {"type": "array", "items": {"type": "string"}},
        "schedule": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "med_name": {"type": "string"},
                    "time_local": {"type": "string", "description": "HH:MM 24-hour"},
                    "bucket": {"type": "string", "enum": ["MORNING", "AFTERNOON", "NIGHT"]},
                    "notes": {"type": "string"},
                },
                "required": ["med_name", "time_local", "bucket"],
            },
        },
        "precautions": {"type": "array", "items": {"type": "string"}},
        "why": {"type": "array", "items": {"type": "string"}},
        "actions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "type": {
                        "type": "string",
                        "enum": ["CREATE_REMINDERS", "SET_ESCALATION_RULE", "CREATE_CALENDAR_EVENT"],
                    },
                    "needs_approval": {"type": "boolean"},
                    "payload": {"type": "object"},
                },
                "required": ["type", "needs_approval", "payload"],
            },
        },
    },
    "required": ["needs_info", "questions", "schedule", "precautions", "why", "actions"],
}