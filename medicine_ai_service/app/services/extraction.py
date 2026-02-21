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

def simple_extract_meds(text: str) -> List[Medication]:
    """Hackathon-safe extractor. Prefer passing structured meds from OCR/LLM upstream."""
    meds: List[Medication] = []
    if not text:
        return meds

    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    for ln in lines:
        name_match = re.match(r"^([A-Za-z][A-Za-z0-9\- ]+)", ln)
        if not name_match:
            continue
        name = name_match.group(1).strip()

        strength_match = re.search(r"(\d+\s?(mg|mcg|g|ml))", ln, re.IGNORECASE)
        strength = strength_match.group(1) if strength_match else None

        ln_low = ln.lower()
        freq = next((v for k, v in FREQ_MAP.items() if k in ln_low), "OD")

        with_food = None
        if "with food" in ln_low or "after food" in ln_low:
            with_food = True
        if "before food" in ln_low or "empty stomach" in ln_low:
            with_food = False

        meds.append(Medication(
            name=name,
            strength=strength,
            frequency=freq,
            with_food=with_food,
            instructions=ln,
        ))

    return meds