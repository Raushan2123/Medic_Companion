import uuid
from typing import List, Tuple
from app.schemas.models import Medication, Dose, ActionProposal, Bucket

def _dose_id() -> str:
    return "dose_" + uuid.uuid4().hex[:10]

def suggest_times_for_frequency(freq: str) -> List[Tuple[Bucket, str]]:
    f = (freq or "").upper().strip()
    if f == "OD":
        return [("MORNING", "09:00")]
    if f == "BID":
        return [("MORNING", "08:00"), ("NIGHT", "20:00")]
    if f == "TID":
        return [("MORNING", "08:00"), ("AFTERNOON", "14:00"), ("NIGHT", "20:00")]
    if f == "QID":
        return [("MORNING", "08:00"), ("AFTERNOON", "12:00"), ("AFTERNOON", "16:00"), ("NIGHT", "20:00")]
    if f == "WEEKLY":
        return [("MORNING", "09:00")]
    return []  # PRN/unknown => safer to avoid fixed reminders

def build_plan(meds: List[Medication], input_text: str):
    schedule: List[Dose] = []
    precautions: List[str] = []
    why: List[str] = []

    for m in meds:
        for bucket, hhmm in suggest_times_for_frequency(m.frequency):
            notes = []
            if m.with_food is True:
                notes.append("Take with food")
            elif m.with_food is False:
                notes.append("Take before food (if prescribed)")
            if m.strength:
                notes.append(m.strength)

            schedule.append(Dose(
                dose_id=_dose_id(),
                med_name=m.name,
                time_local=hhmm,
                bucket=bucket,
                notes=" • ".join(notes),
            ))

    if schedule:
        why += [
            "Grouped doses into morning/afternoon/night to keep it easy to follow.",
            "Used common spacing for multi-dose medicines to reduce missed doses.",
        ]
    else:
        why += ["No fixed schedule created (PRN/as-needed medicines or missing frequency)."]

    precautions += [
        "Do not double-dose after a missed dose; follow your doctor/pharmacist guidance.",
        "If you feel unusual side effects (dizziness, fainting, severe low sugar symptoms), seek medical help.",
        "Follow the prescription label exactly; this app does not prescribe or diagnose.",
    ]

    actions: List[ActionProposal] = []
    if schedule:
        actions.append(ActionProposal(type="CREATE_REMINDERS", needs_approval=True, payload={"count": len(schedule)}))
        actions.append(ActionProposal(type="SET_ESCALATION_RULE", needs_approval=True, payload={"miss_threshold": 2}))

    txt = (input_text or "").lower()
    if any(k in txt for k in ["doctor", "appointment", "checkup", "clinic", "meeting"]):
        actions.append(ActionProposal(
            type="CREATE_CALENDAR_EVENT",
            needs_approval=True,
            payload={"title": "Doctor appointment (suggested)", "duration_minutes": 30},
        ))

    return schedule, precautions, why, actions