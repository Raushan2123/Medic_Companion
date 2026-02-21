# app/api/routes_ai.py
import uuid
import os
from fastapi import APIRouter, HTTPException
from langgraph.types import Command
from app.agent.graph import med_graph
from app.schemas.models import (
    PlanRequest, PlanResponse,
    ApproveRequest, ApproveResponse,
    QueryRequest, QueryResponse,
    Dose, ToolResult, Medication
)
from fastapi import Depends
from app.services.security import verify_internal_service
from pydantic import BaseModel
from typing import List, Optional, Dict, Any

router = APIRouter(prefix="/ai", tags=["ai"])

def _config(plan_id: str):
    return {"configurable": {"thread_id": plan_id}}

def _current_plan_response(plan_id: str):
    snap = med_graph.get_state(_config(plan_id))
    state = snap.values or {}
    plan = state.get("plan") or {}
    return snap, state, plan

class ContinueRequest(BaseModel):
    plan_id: str
    actor_role: str = "PATIENT"
    meds: Optional[List[Medication]] = None
    extracted_text: Optional[str] = None

def _interrupt_type(state: Dict[str, Any]) -> str | None:
    ints = state.get("__interrupt__")
    if not ints:
        return None
    # LangGraph stores interrupt payloads in __interrupt__ (list). :contentReference[oaicite:6]{index=6}
    try:
        return ints[0].value.get("type")  # common shape
    except Exception:
        return None

def _pending_interrupt_type(snap):
    interrupts = getattr(snap, "interrupts", None) or ()
    if not interrupts:
        return None
    payload = interrupts[-1].value
    return payload.get("type") if isinstance(payload, dict) else None

@router.post("/plan", response_model=PlanResponse)
def ai_plan(req: PlanRequest):
    plan_id = "plan_" + uuid.uuid4().hex

    initial_state = {
        "plan_id": plan_id,
        "patient_id": req.patient_id,
        "actor_role": req.actor_role,
        "timezone": req.timezone,
        "input_text": req.input_text or "",
        "extracted_text": req.extracted_text or "",
        "meds": [m.model_dump() for m in (req.meds or [])] or None,
        "audit": [],
    }

    result = med_graph.invoke(initial_state, config=_config(plan_id))

    plan = result.get("plan")
    if not plan:
        raise HTTPException(status_code=500, detail="Plan missing from graph state.")

    itype = _interrupt_type(result)
    next_step = "NEED_INFO" if itype == "NEED_INFO" else "NEED_APPROVAL"

    return PlanResponse(
        plan_id=plan["plan_id"],
        status=plan["status"],
        schedule=[Dose(**d) for d in plan.get("schedule", [])],
        precautions=plan.get("precautions", []),
        why=plan.get("why", []),
        actions=plan.get("actions", []),
        next_step=next_step,
        questions=result.get("questions", []),
    )

