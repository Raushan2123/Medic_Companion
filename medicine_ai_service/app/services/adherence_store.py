from typing import List, Dict, Any
from app.schemas.models import AdherenceEvent

ADHERENCE_LOG: List[AdherenceEvent] = []

def append_event(ev: AdherenceEvent) -> None:
    ADHERENCE_LOG.append(ev)

def list_events() -> List[AdherenceEvent]:
    return ADHERENCE_LOG