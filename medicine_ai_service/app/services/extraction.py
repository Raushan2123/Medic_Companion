import re
from typing import List
from app.schemas.models import Medication

FREQ_MAP = {
    "once daily": "OD", "once": "OD", "od": "OD", "1x": "OD",
    "twice daily": "BID", "twice": "BID", "bd": "BID", "bid": "BID", "2x": "BID",
    "thrice daily": "TID", "thrice": "TID", "tid": "TID", "3x": "TID",
    "qid": "QID", "4x": "QID",
    "weekly": "WEEKLY",
    "prn": "PRN", "as needed": "PRN",
}

_MED_HINT_RE = re.compile(r"\b(tab|tabs|tablet|cap|caps|capsule|mg|mcg|ml|od|bd|bid|tid|qid|daily|weekly|prn)\b", re.I)
_STRENGTH_RE = re.compile(r"(\d+\s?(mg|mcg|g|ml))", re.IGNORECASE)

def simple_extract_meds(text: str) -> List[Medication]:
    """
    Only extract if the line looks like a medication instruction.
    Prevents parsing normal sentences as med names.
    """
    meds: List[Medication] = []
    if not text:
        return meds

    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    for ln in lines:
        # ✅ must look like a medicine line (strength/frequency/keywords)
        if not (_MED_HINT_RE.search(ln) or _STRENGTH_RE.search(ln)):
            continue

        name_match = re.match(r"^([A-Za-z][A-Za-z0-9\- ]+)", ln)
        if not name_match:
            continue
        name = name_match.group(1).strip()

        strength_match = _STRENGTH_RE.search(ln)
        strength = strength_match.group(1) if strength_match else None

        ln_low = ln.lower()
        freq = next((v for k, v in FREQ_MAP.items() if k in ln_low), None)

        # ✅ if no frequency AND no strength, skip (avoid false positives)
        if not freq and not strength:
            continue

        with_food = None
        if "with food" in ln_low or "after food" in ln_low:
            with_food = True
        if "before food" in ln_low or "empty stomach" in ln_low:
            with_food = False

        meds.append(Medication(
            name=name,
            strength=strength,
            frequency=freq or "OD",  # safe default only when it *looks* like a med line
            with_food=with_food,
            instructions=ln,
        ))

    return meds