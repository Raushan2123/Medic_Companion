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
#                     "frequency": {"type": "string", "description": "OD/BID/TID/QID/WEEKLY/PRN/UNKNOWN/EVERY_N_DAYS"},
#                     "with_food": {"type": "boolean"},
#                     "instructions": {"type": "string"},

#                     # ✅ NEW
#                     "duration_days": {"type": ["integer", "null"], "description": "Total days to continue, if stated"},
#                 },
#                 "required": ["name", "frequency"],
#             },
#         }
#     },
#     "required": ["meds"],
# }

# app/services/llm/extraction_schema.py

MEDS_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "meds": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "name": {"type": "string"},
                    "strength": {"type": "string"},
                    "frequency": {"type": "string"},
                    "with_food": {"type": "boolean"},
                    "instructions": {"type": "string"},
                    # ✅ optional (omit if unknown)
                    "duration_days": {"type": "integer"},
                },
                "required": ["name", "frequency"],
            },
        }
    },
    "required": ["meds"],
}