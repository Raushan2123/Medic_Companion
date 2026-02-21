# app/services/llm/extraction_sanitize.py
from typing import Any, Dict, List
import re

_ALLOWED_FREQ = {"OD", "BID", "TID", "QID", "WEEKLY", "PRN", "UNKNOWN"}

def normalize_frequency(freq_raw: str) -> str:
    f = (freq_raw or "").strip().lower()

    # direct codes
    if f.upper() in _ALLOWED_FREQ:
        return f.upper()

    # common words
    if "once" in f or "1x" in f or "one time" in f:
        return "OD"
    if "twice" in f or "2x" in f or "two times" in f:
        return "BID"
    if "thrice" in f or "3x" in f or "three times" in f:
        return "TID"
    if "four" in f or "4x" in f:
        return "QID"
    if "weekly" in f or "once a week" in f:
        return "WEEKLY"
    if "prn" in f or "as needed" in f:
        return "PRN"

    # abbreviations often seen in prescriptions
    if re.search(r"\b(bd|bid)\b", f):
        return "BID"
    if re.search(r"\b(tid)\b", f):
        return "TID"
    if re.search(r"\b(qid)\b", f):
        return "QID"
    if re.search(r"\b(od)\b", f):
        return "OD"

    # patterns like 1-0-1, 1-1-1 etc
    m = re.search(r"\b([01])\-([01])\-([01])(?:\-([01]))?\b", f)
    if m:
        total = sum(int(x) for x in m.groups() if x is not None)
        return {1: "OD", 2: "BID", 3: "TID", 4: "QID"}.get(total, "UNKNOWN")

    return "UNKNOWN"

def normalize_duration_days(v) -> int | None:
    try:
        if v is None:
            return None
        d = int(v)
        if 1 <= d <= 365:
            return d
        return None
    except Exception:
        return None

def sanitize_extracted_meds(raw: Dict[str, Any]) -> List[Dict[str, Any]]:
    meds = raw.get("meds", []) or []
    cleaned: List[Dict[str, Any]] = []

    for m in meds:
        name = (m.get("name") or "").strip()
        if not name:
            continue

        freq = normalize_frequency(m.get("frequency") or "")

        cleaned.append({
            "name": name,
            "strength": (m.get("strength") or "").strip(),
            "frequency": freq,
            "with_food": bool(m.get("with_food", False)),
            "instructions": (m.get("instructions") or "").strip(),
            "duration_days": normalize_duration_days(m.get("duration_days")),
        })

    # de-duplicate by (name, strength, frequency)
    seen = set()
    out = []
    for m in cleaned:
        key = (m["name"].lower(), m["strength"].lower(), m["frequency"])
        if key in seen:
            continue
        seen.add(key)
        out.append(m)

    return out