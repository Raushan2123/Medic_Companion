import uuid
from fastapi import APIRouter, HTTPException
from langgraph.types import Command
from app.agent.graph import med_graph
from app.schemas.models import (
    PlanRequest, PlanResponse,
    ApproveRequest, ApproveResponse,
    QueryRequest, QueryResponse,
    Dose, ToolResult
)

router = APIRouter(prefix="/ai", tags=["ai"])

def _config(plan_id: str):
    # plan_id IS the thread_id
    return {"configurable": {"thread_id": plan_id}}

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
    }

    result = med_graph.invoke(initial_state, config=_config(plan_id))

    # When interrupt happens, you’ll see __interrupt__ in result :contentReference[oaicite:3]{index=3}
    if "__interrupt__" not in result:
        # Should not happen in our graph (approval node always interrupts),
        # but keep a safe fallback.
        raise HTTPException(status_code=500, detail="Expected interrupt but graph did not pause.")

    plan = result.get("plan")
    if not plan:
        raise HTTPException(status_code=500, detail="Plan missing from graph state.")

    return PlanResponse(
        plan_id=plan["plan_id"],
        status=plan["status"],
        schedule=[Dose(**d) for d in plan.get("schedule", [])],
        precautions=plan.get("precautions", []),
        why=plan.get("why", []),
        actions=plan.get("actions", []),
    )

@router.post("/approve", response_model=ApproveResponse)
def ai_approve(req: ApproveRequest):
    plan_id = req.plan_id

    resume_payload = {
        "actor_role": req.actor_role,
        "approved_action_types": req.approved_action_types,
        "edits": (req.edits.model_dump() if req.edits else {}),
    }

    final_state = med_graph.invoke(Command(resume=resume_payload), config=_config(plan_id))

    plan = final_state.get("plan")
    if not plan:
        raise HTTPException(status_code=500, detail="Plan missing after resume.")

    executed_raw = final_state.get("executed", {}) or {}
    executed = {k: ToolResult(**v) for k, v in executed_raw.items()}

    plan_resp = PlanResponse(
        plan_id=plan["plan_id"],
        status=plan["status"],
        schedule=[Dose(**d) for d in plan.get("schedule", [])],
        precautions=plan.get("precautions", []),
        why=plan.get("why", []),
        actions=plan.get("actions", []),
    )

    return ApproveResponse(plan=plan_resp, executed=executed)

@router.post("/query", response_model=QueryResponse)
def ai_query(req: QueryRequest):
    # Simple “state-aware” Q&A without an LLM (hackathon-safe).
    snap = med_graph.get_state(_config(req.plan_id))  # :contentReference[oaicite:4]{index=4}
    state = snap.values or {}
    plan = state.get("plan") or {}
    q = req.question.lower().strip()

    if "schedule" in q or "time" in q:
        items = plan.get("schedule", [])
        if not items:
            return QueryResponse(answer="No schedule is set yet. Please add medicines with frequency.")
        lines = [f"- {d['med_name']} at {d['time_local']} ({d['bucket']})" for d in items]
        return QueryResponse(answer="Here is your current schedule:\n" + "\n".join(lines))

    if "precaution" in q or "safety" in q:
        prec = plan.get("precautions", [])
        return QueryResponse(answer="Safety reminders:\n" + "\n".join([f"- {p}" for p in prec]))

    if "why" in q or "reason" in q:
        why = plan.get("why", [])
        return QueryResponse(answer="Why this plan:\n" + "\n".join([f"- {w}" for w in why]))

    return QueryResponse(answer="Ask: 'show schedule', 'show precautions', or 'why this plan?'.")