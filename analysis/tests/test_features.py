import json
from pathlib import Path

import numpy as np
import pytest

from vigia_analysis import (
    detect_closures,
    ear_from_landmarks,
    eye_aspect_ratio,
    mouth_aspect_ratio,
    rolling_perclos,
)

FIXTURES = json.loads((Path(__file__).parents[2] / "tests/fixtures/metrics_cases.json").read_text())


@pytest.mark.parametrize("case", FIXTURES["ear"], ids=lambda c: c["name"])
def test_ear_matches_shared_fixture(case):
    got = eye_aspect_ratio(case["points"], case["width"], case["height"])
    assert got == pytest.approx(case["expected"], abs=1e-6)


@pytest.mark.parametrize("case", FIXTURES["mar"], ids=lambda c: c["name"])
def test_mar_matches_shared_fixture(case):
    got = mouth_aspect_ratio(case["left"], case["right"], case["pairs"], case["width"], case["height"])
    assert got == pytest.approx(case["expected"], abs=1e-6)


def test_degenerate_eye_returns_none():
    assert eye_aspect_ratio([(0.5, 0.5)] * 6) is None


def test_ear_from_full_landmark_list():
    lm = [(0.0, 0.0)] * 478
    lm = list(lm)
    eye = FIXTURES["ear"][0]["points"]
    for idx, p in zip((33, 160, 158, 133, 153, 144), eye):
        lm[idx] = p
    for idx, p in zip((362, 385, 387, 263, 373, 380), eye):
        lm[idx] = p
    assert ear_from_landmarks(lm, 1, 1) == pytest.approx(2 / 3)


def test_rolling_perclos_and_closures():
    fps = 30
    t = np.arange(0, 20_000, 1000 / fps)
    # 300 ms closure every 2 s → PERCLOS ≈ 15 %
    closed = (t % 2000) < 300
    perclos = rolling_perclos(closed, t, window_ms=10_000)
    assert perclos.iloc[-1] == pytest.approx(0.15, abs=0.02)

    closures = detect_closures(closed, t)
    assert (closures["kind"] == "blink").all()
    assert len(closures) == 10
    assert closures["duration_ms"].mean() == pytest.approx(300, abs=1000 / fps + 1)


def test_long_closure_and_noise():
    t = np.arange(0, 3000, 1000 / 30)
    closed = (t >= 500) & (t < 1600)
    closed[80] = True  # one-frame noise
    kinds = detect_closures(closed, t)["kind"].tolist()
    assert kinds == ["long_closure"]


def test_auc_and_roc_basic_cases():
    from vigia_analysis.study import auc, roc_curve

    assert auc([0, 0, 1, 1], [0.1, 0.2, 0.8, 0.9]) == 1.0
    assert auc([0, 0, 1, 1], [0.9, 0.8, 0.2, 0.1]) == 0.0
    assert auc([0, 1, 0, 1], [0.5, 0.5, 0.5, 0.5]) == 0.5
    fpr, tpr, _ = roc_curve([0, 0, 1, 1], [0.1, 0.2, 0.8, 0.9])
    assert fpr[0] == 0 and tpr[-1] == 1


def test_alarm_delay():
    import pandas as pd

    from vigia_analysis.study import alarm_delay

    e4 = pd.DataFrame({
        "driver": [1] * 4 + [2] * 4,
        "minute": [0, 1, 2, 3] * 2,
        "f_mean": [0.1, 0.4, 0.6, 0.8, 0.1, 0.1, 0.1, 0.1],
        "level_max": [0, 1, 1, 2, 0, 0, 0, 0],
    })
    out = alarm_delay(e4).set_index("driver")
    assert out.loc[1, "delay_min"] == 1
    assert not out.loc[2, "drowsy"]
