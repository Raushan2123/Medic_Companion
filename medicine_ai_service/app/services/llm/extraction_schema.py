# app/services/llm/extraction_schema.py

MEDS_SCHEMA = {
    "type": "object",
    "properties": {
        "meds": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "strength": {"type": "string"},
                    "frequency": {"type": "string", "description": "OD/BID/TID/QID/WEEKLY/PRN/UNKNOWN"},
                    "with_food": {"type": "boolean"},
                    "instructions": {"type": "string"},
                },
                "required": ["name", "frequency"],
            },
        }
    },
    "required": ["meds"],
}