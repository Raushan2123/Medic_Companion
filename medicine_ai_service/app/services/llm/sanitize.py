# app/services/llm/sanitize.py
import re
import uuid
from typing import Any, Dict, List, Tuple
from app.utils.time_conflict import resolve_time_conflicts

_TIME_RE = re.compile(r"^\d{2}:\d{2}$")

DEFAULT_TIMES = {
    "MORNING": ("MORNING", "09:00"),
    "AFTERNOON": ("AFTERNOON", "14:00"),
    "NIGHT": ("NIGHT", "20:00"),
}
_EVERY_N_RE = re.compile(r"^EVERY_(\d+)_DAYS$")

def _every_n_days(freq: str) -> int | None:
    f = (freq or "").upper().strip()
    m = _EVERY_N_RE.match(f)
    return int(m.group(1)) if m else None

def _dose_id() -> str:
    return "dose_" + uuid.uuid4().hex[:10]

def _valid_time(hhmm: str) -> bool:
    if not _TIME_RE.match(hhmm):
        return False
    h, m = map(int, hhmm.split(":"))
    return 0 <= h <= 23 and 0 <= m <= 59

def _expected_count(freq: str) -> int:
    f = (freq or "").upper().strip()
    if _EVERY_N_RE.match(f):
        return 1
    return {"OD": 1, "BID": 2, "TID": 3, "QID": 4, "WEEKLY": 1}.get(f, 0)

def _default_slots_for(freq: str) -> List[Tuple[str, str]]:
    f = (freq or "").upper().strip()
    if f == "OD":
        return [DEFAULT_TIMES["MORNING"]]
    if f == "BID":
        return [("MORNING", "08:00"), ("NIGHT", "20:00")]
    if f == "TID":
        return [("MORNING", "08:00"), ("AFTERNOON", "14:00"), ("NIGHT", "20:00")]
    if f == "QID":
        return [("MORNING", "08:00"), ("AFTERNOON", "12:00"), ("AFTERNOON", "16:00"), ("NIGHT", "20:00")]
    if f == "WEEKLY":
        return [DEFAULT_TIMES["MORNING"]]
    if _EVERY_N_RE.match(f):
        return [("MORNING", "09:00")]
    return []

def default_precautions() -> List[str]:
    return [
        "Do not double-dose after a missed dose; follow your doctor/pharmacist guidance.",
        "If you feel unusual side effects (dizziness, fainting, severe low sugar symptoms), seek medical help.",
        "Follow the prescription label exactly; this app does not prescribe or diagnose.",
    ]

def default_actions(schedule_count: int) -> List[Dict[str, Any]]:
    if schedule_count <= 0:
        return []
    return [
        {"type": "CREATE_REMINDERS", "needs_approval": True, "payload": {"count": schedule_count}},
        {"type": "SET_ESCALATION_RULE", "needs_approval": True, "payload": {"miss_threshold": 2}},
    ]

def deterministic_why(meds: List[Dict[str, Any]]) -> List[str]:
    out: List[str] = []
    for m in meds:
        name = (m.get("name") or "").strip()
        freq = (m.get("frequency") or "").upper().strip()
        if not name:
            continue

        n = _every_n_days(freq)
        if freq in ("PRN", "UNKNOWN", ""):
            out.append(f"{name}: frequency needs confirmation before reminders are finalized.")
        elif n:
            out.append(f"{name}: scheduled once every {n} days for routine adherence.")
        elif freq == "OD":
            out.append(f"{name}: scheduled once daily for routine consistency.")
        else:
            out.append(f"{name}: scheduled to match {freq} frequency and reduce missed doses.")

        if m.get("with_food") is True:
            out.append(f"{name}: take with food (as per your input).")

    seen = set()
    final = []
    for x in out:
        if x not in seen:
            seen.add(x)
            final.append(x)
    return final[:6]

