from typing import Any, Dict, List, Optional, TypedDict

class AgentState(TypedDict, total=False):
    # identity (plan_id doubles as LangGraph thread_id)
    plan_id: str
    patient_id: str
    actor_role: str
    timezone: str

    # inputs
    input_text: str
    extracted_text: str
    meds: List[Dict[str, Any]]  # list of Medication dicts

    # outputs
    plan: Dict[str, Any]        # plan response dict (schedule/precautions/why/actions/status)
    approval: Dict[str, Any]    # resume payload from user/caregiver
    executed: Dict[str, Any]    # tool results