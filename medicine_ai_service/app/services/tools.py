import uuid
from typing import Any, Dict, List
from app.schemas.models import Dose, ToolResult

def mock_create_reminders(plan_id: str, schedule: List[Dose]) -> ToolResult:
    return ToolResult(ok=True, mock=True, details={"created": len(schedule), "plan_id": plan_id})

def mock_create_calendar_event(plan_id: str, payload: Dict[str, Any]) -> ToolResult:
    return ToolResult(ok=True, mock=True, details={"event_id": "evt_" + uuid.uuid4().hex[:8], **payload})

def mock_send_alert(plan_id: str, payload: Dict[str, Any]) -> ToolResult:
    return ToolResult(ok=True, mock=True, details={"sent": True, **payload})

def mock_set_escalation_rule(plan_id: str, miss_threshold: int) -> ToolResult:
    return ToolResult(ok=True, mock=True, details={"miss_threshold": miss_threshold})

def execute_action(plan_id: str, action_type: str, schedule: List[Dose], payload: Dict[str, Any]) -> ToolResult:
    if action_type == "CREATE_REMINDERS":
        return mock_create_reminders(plan_id, schedule)
    if action_type == "CREATE_CALENDAR_EVENT":
        return mock_create_calendar_event(plan_id, payload)
    if action_type == "SEND_ALERT":
        return mock_send_alert(plan_id, payload)
    if action_type == "SET_ESCALATION_RULE":
        return mock_set_escalation_rule(plan_id, int(payload.get("miss_threshold", 2)))
    return ToolResult(ok=False, mock=True, details={"error": f"Unknown action {action_type}"})