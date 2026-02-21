from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field

ActorRole = Literal["PATIENT", "CAREGIVER"]
PlanStatus = Literal["PROPOSED", "APPROVED", "REJECTED"]
AdherenceStatus = Literal["TAKEN", "SNOOZED", "SKIPPED", "MISSED"]
ActionType = Literal["CREATE_REMINDERS", "CREATE_CALENDAR_EVENT", "SEND_ALERT", "SET_ESCALATION_RULE"]
Bucket = Literal["MORNING", "AFTERNOON", "NIGHT"]

SAFETY_NOTE = (
    "Not medical advice. This service organizes user-provided medicines. "
    "Always confirm instructions with a doctor/pharmacist."
)

NextStep = Literal["NEED_INFO", "NEED_APPROVAL", "DONE"]

class Medication(BaseModel):
    name: str
    strength: Optional[str] = None
    frequency: str = Field(..., description="OD, BID, TID, QID, WEEKLY, PRN, UNKNOWN, EVERY_N_DAYS")
    with_food: Optional[bool] = None
    instructions: Optional[str] = None

    # ✅ NEW
    duration_days: Optional[int] = Field(
        default=None,
        description="How long to continue this medicine. Null means ongoing/unknown.",
        ge=1,
        le=365,
    )

class Dose(BaseModel):
    dose_id: str
    med_name: str
    time_local: str  # "HH:MM"
    bucket: Bucket
    notes: str = ""

    # ✅ NEW: recurrence + duration metadata
    repeat_every_days: Optional[int] = None
    duration_days: Optional[int] = None

class ActionProposal(BaseModel):
    type: ActionType
    needs_approval: bool = True
    payload: Dict[str, Any] = Field(default_factory=dict)

class PlanRequest(BaseModel):
    patient_id: str
    actor_role: ActorRole = "PATIENT"
    timezone: str = "Asia/Kolkata"
    input_text: Optional[str] = None
    extracted_text: Optional[str] = None  # OCR output (if available)
    meds: Optional[List[Medication]] = None  # structured meds (preferred)

class PlanTextRequest(BaseModel):
    patient_id: str
    actor_role: ActorRole = "CAREGIVER"   # caregiver likely
    timezone: str = "Asia/Kolkata"
    free_text: str                        # caregiver typed text
    # optional: if you want to pass start date later
    # start_date: Optional[str] = None

class PlanResponse(BaseModel):
    plan_id: str
    status: PlanStatus
    schedule: List[Dose]
    precautions: List[str]
    why: List[str]
    actions: List[ActionProposal]
    safety_note: str = SAFETY_NOTE

    # ✅ new
    next_step: Optional[NextStep] = None
    questions: List[str] = []

class ApproveEdits(BaseModel):
    dose_time_overrides: Dict[str, str] = Field(default_factory=dict)  # dose_id -> "HH:MM"

class ApproveRequest(BaseModel):
    plan_id: str
    actor_role: ActorRole = "PATIENT"
    approved_action_types: List[ActionType] = Field(default_factory=list)
    edits: Optional[ApproveEdits] = None
    auth_proof: Optional[str] = None

class ToolResult(BaseModel):
    ok: bool
    mock: bool = True
    details: Dict[str, Any] = Field(default_factory=dict)

class ApproveResponse(BaseModel):
    plan: PlanResponse
    executed: Dict[str, ToolResult]

class QueryRequest(BaseModel):
    plan_id: str
    question: str

class QueryResponse(BaseModel):
    answer: str
    safety_note: str = SAFETY_NOTE

class AdherenceMarkRequest(BaseModel):
    plan_id: str
    dose_id: str
    status: AdherenceStatus
    action_time_iso: str  # ISO8601 with timezone

class AdherenceEvent(BaseModel):
    plan_id: str
    dose_id: str
    status: AdherenceStatus
    scheduled_time_local: str
    action_time_iso: str
    delay_minutes: Optional[int] = None

class AdherenceSummary(BaseModel):
    plan_id: str
    days: int
    total_events: int
    taken: int
    missed: int
    skipped: int
    snoozed: int
    adherence_rate: float
    avg_delay_minutes: Optional[float] = None