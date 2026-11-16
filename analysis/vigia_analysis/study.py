"""Analysis of the simulation study (scripts/simulation_study.mjs).

Análisis del estudio de simulación. Métricas de detección, ROC/AUC sin scikit-learn,
intervalos de confianza por bootstrap agrupado por conductor.
"""

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path

import numpy as np
import pandas as pd

RESULTS = Path(__file__).resolve().parents[1] / "results" / "simulation"


def load_study(folder: str | Path = RESULTS) -> dict[str, pd.DataFrame]:
    folder = Path(folder)
    return {
        "e1": pd.read_csv(folder / "e1_thresholds.csv"),
        "e2": pd.read_csv(folder / "e2_fps.csv"),
        "e3": pd.read_csv(folder / "e3_calibration.csv"),
        "e4": pd.read_csv(folder / "e4_minutes.csv"),
        "drivers": pd.read_csv(folder / "e4_drivers.csv"),
    }


def _safe_div(a, b):
    return np.where(b > 0, a / np.where(b > 0, b, 1), np.nan)


def detection_metrics(df: pd.DataFrame, by: list[str]) -> pd.DataFrame:
    """Pooled precision / recall / F1 per event type, and false alarms per hour."""
    g = df.groupby(by).sum(numeric_only=True)
    out = pd.DataFrame(index=g.index)
    for ev in ["blink", "long", "yawn", "head"]:
        tp, fn, fp = g[f"{ev}_tp"], g[f"{ev}_fn"], g[f"{ev}_fp"]
        rec = _safe_div(tp, tp + fn)
        prec = _safe_div(tp, tp + fp)
        out[f"{ev}_recall"] = rec
        out[f"{ev}_precision"] = prec
        out[f"{ev}_f1"] = _safe_div(2 * prec * rec, prec + rec)
        out[f"{ev}_fp_per_h"] = g[f"{ev}_fp"] / g["hours"]
    out["crit_recall"] = _safe_div(g["crit_tp"], g["crit_n"])
    means = df.groupby(by)[["perclos_mae", "perclos_bias", "crit_latency_ms"]].mean()
    return out.join(means)


def auc(y: np.ndarray, score: np.ndarray) -> float:
    """ROC-AUC via the Mann–Whitney U statistic (ties get average ranks)."""
    y = np.asarray(y).astype(bool)
    s = np.asarray(score, dtype=float)
    keep = ~np.isnan(s)
    y, s = y[keep], s[keep]
    n1, n0 = y.sum(), (~y).sum()
    if n1 == 0 or n0 == 0:
        return float("nan")
    ranks = pd.Series(s).rank().to_numpy()
    return float((ranks[y].sum() - n1 * (n1 + 1) / 2) / (n1 * n0))


def roc_curve(y: np.ndarray, score: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """False-positive rate, true-positive rate and thresholds (descending)."""
    y = np.asarray(y).astype(bool)
    s = np.asarray(score, dtype=float)
    keep = ~np.isnan(s)
    y, s = y[keep], s[keep]
    thresholds = np.r_[np.inf, np.unique(s)[::-1]]
    tpr = np.array([(s[y] >= t).mean() for t in thresholds])
    fpr = np.array([(s[~y] >= t).mean() for t in thresholds])
    return fpr, tpr, thresholds


def bootstrap_ci(
    df: pd.DataFrame,
    stat: Callable[[pd.DataFrame], float],
    group: str = "driver",
    n: int = 1000,
    seed: int = 7,
) -> tuple[float, float, float]:
    """Point estimate and 95 % CI, resampling whole drivers (not rows) to avoid leakage."""
    rng = np.random.default_rng(seed)
    ids = df[group].unique()
    parts = {i: df[df[group] == i] for i in ids}
    point = stat(df)
    boots = []
    for _ in range(n):
        sample = pd.concat([parts[i] for i in rng.choice(ids, size=len(ids), replace=True)])
        v = stat(sample)
        if not np.isnan(v):
            boots.append(v)
    lo, hi = np.percentile(boots, [2.5, 97.5]) if boots else (np.nan, np.nan)
    return float(point), float(lo), float(hi)


def alarm_delay(e4: pd.DataFrame, f_threshold: float = 0.5, level: int = 2) -> pd.DataFrame:
    """Minutes between latent fatigue crossing `f_threshold` and the first minute whose
    level reached `level` (2 = moderate). Negative = the alarm came before the threshold."""
    rows = []
    for d, g in e4.sort_values("minute").groupby("driver"):
        f_cross = g.loc[g["f_mean"] >= f_threshold, "minute"]
        alarm = g.loc[g["level_max"] >= level, "minute"]
        rows.append({
            "driver": d,
            "drowsy": not f_cross.empty,
            "f_cross_min": f_cross.min() if not f_cross.empty else np.nan,
            "alarm_min": alarm.min() if not alarm.empty else np.nan,
        })
    out = pd.DataFrame(rows)
    out["delay_min"] = out["alarm_min"] - out["f_cross_min"]
    return out
