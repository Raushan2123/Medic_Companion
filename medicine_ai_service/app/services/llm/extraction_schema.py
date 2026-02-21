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
                    "frequency": {"type": "string", "description": "OD/BID/TID/QID/WEEKLY/PRN/UNKNOWN/EVERY_N_DAYS"},
                    "with_food": {"type": "boolean"},
                    "instructions": {"type": "string"},

                    # ✅ NEW
                    "duration_days": {"type": ["integer", "null"], "description": "Total days to continue, if stated"},
                },
                "required": ["name", "frequency"],
            },
        }
    },
    "required": ["meds"],
}