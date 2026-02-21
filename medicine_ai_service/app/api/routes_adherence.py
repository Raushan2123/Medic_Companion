from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException
from app.agent.graph import med_graph
from app.schemas.models import AdherenceMarkRequest, AdherenceEvent, AdherenceSummary
from app.services.adherence_store import append_event, list_events
from app.services.tools import mock_send_alert

router = APIRouter(prefix="/adherence", tags=["adherence"])

def _config(plan_id: str):
    return {"configurable": {"thread_id": plan_id}}

def _delay_minutes(action_time_iso: str, scheduled_hhmm: str):
    try:
        action_dt = datetime.fromisoformat(action_time_iso.replace("Z", "+00:00"))
        hh, mm = map(int, scheduled_hhmm.split(":"))
        scheduled_dt = action_dt.replace(hour=hh, minute=mm, second=0, microsecond=0)
        return int((action_dt - scheduled_dt).total_seconds() // 60)
    except Exception:
        return None

@router.post("/mark", response_model=AdherenceEvent)
def mark(req: AdherenceMarkRequest):
    snap = med_graph.get_state(_config(req.plan_id))
    state = snap.values or {}
    plan = (state.get("plan") or {})
    schedule = plan.get("schedule", [])

    dose = next((d for d in schedule if d.get("dose_id") == req.dose_id), None)
    if not dose:
        raise HTTPException(status_code=404, detail="dose_id not found in plan schedule")

    delay = _delay_minutes(req.action_time_iso, dose["time_local"])
    ev = AdherenceEvent(
        plan_id=req.plan_id,
        dose_id=req.dose_id,
        status=req.status,
        scheduled_time_local=dose["time_local"],
        action_time_iso=req.action_time_iso,
        delay_minutes=delay,
    )
    append_event(ev)

    # Missed dose escalation (mock): after 2 missed
    if req.status == "MISSED":
        missed_count = sum(1 for e in list_events() if e.plan_id == req.plan_id and e.status == "MISSED")
        if missed_count >= 2:
            mock_send_alert(req.plan_id, {"reason": "MISSED_DOSE_THRESHOLD", "missed_count": missed_count})

    return ev

@router.get("/summary", response_model=AdherenceSummary)
def summary(plan_id: str, days: int = 7):
    cutoff = datetime.utcnow() - timedelta(days=days)
    events = []
    for e in list_events():
        if e.plan_id != plan_id:
            continue
        try:
            dt = datetime.fromisoformat(e.action_time_iso.replace("Z", "+00:00"))
            if dt >= cutoff:
                events.append(e)
        except Exception:
            events.append(e)

    taken = sum(1 for e in events if e.status == "TAKEN")
    missed = sum(1 for e in events if e.status == "MISSED")
    skipped = sum(1 for e in events if e.status == "SKIPPED")
    snoozed = sum(1 for e in events if e.status == "SNOOZED")
    total = len(events)
    rate = (taken / total) if total else 0.0
    delays = [e.delay_minutes for e in events if e.delay_minutes is not None and e.status == "TAKEN"]
    avg_delay = (sum(delays) / len(delays)) if delays else None

    return AdherenceSummary(
        plan_id=plan_id,
        days=days,
        total_events=total,
        taken=taken,
        missed=missed,
        skipped=skipped,
        snoozed=snoozed,
        adherence_rate=round(rate, 3),
        avg_delay_minutes=round(avg_delay, 1) if avg_delay is not None else None,
    )