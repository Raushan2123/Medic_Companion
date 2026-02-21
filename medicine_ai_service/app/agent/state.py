from typing import Any, Dict, List, Optional, TypedDict

class AgentState(TypedDict, total=False):
    plan_id: str
    patient_id: str
    actor_role: str
    timezone: str

    input_text: str
    extracted_text: str
    meds: List[Dict[str, Any]]

    # outputs
    plan: Dict[str, Any]
    approval: Dict[str, Any]
    executed: Dict[str, Any]

    # ✅ new
    needs_info: bool
    questions: List[str]
    audit: List[Dict[str, Any]]