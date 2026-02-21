from typing import Any, Dict, List
from langgraph.types import interrupt
from app.agent.state import AgentState
from app.schemas.models import Medication, Dose
from app.services.extraction import simple_extract_meds
from app.services.planning import build_plan
from app.services.tools import execute_action

def extract_node(state: AgentState) -> Dict[str, Any]:
    meds = state.get("meds")
    if meds:
        return {}

    src = state.get("extracted_text") or state.get("input_text") or ""
    extracted = simple_extract_meds(src)
    return {"meds": [m.model_dump() for m in extracted]}

def plan_node(state: AgentState) -> Dict[str, Any]:
    plan_id = state["plan_id"]
    input_text = state.get("input_text") or ""

    meds_dicts = state.get("meds") or []
    meds = [Medication(**m) for m in meds_dicts]

    # If still no meds, return a safe “needs clarification” plan.
    if not meds:
        plan = {
            "plan_id": plan_id,
            "status": "PROPOSED",
            "schedule": [],
            "precautions": [
                "Please add medicine names and frequency from the prescription label.",
                "This app organizes user-provided meds; it does not prescribe or diagnose.",
            ],
            "why": ["I couldn't confidently extract medicines/frequency from the input."],
            "actions": [],
        }
        return {"plan": plan}

    schedule, precautions, why, actions = build_plan(meds, input_text)

    plan = {
        "plan_id": plan_id,
        "status": "PROPOSED",
        "schedule": [d.model_dump() for d in schedule],
        "precautions": precautions,
        "why": why,
        "actions": [a.model_dump() for a in actions],
    }
    return {"plan": plan}

def approval_node(state: AgentState) -> Dict[str, Any]:
    """
    This node ALWAYS interrupts. The interrupt payload is what your frontend displays.
    On resume, the resume payload becomes the return value of interrupt().
    """
    plan = state["plan"]
    payload = {
        "type": "APPROVAL_REQUIRED",
        "plan_id": plan["plan_id"],
        "plan": {
            "status": plan["status"],
            "schedule": plan["schedule"],
            "precautions": plan["precautions"],
            "why": plan["why"],
            "actions": plan["actions"],
        },
        "instructions": "Review schedule + precautions, optionally edit times, then approve actions.",
    }

    resume_value = interrupt(payload)  # surfaced to caller under __interrupt__ :contentReference[oaicite:1]{index=1}
    # resume_value should be JSON (approved_action_types, edits, actor_role)
    return {"approval": resume_value}

def execute_node(state: AgentState) -> Dict[str, Any]:
    plan = state["plan"]
    approval = state.get("approval") or {}
    approved_action_types: List[str] = approval.get("approved_action_types", [])
    edits = approval.get("edits", {}) or {}
    dose_time_overrides: Dict[str, str] = edits.get("dose_time_overrides", {}) or {}

    # Apply edits to schedule
    schedule = plan.get("schedule", [])
    for d in schedule:
        did = d["dose_id"]
        if did in dose_time_overrides:
            d["time_local"] = dose_time_overrides[did]

    # Execute approved tool-actions (mock)
    executed: Dict[str, Any] = {}
    schedule_models = [Dose(**d) for d in schedule]

    for action in plan.get("actions", []):
        a_type = action["type"]
        if a_type not in approved_action_types:
            continue
        executed[a_type] = execute_action(plan["plan_id"], a_type, schedule_models, action.get("payload", {})).model_dump()

    plan["status"] = "APPROVED"
    return {"plan": plan, "executed": executed}