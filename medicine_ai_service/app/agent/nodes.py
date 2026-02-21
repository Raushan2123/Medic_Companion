# app/agent/nodes.py
from typing import Any, Dict, List
from langgraph.types import interrupt
from app.agent.state import AgentState
from app.schemas.models import Medication, Dose
from app.services.extraction import simple_extract_meds
from app.services.planning import build_plan
from app.services.tools import execute_action
from app.core.llm_config import USE_LLM_EXTRACTION
from app.services.llm.extraction import llm_extract_meds
from app.services.extraction import simple_extract_meds  # keep fallback
from app.core.llm_config import USE_LLM_PLANNING
from app.services.llm.planner import llm_build_plan

def _audit(state: AgentState, event: str, extra: Dict[str, Any] | None = None) -> Dict[str, Any]:
    audit = list(state.get("audit") or [])
    audit.append({"event": event, **(extra or {})})
    return {"audit": audit}

def extract_node(state: AgentState) -> Dict[str, Any]:
    if state.get("meds"):
        return _audit(state, "extract.skip", {"reason": "meds already provided"})

    ocr = (state.get("extracted_text") or "").strip()
    if ocr:
        try:
            if USE_LLM_EXTRACTION:
                meds = llm_extract_meds(ocr)
                return {"meds": meds, **_audit(state, "extract.llm.done", {"count": len(meds)})}
        except Exception as e:
            extracted = simple_extract_meds(ocr)
            return {
                "meds": [m.model_dump() for m in extracted],
                **_audit(state, "extract.fallback.done", {"count": len(extracted), "error": str(e)}),
            }

    # no ocr -> heuristic from input_text (optional)
    txt = state.get("input_text") or ""
    extracted = simple_extract_meds(txt)
    return {"meds": [m.model_dump() for m in extracted], **_audit(state, "extract.heuristic.done", {"count": len(extracted)})}


def plan_node(state: AgentState) -> Dict[str, Any]:
    plan_id = state["plan_id"]
    input_text = state.get("input_text") or ""
    timezone = state.get("timezone") or "Asia/Kolkata"

    meds_dicts = state.get("meds") or []
    meds = [Medication(**m) for m in meds_dicts] if meds_dicts else []

    # ---------------------------
    # 1) LLM planning path (preferred)
    # ---------------------------
    if USE_LLM_PLANNING and meds_dicts:
        try:
            llm_out = llm_build_plan(meds_dicts, input_text, timezone)

            # LLM output is already normalized by llm_build_plan()
            schedule_llm = llm_out.get("schedule", []) or []
            precautions = llm_out.get("precautions", []) or []
            why = llm_out.get("why", []) or []
            actions = llm_out.get("actions", []) or []

            needs_info = bool(llm_out.get("needs_info", False))
            questions: List[str] = list(llm_out.get("questions", []) or [])

            # extra safety: if meds exist but schedule empty -> force NEED_INFO
            if meds_dicts and len(schedule_llm) == 0:
                needs_info = True
                if not questions:
                    questions.append("I couldn't create reminder times. Confirm frequency (OD/BID/TID) for each medicine.")

            plan = {
                "plan_id": plan_id,
                "status": "PROPOSED",
                "schedule": schedule_llm,   # already list of dicts with dose_id
                "precautions": precautions,
                "why": why,
                "actions": actions,
            }

            next_step = "NEED_INFO" if needs_info else "NEED_APPROVAL"

            out: Dict[str, Any] = {
                "plan": plan,
                "needs_info": needs_info,
                "questions": questions,
                "next_step": next_step,
            }
            out.update(_audit(state, "plan.llm.done", {"needs_info": needs_info, "schedule_count": len(schedule_llm)}))
            return out

        except Exception as e:
            # fall back to heuristic plan
            pass

    # ---------------------------
    # 2) Heuristic planning fallback
    # ---------------------------
    schedule, precautions, why, actions = build_plan(meds, input_text) if meds else (
        [],
        [
            "Please confirm medicine names and frequency from the prescription label.",
            "This app organizes user-provided meds; it does not prescribe or diagnose.",
        ],
        ["I couldn't confidently create a schedule because medicine info is incomplete."],
        [],
    )

    needs_info = (len(meds) == 0) or (len(schedule) == 0)
    questions: List[str] = []
    if len(meds) == 0:
        questions.append("Please add at least one medicine with frequency (OD/BID/TID).")
    elif len(schedule) == 0:
        questions.append("I found medicines but couldn't create reminder times. Confirm frequency and timing.")

    plan = {
        "plan_id": plan_id,
        "status": "PROPOSED",
        "schedule": [d.model_dump() for d in schedule],
        "precautions": precautions,
        "why": why,
        "actions": [a.model_dump() for a in actions],
    }

    next_step = "NEED_INFO" if needs_info else "NEED_APPROVAL"

    out: Dict[str, Any] = {
        "plan": plan,
        "needs_info": needs_info,
        "questions": questions,
        "next_step": next_step,
    }
    out.update(_audit(state, "plan.done", {"needs_info": needs_info, "schedule_count": len(schedule)}))
    return out

def route_after_plan(state: AgentState) -> str:
    # conditional edge target
    return "need_info" if state.get("needs_info") else "approval"

def need_info_node(state: AgentState) -> Dict[str, Any]:
    """
    Interrupt to collect missing info.
    Resume payload expected: {"meds":[...]} OR {"extracted_text":"..."}.
    """
    payload = {
        "type": "NEED_INFO",
        "plan_id": state["plan_id"],
        "questions": state.get("questions", []),
        "current_meds_guess": state.get("meds", []),
    }

    resume = interrupt(payload)  # resume value comes via Command(resume=...) :contentReference[oaicite:4]{index=4}

    updates: Dict[str, Any] = {}
    if isinstance(resume, dict):
        if "meds" in resume and resume["meds"]:
            updates["meds"] = resume["meds"]
        if "extracted_text" in resume and resume["extracted_text"]:
            updates["extracted_text"] = resume["extracted_text"]

    updates.update(_audit(state, "need_info.resumed", {"keys": list((resume or {}).keys()) if isinstance(resume, dict) else []}))
    # go back to plan node (graph edge does that)
    return updates

def approval_node(state: AgentState) -> Dict[str, Any]:
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
        "instructions": "Review schedule, optionally edit times, then approve actions.",
    }

    resume_value = interrupt(payload)  # approval payload via Command(resume=...) :contentReference[oaicite:5]{index=5}
    return {"approval": resume_value, **_audit(state, "approval.resumed")}

def execute_node(state: AgentState) -> Dict[str, Any]:
    plan = state["plan"]
    approval = state.get("approval") or {}
    approved_action_types: List[str] = approval.get("approved_action_types", [])
    edits = approval.get("edits", {}) or {}
    dose_time_overrides: Dict[str, str] = edits.get("dose_time_overrides", {}) or {}

    # apply edits
    schedule = plan.get("schedule", [])
    for d in schedule:
        did = d["dose_id"]
        if did in dose_time_overrides:
            d["time_local"] = dose_time_overrides[did]

    executed: Dict[str, Any] = {}
    schedule_models = [Dose(**d) for d in schedule]

    for action in plan.get("actions", []):
        a_type = action["type"]
        if a_type not in approved_action_types:
            continue
        executed[a_type] = execute_action(
            plan["plan_id"], a_type, schedule_models, action.get("payload", {})
        ).model_dump()

    plan["status"] = "APPROVED"

    return {
        "plan": plan,
        "executed": executed,
        "next_step": "DONE",  # ✅ this is correct
        **_audit(state, "execute.done", {"executed": list(executed.keys())}),
    }