def sanitize_plan_output(raw: Dict[str, Any], meds: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Returns a safe + repaired plan:
    - schedule only includes known meds
    - frequency counts are enforced (OD=1, BID=2...)
    - precautions/actions always present (if schedule exists)
    - 'why' is deterministic (no medical hallucinations)
    """
    med_map = {m["name"].strip().lower(): m for m in meds if m.get("name")}
    cleaned_sched: List[Dict[str, Any]] = []

    for s in (raw.get("schedule") or []):
        mn = str(s.get("med_name", "")).strip()
        key = mn.lower()
        if key not in med_map:
            continue

        t = str(s.get("time_local", "")).strip()
        b = str(s.get("bucket", "")).strip()
        if b not in ("MORNING", "AFTERNOON", "NIGHT"):
            continue
        if not _valid_time(t):
            continue

        m = med_map[key]
        notes = []
        if m.get("with_food") is True:
            notes.append("Take with food")
        if m.get("strength"):
            notes.append(str(m["strength"]).strip())

        dose = {
            "dose_id": _dose_id(),
            "med_name": m["name"].strip(),
            "time_local": t,
            "bucket": b,
            "notes": " • ".join(notes),
        }
        n = _every_n_days((m.get("frequency") or ""))
        if n:
            dose["repeat_every_days"] = n
        dur = m.get("duration_days")
        if isinstance(dur, int) and dur > 0:
            dose["duration_days"] = dur
        cleaned_sched.append(dose)

    # enforce counts per medicine
    final_sched: List[Dict[str, Any]] = []
    for m in meds:
        name = (m.get("name") or "").strip()
        freq = (m.get("frequency") or "").upper().strip()
        exp = _expected_count(freq)

        if exp == 0:
            continue  # PRN/UNKNOWN => no auto reminders

        existing = [d for d in cleaned_sched if d["med_name"].lower() == name.lower()]
        if len(existing) == exp:
            final_sched.extend(existing)
            continue

        # repair with defaults
        slots = _default_slots_for(freq)[:exp]
        notes = []
        if m.get("with_food") is True:
            notes.append("Take with food")
        if m.get("strength"):
            notes.append(str(m["strength"]).strip())
        note_str = " • ".join(notes)

        n = _every_n_days(freq)

        for bucket, hhmm in slots:
            dose = {
                "dose_id": _dose_id(),
                "med_name": name,
                "time_local": hhmm,
                "bucket": bucket,
                "notes": note_str,
            }
            if n:
                dose["repeat_every_days"] = n
            dur = m.get("duration_days")
            if isinstance(dur, int) and dur > 0:
                dose["duration_days"] = dur
            final_sched.append(dose)

    final_sched = resolve_time_conflicts(final_sched, step_minutes=10)

    # needs_info / questions
    needs_info = bool(raw.get("needs_info", False))
    questions = list(raw.get("questions") or [])

    for m in meds:
        freq = (m.get("frequency") or "").upper().strip()
        if freq in ("PRN", "UNKNOWN", ""):
            needs_info = True
            if not questions:
                questions.append(f"Confirm frequency for {m.get('name','this medicine')} (OD/BID/TID) or PRN/as-needed.")

    if meds and not final_sched:
        needs_info = True
        if "Please confirm medicine frequency (OD/BID/TID) so reminders can be created." not in questions:
            questions.append("Please confirm medicine frequency (OD/BID/TID) so reminders can be created.")

    # precautions/actions/why defaults
    precautions = raw.get("precautions") or []

    # If precautions look like frequency notes, replace with safe defaults
    looks_like_freq = any(
        re.search(r"\b(OD|BID|TID|QID|WEEKLY|EVERY_\d+_DAYS)\b", str(p))
        for p in precautions
    )
    if (not precautions) or looks_like_freq:
        precautions = default_precautions()
    else:
        # also keep it short and clean
        precautions = [str(p).strip() for p in precautions if str(p).strip()][:6]

    why = deterministic_why(meds)

    actions = raw.get("actions") or []
    allowed = {"CREATE_REMINDERS", "SET_ESCALATION_RULE", "CREATE_CALENDAR_EVENT"}
    actions = [a for a in actions if isinstance(a, dict) and a.get("type") in allowed]

    # Enforce safety: actions must require approval
    for a in actions:
        a["needs_approval"] = True

    # If we have a schedule, ALWAYS enforce core defaults
    if final_sched:
        actions = default_actions(len(final_sched))

    return {
        "needs_info": needs_info,
        "questions": questions,
        "schedule": final_sched,
        "precautions": precautions,
        "why": why,
        "actions": actions,
    }