@router.post("/continue", response_model=PlanResponse)
def ai_continue(req: ContinueRequest):
    snap, state, plan = _current_plan_response(req.plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="plan_id not found")

    itype = _pending_interrupt_type(snap)

    # ✅ If waiting for approval, do NOT resume here
    if itype == "APPROVAL_REQUIRED":
        return PlanResponse(
            plan_id=plan["plan_id"],
            status=plan["status"],
            schedule=[Dose(**d) for d in plan.get("schedule", [])],
            precautions=plan.get("precautions", []),
            why=plan.get("why", []),
            actions=plan.get("actions", []),
            next_step="NEED_APPROVAL",
            questions=state.get("questions", []),
        )

    # ✅ Only resume if waiting for NEED_INFO
    if itype != "NEED_INFO":
        # Graph is not paused (maybe DONE) or unknown
        done_step = "DONE" if plan.get("status") == "APPROVED" else None
        return PlanResponse(
            plan_id=plan["plan_id"],
            status=plan["status"],
            schedule=[Dose(**d) for d in plan.get("schedule", [])],
            precautions=plan.get("precautions", []),
            why=plan.get("why", []),
            actions=plan.get("actions", []),
            next_step=done_step,
            questions=state.get("questions", []),
        )

    # ✅ Require actual new info
    if not req.meds and not req.extracted_text:
        raise HTTPException(status_code=400, detail="Provide meds[] or extracted_text to continue.")

    resume_payload = {"actor_role": req.actor_role}
    if req.meds:
        resume_payload["meds"] = [m.model_dump() for m in req.meds]
    if req.extracted_text:
        resume_payload["extracted_text"] = req.extracted_text

    result = med_graph.invoke(Command(resume=resume_payload), config=_config(req.plan_id))

    plan2 = result.get("plan") or {}
    if not plan2:
        raise HTTPException(status_code=500, detail="Plan missing after continue resume.")

    # After resuming NEED_INFO, the next interrupt should be APPROVAL_REQUIRED
    next_step = "NEED_APPROVAL" if "__interrupt__" in result else None

    return PlanResponse(
        plan_id=plan2["plan_id"],
        status=plan2["status"],
        schedule=[Dose(**d) for d in plan2.get("schedule", [])],
        precautions=plan2.get("precautions", []),
        why=plan2.get("why", []),
        actions=plan2.get("actions", []),
        next_step=next_step,
        questions=result.get("questions", []),
    )

@router.post("/approve", response_model=ApproveResponse)
def ai_approve(
    req: ApproveRequest,
    _ = Depends(verify_internal_service)
):

    if not req.approved_action_types:
        raise HTTPException(
            status_code=400,
            detail="Select at least one action to approve."
        )

    plan_id = req.plan_id

    snap, state, plan = _current_plan_response(plan_id)
    itype = _pending_interrupt_type(snap)

    if itype != "APPROVAL_REQUIRED":
        raise HTTPException(
            status_code=409,
            detail=f"Plan not waiting for approval. interrupt_type={itype}"
        )

    resume_payload = {
        "actor_role": "CAREGIVER",  # trusted backend
        "approved_action_types": req.approved_action_types,
        "edits": (req.edits.model_dump() if req.edits else {}),
    }

    final_state = med_graph.invoke(
        Command(resume=resume_payload),
        config=_config(plan_id)
    )

    plan = final_state.get("plan")
    if not plan:
        raise HTTPException(status_code=500, detail="Plan missing after approve.")

    executed_raw = final_state.get("executed", {}) or {}
    executed = {k: ToolResult(**v) for k, v in executed_raw.items()}

    plan_resp = PlanResponse(
        plan_id=plan["plan_id"],
        status=plan["status"],
        schedule=[Dose(**d) for d in plan.get("schedule", [])],
        precautions=plan.get("precautions", []),
        why=plan.get("why", []),
        actions=plan.get("actions", []),
        next_step="DONE",
        questions=[],
    )

    return ApproveResponse(plan=plan_resp, executed=executed)

@router.get("/audit")
def ai_audit(plan_id: str):
    snap = med_graph.get_state(_config(plan_id))  # persistence via thread_id :contentReference[oaicite:7]{index=7}
    return {"plan_id": plan_id, "audit": (snap.values or {}).get("audit", [])}

@router.get("/debug_state")
def debug_state(plan_id: str):
    snap = med_graph.get_state(_config(plan_id))
    return {
        "interrupt_type": _pending_interrupt_type(snap),
        "state_keys": list((snap.values or {}).keys()),
        "plan_status": ((snap.values or {}).get("plan") or {}).get("status"),
    }

# in any router
import os
@router.get("/debug_hf")
def debug_hf():
    import os
    return {
        "HF_TOKEN_set": bool(os.getenv("HF_TOKEN")),
        "HF_PROVIDER": os.getenv("HF_PROVIDER"),
        "HF_MODEL_PLAN": os.getenv("HF_MODEL_PLAN"),
        "HF_MODEL_EXTRACT": os.getenv("HF_MODEL_EXTRACT"),
        "USE_LLM_PLANNING": os.getenv("USE_LLM_PLANNING"),
    }