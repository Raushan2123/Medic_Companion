import json
from datetime import datetime
from typing import Any, Dict, List, Optional

import pandas as pd
import requests
import streamlit as st
import re
from dotenv import load_dotenv

load_dotenv()

st.set_page_config(page_title="Medicine Companion Demo", layout="wide")

# ---------------------------
# Config
# ---------------------------
DEFAULT_API_BASE = "http://127.0.0.1:8000"
API_BASE = st.sidebar.text_input("API Base URL", value=DEFAULT_API_BASE)

# ---------------------------
# Helpers (API)
# ---------------------------
def api_post(path: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    url = f"{API_BASE}{path}"
    r = requests.post(url, json=payload, timeout=20)
    if r.status_code >= 400:
        raise RuntimeError(f"{r.status_code} {r.text}")
    return r.json()

def api_get(path: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    url = f"{API_BASE}{path}"
    r = requests.get(url, params=params or {}, timeout=20)
    if r.status_code >= 400:
        raise RuntimeError(f"{r.status_code} {r.text}")
    return r.json()

# ---------------------------
# Extraction preview (same idea as backend)
# ---------------------------
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

def preview_extract_meds(text: str) -> List[Dict[str, Any]]:
    meds = []
    if not text:
        return meds
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    for ln in lines:
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
        if not freq and not strength:
            continue

        with_food = None
        if "with food" in ln_low or "after food" in ln_low:
            with_food = True
        if "before food" in ln_low or "empty stomach" in ln_low:
            with_food = False

        meds.append({
            "name": name,
            "strength": strength or "",
            "frequency": freq or "OD",
            "with_food": with_food if with_food is not None else False,
        })
    return meds

# ---------------------------
# Session state
# ---------------------------
if "plan_id" not in st.session_state:
    st.session_state.plan_id = ""
if "last_plan" not in st.session_state:
    st.session_state.last_plan = None
if "debug" not in st.session_state:
    st.session_state.debug = None
if "last_executed" not in st.session_state:
    st.session_state.last_executed = None
if "last_audit" not in st.session_state:
    st.session_state.last_audit = None

def refresh_debug():
    if not st.session_state.plan_id:
        return
    # Optional endpoint you added
    try:
        st.session_state.debug = api_get("/ai/debug_state", {"plan_id": st.session_state.plan_id})
    except Exception:
        st.session_state.debug = None

def refresh_audit():
    if not st.session_state.plan_id:
        return
    try:
        st.session_state.last_audit = api_get("/ai/audit", {"plan_id": st.session_state.plan_id})
    except Exception:
        st.session_state.last_audit = None

def infer_stage() -> str:
    plan = st.session_state.last_plan or {}
    status = plan.get("status")
    next_step = plan.get("next_step")
    dbg = st.session_state.debug or {}
    itype = dbg.get("interrupt_type")

    if not st.session_state.plan_id:
        return "INPUT"
    if status == "APPROVED":
        return "DONE"
    if itype == "APPROVAL_REQUIRED" or next_step == "NEED_APPROVAL":
        return "AWAITING_APPROVAL"
    if next_step == "NEED_INFO":
        return "NEED_INFO"
    return "PROPOSED"

# ---------------------------
# UI
# ---------------------------
st.title("💊 Medicine Companion — Agentic Workflow Demo (Streamlit)")

col_left, col_right = st.columns([1.2, 1])

with col_right:
    st.subheader("Workflow Status")

    stage = infer_stage()
    stages = ["INPUT", "NEED_INFO", "AWAITING_APPROVAL", "DONE"]
    idx = stages.index(stage) if stage in stages else 0
    st.progress((idx + 1) / len(stages))

    st.write(f"**Current Stage:** `{stage}`")
    if st.session_state.plan_id:
        st.code(st.session_state.plan_id)

    if st.button("🔄 Refresh Debug/Audit"):
        refresh_debug()
        refresh_audit()
        st.success("Refreshed.")

    if st.button("🧹 Reset Session"):
        st.session_state.plan_id = ""
        st.session_state.last_plan = None
        st.session_state.debug = None
        st.session_state.last_executed = None
        st.session_state.last_audit = None
        st.rerun()

    st.divider()
    st.subheader("Debug (optional)")
    if st.session_state.debug:
        st.json(st.session_state.debug)
    else:
        st.caption("Debug endpoint not available or not fetched yet.")

with col_left:
    st.subheader("1) Input")

    patient_id = st.text_input("patient_id", value="p001")
    timezone = st.text_input("timezone", value="Asia/Kolkata")

    input_text = st.text_area(
        "User input text (optional)",
        value="I have BP + diabetes meds - make a simple schedule + precautions.",
        height=80,
    )

    extracted_text = st.text_area(
        "Prescription OCR text (optional)",
        value="Metformin 500mg twice daily with food\nAmlodipine 5mg once daily",
        height=90,
    )

    st.caption("Tip: If you provide OCR text, the backend can extract meds. This UI also previews extraction below.")

    st.subheader("2) Extraction Preview (UI-only)")
    preview_src = extracted_text.strip() or input_text.strip()
    extracted_preview = preview_extract_meds(preview_src)
    if extracted_preview:
        st.success(f"Preview extracted {len(extracted_preview)} medicine(s). You can autofill the meds table.")
        if st.button("⬇️ Autofill meds table from preview"):
            st.session_state["meds_df"] = pd.DataFrame(extracted_preview)
            st.rerun()
    else:
        st.info("No meds detected in preview (this is normal for vague text).")

    # meds editor
    st.subheader("3) Structured Meds (editable)")
    if "meds_df" not in st.session_state:
        st.session_state["meds_df"] = pd.DataFrame(
            [
                {"name": "Metformin", "strength": "500mg", "frequency": "BID", "with_food": True},
                {"name": "Amlodipine", "strength": "5mg", "frequency": "OD", "with_food": False},
            ]
        )

    meds_df = st.data_editor(
        st.session_state["meds_df"],
        num_rows="dynamic",
        use_container_width=True,
        key="meds_editor",
    )

    send_meds = st.checkbox("Send meds[] to backend", value=True)
    send_extracted_text = st.checkbox("Send extracted_text to backend", value=False)

    colA, colB = st.columns(2)

    with colA:
        if st.button("🚀 Generate Plan (/ai/plan)"):
            payload = {
                "patient_id": patient_id,
                "actor_role": "PATIENT",
                "timezone": timezone,
                "input_text": input_text,
            }
            if send_extracted_text:
                payload["extracted_text"] = extracted_text
            if send_meds:
                meds_list = meds_df.fillna("").to_dict(orient="records")
                # convert possible numpy bools
                for m in meds_list:
                    m["with_food"] = bool(m.get("with_food", False))
                payload["meds"] = meds_list

            try:
                resp = api_post("/ai/plan", payload)
                st.session_state.plan_id = resp["plan_id"]
                st.session_state.last_plan = resp
                st.session_state.last_executed = None
                refresh_debug()
                refresh_audit()
                st.success("Plan created.")
            except Exception as e:
                st.error(str(e))

    with colB:
        if st.button("➡️ Continue (/ai/continue)"):
            if not st.session_state.plan_id:
                st.warning("Create a plan first.")
            else:
                payload = {
                    "plan_id": st.session_state.plan_id,
                    "actor_role": "PATIENT",
                }
                meds_list = meds_df.fillna("").to_dict(orient="records")
                for m in meds_list:
                    m["with_food"] = bool(m.get("with_food", False))
                # always send meds on continue (since this is HITL “provide missing info”)
                payload["meds"] = meds_list

                try:
                    resp = api_post("/ai/continue", payload)
                    st.session_state.last_plan = resp
                    refresh_debug()
                    refresh_audit()
                    st.success("Continued.")
                except Exception as e:
                    st.error(str(e))

    st.divider()
    st.subheader("Current Plan Output")
    if st.session_state.last_plan:
        st.json(st.session_state.last_plan)
    else:
        st.caption("No plan yet.")

# ---------------------------
# HITL & Approval section
# ---------------------------
st.divider()
st.subheader("4) HITL + Approval")

plan = st.session_state.last_plan or {}
next_step = plan.get("next_step")
questions = plan.get("questions", [])

if stage == "NEED_INFO" or next_step == "NEED_INFO":
    st.warning("HITL REQUIRED: The agent needs more info before it can generate a valid schedule.")
    if questions:
        st.write("**Questions:**")
        for q in questions:
            st.write(f"- {q}")
    st.info("Fill the meds table above and click **Continue**.")

elif stage == "AWAITING_APPROVAL" or next_step == "NEED_APPROVAL":
    st.success("HITL APPROVAL REQUIRED: Review plan, optionally edit times, then approve actions.")

    schedule = plan.get("schedule", [])
    actions = plan.get("actions", [])

    col1, col2 = st.columns([1.2, 1])

    with col1:
        st.write("### Schedule (edit times)")
        if schedule:
            sched_df = pd.DataFrame(schedule)
            sched_df_display = sched_df[["dose_id", "med_name", "time_local", "bucket", "notes"]].copy()
            edited_sched_df = st.data_editor(sched_df_display, use_container_width=True, num_rows="fixed")

            # Build time overrides: compare original vs edited
            overrides = {}
            orig_times = {d["dose_id"]: d["time_local"] for d in schedule}
            for _, row in edited_sched_df.iterrows():
                did = row["dose_id"]
                new_time = str(row["time_local"])
                if did in orig_times and new_time != orig_times[did]:
                    overrides[did] = new_time
        else:
            st.info("No schedule to approve yet.")
            overrides = {}

    with col2:
        st.write("### Actions to approve")
        approved = []
        for a in actions:
            a_type = a.get("type")
            label = f"{a_type}  |  payload={a.get('payload')}"
            if st.checkbox(label, value=True, key=f"act_{a_type}"):
                approved.append(a_type)

        actor_role = st.radio("Approve as", ["PATIENT", "CAREGIVER"], index=1)

        if st.button("✅ Approve (/ai/approve)"):
            if not st.session_state.plan_id:
                st.warning("No plan_id.")
            else:
                payload = {
                    "plan_id": st.session_state.plan_id,
                    "actor_role": actor_role,
                    "approved_action_types": approved,
                    "edits": {"dose_time_overrides": overrides},
                }
                try:
                    resp = api_post("/ai/approve", payload)
                    st.session_state.last_plan = resp["plan"]
                    st.session_state.last_executed = resp.get("executed")
                    refresh_debug()
                    refresh_audit()
                    st.success("Approved and executed tools (mock).")
                except Exception as e:
                    st.error(str(e))

if st.session_state.last_executed:
    st.write("### Tool Execution Results (mock)")
    st.json(st.session_state.last_executed)

# ---------------------------
# Done + Adherence + Analytics
# ---------------------------
st.divider()
st.subheader("5) Done + Adherence Logging + Analytics")

if (st.session_state.last_plan or {}).get("status") == "APPROVED":
    st.success("Plan is APPROVED ✅ Now you can log adherence events and view analytics.")

    schedule = (st.session_state.last_plan or {}).get("schedule", [])
    if schedule:
        dose_options = {f"{d['med_name']} @ {d['time_local']} ({d['dose_id']})": d["dose_id"] for d in schedule}
        selected_label = st.selectbox("Select a dose to log", list(dose_options.keys()))
        dose_id = dose_options[selected_label]
    else:
        dose_id = st.text_input("dose_id (manual)")

    status = st.selectbox("status", ["TAKEN", "SNOOZED", "SKIPPED", "MISSED"])
    action_time_iso = st.text_input(
        "action_time_iso",
        value=datetime.now().astimezone().isoformat(timespec="seconds"),
    )

    colx, coly = st.columns(2)
    with colx:
        if st.button("📝 Log adherence (/adherence/mark)"):
            if not st.session_state.plan_id:
                st.warning("No plan_id")
            else:
                payload = {
                    "plan_id": st.session_state.plan_id,
                    "dose_id": dose_id,
                    "status": status,
                    "action_time_iso": action_time_iso,
                }
                try:
                    resp = api_post("/adherence/mark", payload)
                    st.success("Logged.")
                    st.json(resp)
                except Exception as e:
                    st.error(str(e))

    with coly:
        if st.button("📊 Summary (/adherence/summary)"):
            if not st.session_state.plan_id:
                st.warning("No plan_id")
            else:
                try:
                    resp = api_get("/adherence/summary", {"plan_id": st.session_state.plan_id, "days": 7})
                    st.json(resp)
                except Exception as e:
                    st.error(str(e))
else:
    st.info("Once you approve the plan, adherence + analytics will unlock here.")

# ---------------------------
# Query + Audit
# ---------------------------
st.divider()
st.subheader("6) Query + Audit Trail (Recruiter-friendly)")

qcol1, qcol2 = st.columns([1.2, 1])
with qcol1:
    question = st.text_input("Ask something about the plan (e.g., 'show schedule', 'show precautions', 'why this plan?')",
                             value="show schedule")
    if st.button("🔎 Ask (/ai/query)"):
        if not st.session_state.plan_id:
            st.warning("No plan_id")
        else:
            try:
                resp = api_post("/ai/query", {"plan_id": st.session_state.plan_id, "question": question})
                st.json(resp)
            except Exception as e:
                st.error(str(e))

with qcol2:
    if st.button("🧾 Load Audit (/ai/audit)"):
        refresh_audit()

    if st.session_state.last_audit:
        st.json(st.session_state.last_audit)
    else:
        st.caption("Audit not loaded or endpoint not available.")