"""Facial fatigue features — Python twin of ``web/js/metrics.js``.

Rasgos faciales de fatiga — gemelo en Python de ``web/js/metrics.js``.

Both implementations are tested against ``tests/fixtures/metrics_cases.json`` so a
model trained here behaves the same once its logic is moved to the browser.
Ambas implementaciones se prueban con el mismo fixture, para que lo que se entrene
acá se comporte igual al llevarlo al navegador.
"""

from __future__ import annotations

from collections.abc import Sequence

import numpy as np
import pandas as pd

Point = Sequence[float]

# MediaPipe Face Mesh indices (same as web/js/metrics.js)
RIGHT_EYE = (33, 160, 158, 133, 153, 144)
LEFT_EYE = (362, 385, 387, 263, 373, 380)
MOUTH_LEFT, MOUTH_RIGHT = 78, 308
MOUTH_PAIRS = ((82, 87), (13, 14), (312, 317))


def _dist(a: Point, b: Point, width: float = 1.0, height: float = 1.0) -> float:
    return float(np.hypot((a[0] - b[0]) * width, (a[1] - b[1]) * height))


def eye_aspect_ratio(points: Sequence[Point], width: float = 1.0, height: float = 1.0) -> float | None:
    """Eye Aspect Ratio (Soukupová & Čech, 2016).

    ``points`` = [p1 outer corner, p2, p3, p4 inner corner, p5, p6]
    EAR = (|p2 - p6| + |p3 - p5|) / (2 |p1 - p4|)
    """
    p = points
    horizontal = _dist(p[0], p[3], width, height)
    if horizontal <= 1e-9:
        return None
    return (_dist(p[1], p[5], width, height) + _dist(p[2], p[4], width, height)) / (2 * horizontal)


def mouth_aspect_ratio(
    left: Point,
    right: Point,
    pairs: Sequence[tuple[Point, Point]],
    width: float = 1.0,
    height: float = 1.0,
) -> float | None:
    """Mouth Aspect Ratio: mean inner-lip opening divided by mouth width."""
    horizontal = _dist(left, right, width, height)
    if horizontal <= 1e-9 or not pairs:
        return None
    vertical = np.mean([_dist(u, d, width, height) for u, d in pairs])
    return float(vertical / horizontal)


def ear_from_landmarks(landmarks: Sequence[Point], width: float, height: float) -> float | None:
    """Mean EAR of both eyes from a full 478-point landmark list (x, y normalised)."""
    r = eye_aspect_ratio([landmarks[i] for i in RIGHT_EYE], width, height)
    left = eye_aspect_ratio([landmarks[i] for i in LEFT_EYE], width, height)
    return None if r is None or left is None else (r + left) / 2


def mar_from_landmarks(landmarks: Sequence[Point], width: float, height: float) -> float | None:
    pairs = [(landmarks[u], landmarks[d]) for u, d in MOUTH_PAIRS]
    return mouth_aspect_ratio(landmarks[MOUTH_LEFT], landmarks[MOUTH_RIGHT], pairs, width, height)


def rolling_perclos(closed: Sequence[bool], t_ms: Sequence[float], window_ms: float = 60_000) -> pd.Series:
    """Time-based rolling PERCLOS: share of frames with eyes closed in the last ``window_ms``.

    PERCLOS móvil: proporción de cuadros con ojos cerrados en la ventana.
    """
    s = pd.Series(np.asarray(closed, dtype=float), index=pd.to_timedelta(np.asarray(t_ms), unit="ms"))
    return pd.Series(s.rolling(f"{int(window_ms)}ms").mean().to_numpy(), name="perclos")


def detect_closures(
    closed: Sequence[bool],
    t_ms: Sequence[float],
    min_blink_ms: float = 50,
    long_closure_ms: float = 800,
) -> pd.DataFrame:
    """Find eye-closure episodes and label them ``blink`` or ``long_closure``.

    Same rules as the browser (``FatigueMonitor.endClosure``): an episode lasts from
    the first closed frame to the first open frame after it.
    """
    closed = np.asarray(closed, dtype=bool)
    t = np.asarray(t_ms, dtype=float)
    rows = []
    start = None
    for i, c in enumerate(closed):
        if c and start is None:
            start = t[i]
        elif not c and start is not None:
            dur = t[i] - start
            if dur >= min_blink_ms:
                rows.append({"start_ms": start, "duration_ms": dur,
                             "kind": "long_closure" if dur >= long_closure_ms else "blink"})
            start = None
    return pd.DataFrame(rows, columns=["start_ms", "duration_ms", "kind"])
