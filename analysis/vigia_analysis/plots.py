"""Session plots / Gráficos de sesión."""

from __future__ import annotations

import matplotlib.pyplot as plt
import pandas as pd

from .session import LEVEL_BOUNDS, LEVEL_COLORS


def plot_session(df: pd.DataFrame, title: str = "Vigía session"):
    """Four stacked panels, one y-axis each: score, PERCLOS, blink duration and events."""
    fig, (ax1, ax2, ax3, ax4) = plt.subplots(
        4, 1, figsize=(11, 9), sharex=True, gridspec_kw={"height_ratios": [2, 1.1, 1.1, 1]}
    )
    x = df["minute"]

    for level, (lo, hi) in LEVEL_BOUNDS.items():
        ax1.axhspan(lo, hi, color=LEVEL_COLORS[level], alpha=0.12, lw=0)
    ax1.plot(x, df["score"], color="#111827", lw=1.6)
    ax1.set_ylim(0, 100)
    ax1.set_ylabel("Fatigue score")
    ax1.set_title(title)

    ax2.plot(x, 100 * df["perclos_60s"], color="#2a78d6", lw=1.4)
    ax2.axhline(15, color="#52514e", lw=1, ls="--")
    ax2.set_ylabel("PERCLOS (%)")

    ax3.plot(x, df["avg_blink_ms"], color="#eb6834", lw=1.4)
    ax3.set_ylabel("Blink (ms)")

    events = {"long_closures": ("Long closure", "#e34948", "v"),
              "yawns": ("Yawn", "#eda100", "o"),
              "head_deviations": ("Head nod/turn", "#1baf7a", "s"),
              "face_lost": ("Face lost", "#52514e", "x"),
              "critical_closures": ("Critical closure", "#6250d6", "*")}
    for i, (col, (label, color, marker)) in enumerate(events.items()):
        hits = df[df[col] > 0]
        ax4.scatter(hits["minute"], [i] * len(hits), color=color, marker=marker, s=40, label=label)
    ax4.set_yticks(range(len(events)), [v[0] for v in events.values()], fontsize=8)
    ax4.set_xlabel("Minutes")
    for ax in (ax1, ax2, ax3, ax4):
        ax.grid(axis="x", alpha=0.3)
        ax.spines[["top", "right"]].set_visible(False)
    fig.tight_layout()
    return fig
