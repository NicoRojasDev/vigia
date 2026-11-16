"""Load and summarise session CSVs exported by the web app.

Cargar y resumir los CSV de sesión exportados por la app web.
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd

# Must match CSV_COLUMNS in web/js/session.js (checked by tests/test_session.py).
COLUMNS = [
    "t_s", "engine", "fps", "proc_ms", "face_ratio", "ear_mean", "mar_max", "eye_closed_ratio",
    "blink_score_mean", "jaw_open_max", "pitch_mean", "yaw_mean", "perclos_60s",
    "blink_rate_min", "avg_blink_ms", "blinks", "long_closures", "yawns",
    "head_deviations", "face_lost", "critical_closures",
    "c_perclos", "c_long_closures", "c_yawns", "c_blink_duration", "c_head",
    "score", "level",
]
CONTRIBUTION_COLUMNS = ["c_perclos", "c_long_closures", "c_yawns", "c_blink_duration", "c_head"]
LEVELS = ["ok", "mild", "moderate", "high"]
EVENT_COLUMNS = ["blinks", "long_closures", "yawns", "head_deviations", "face_lost", "critical_closures"]
LEVEL_COLORS = {"ok": "#22c55e", "mild": "#eab308", "moderate": "#f97316", "high": "#ef4444"}
LEVEL_BOUNDS = {"ok": (0, 30), "mild": (30, 55), "moderate": (55, 75), "high": (75, 100)}


def load_session(path: str | Path) -> pd.DataFrame:
    """Read a Vigía CSV, check its columns and set proper dtypes."""
    df = pd.read_csv(path)
    missing = [c for c in COLUMNS if c not in df.columns]
    if missing:
        raise ValueError(f"Not a Vigía session file, missing columns: {missing}")
    df["level"] = pd.Categorical(df["level"], categories=LEVELS, ordered=True)
    for c in EVENT_COLUMNS + ["score", "fps", "t_s"]:
        df[c] = pd.to_numeric(df[c], errors="coerce").fillna(0).astype(int)
    df["minute"] = df["t_s"] / 60
    return df


def summarize(df: pd.DataFrame) -> dict:
    """Key figures of one session (duration, score, time per level, events)."""
    seconds_per_level = df["level"].value_counts().reindex(LEVELS, fill_value=0)
    return {
        "duration_min": round(len(df) / 60, 1),
        "engine": str(df["engine"].iloc[0]) if len(df) else None,
        "mean_fps": round(float(df["fps"].mean()), 1) if len(df) else None,
        "score_mean": round(float(df["score"].mean()), 1),
        "score_max": int(df["score"].max()),
        "perclos_max": round(float(df["perclos_60s"].max()), 3),
        "pct_time_per_level": (100 * seconds_per_level / max(len(df), 1)).round(1).to_dict(),
        "events": {c: int(df[c].sum()) for c in EVENT_COLUMNS},
    }


def per_minute(df: pd.DataFrame) -> pd.DataFrame:
    """Aggregate the per-second rows into one row per minute (handy for modelling)."""
    m = df.assign(min=(df["t_s"] // 60).astype(int)).groupby("min")
    return pd.DataFrame({
        "score": m["score"].mean(),
        "perclos": m["perclos_60s"].mean(),
        "blink_rate": m["blink_rate_min"].mean(),
        "avg_blink_ms": m["avg_blink_ms"].mean(),
        "ear": m["ear_mean"].mean(),
        **{c: m[c].sum() for c in EVENT_COLUMNS},
    })
