import re
from pathlib import Path

import pytest

from vigia_analysis import COLUMNS, LEVELS, load_session, per_minute, summarize

ROOT = Path(__file__).parents[2]
SAMPLE = ROOT / "analysis/sample_data/synthetic_session.csv"


def test_python_and_js_agree_on_the_csv_schema():
    js = (ROOT / "web/js/session.js").read_text(encoding="utf-8")
    block = re.search(r"CSV_COLUMNS = \[(.*?)\];", js, re.S).group(1)
    js_columns = re.findall(r"'([a-z0-9_]+)'", block)
    assert js_columns == COLUMNS


def test_load_and_summarise_sample():
    df = load_session(SAMPLE)
    assert list(df["level"].cat.categories) == LEVELS
    s = summarize(df)
    assert s["duration_min"] == pytest.approx(30, abs=0.1)
    assert sum(s["pct_time_per_level"].values()) == pytest.approx(100, abs=0.5)
    assert s["events"]["critical_closures"] >= 1
    assert 0 <= s["score_mean"] <= 100


def test_fatigue_grows_in_the_synthetic_drive():
    m = per_minute(load_session(SAMPLE))
    first, last = m.iloc[:5], m.iloc[-6:-1]
    assert last["score"].mean() > first["score"].mean() + 30
    assert last["perclos"].mean() > first["perclos"].mean()


def test_rejects_foreign_csv(tmp_path):
    bad = tmp_path / "other.csv"
    bad.write_text("a,b\n1,2\n")
    with pytest.raises(ValueError):
        load_session(bad)
