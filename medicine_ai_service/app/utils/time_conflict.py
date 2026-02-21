# app/utils/time_conflict.py
from __future__ import annotations

from typing import Any, Dict, List

_BUCKET_WINDOWS = {
    # minutes from midnight (inclusive)
    "MORNING": (5 * 60, 11 * 60 + 59),
    "AFTERNOON": (12 * 60, 17 * 60 + 59),
    "NIGHT": (18 * 60, 23 * 60 + 59),
}

def _hhmm_to_minutes(hhmm: str) -> int:
    h, m = map(int, hhmm.split(":"))
    return h * 60 + m

def _minutes_to_hhmm(total_minutes: int) -> str:
    total_minutes = max(0, min(23 * 60 + 59, total_minutes))
    h = total_minutes // 60
    m = total_minutes % 60
    return f"{h:02d}:{m:02d}"

def _in_bucket_window(bucket: str, minutes: int) -> bool:
    lo, hi = _BUCKET_WINDOWS.get(bucket, (0, 23 * 60 + 59))
    return lo <= minutes <= hi

def resolve_time_conflicts(
    schedule: List[Dict[str, Any]],
    step_minutes: int = 10,
) -> List[Dict[str, Any]]:
    """
    Ensures no two doses share the same time_local within the same bucket.
    Strategy:
      - keep earliest dose at original time
      - if conflict: shift forward by +step_minutes within bucket window
      - else shift backward within bucket window
      - if still can't: leave as-is (rare)
    """
    sched = list(schedule)

    for bucket in ("MORNING", "AFTERNOON", "NIGHT"):
        idxs = [i for i, d in enumerate(sched) if d.get("bucket") == bucket and d.get("time_local")]
        if not idxs:
            continue

        def key_fn(i: int):
            d = sched[i]
            t = str(d.get("time_local", "00:00"))
            try:
                mins = _hhmm_to_minutes(t)
            except Exception:
                mins = 0
            return (mins, str(d.get("med_name", "")), str(d.get("dose_id", "")))

        idxs.sort(key=key_fn)
        used = set()

        for i in idxs:
            d = sched[i]
            t = str(d.get("time_local", "00:00"))

            try:
                base = _hhmm_to_minutes(t)
            except Exception:
                base = _hhmm_to_minutes("09:00")

            # snap into bucket if needed
            if not _in_bucket_window(bucket, base):
                base = _hhmm_to_minutes("09:00" if bucket == "MORNING" else "14:00" if bucket == "AFTERNOON" else "20:00")

            chosen = base
            ok = False

            # forward search
            for k in range(0, 13):  # up to 2 hours
                cand = base + k * step_minutes
                if not _in_bucket_window(bucket, cand):
                    break
                if cand not in used:
                    chosen = cand
                    ok = True
                    break

            # backward search
            if not ok:
                for k in range(1, 13):
                    cand = base - k * step_minutes
                    if not _in_bucket_window(bucket, cand):
                        break
                    if cand not in used:
                        chosen = cand
                        ok = True
                        break

            used.add(chosen)
            d["time_local"] = _minutes_to_hhmm(chosen)

    return sched