#!/usr/bin/env python3
"""Download the REAL NASA light curves for AstroPulse's six stars.

Run once on your own computer (needs internet, takes a few minutes):

    pip install lightkurve numpy
    python scripts/fetch_targets.py

It writes public/data/<star>.json. AstroPulse picks them up automatically and
switches the badge from "Stand-in" to "Real NASA data".
Stars that fail are skipped; run it again later to retry.
"""
import json
import os
import sys

import numpy as np

try:
    import lightkurve as lk
except ImportError:
    sys.exit("Install first:  pip install lightkurve numpy")

# id used by the app, search name, mission, days of data to keep
TARGETS = [
    ("hd209458", "HD 209458", "TESS", 27.4),
    ("wasp18", "WASP-18", "TESS", 27.4),
    ("pimen", "pi Men", "TESS", 27.4),
    ("kepler10", "Kepler-10", "Kepler", 40),
    ("kepler186", "Kepler-186", "Kepler", 40),
]

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "data")
os.makedirs(OUT, exist_ok=True)


def bin_to(t, f, step_days):
    """Average into fixed bins so files stay small (about 10 minutes)."""
    idx = np.floor((t - t[0]) / step_days).astype(int)
    out_t, out_f = [], []
    for i in np.unique(idx):
        m = idx == i
        out_t.append(t[m].mean())
        out_f.append(f[m].mean())
    return np.array(out_t), np.array(out_f)


def main():
    ok = 0
    for sid, name, mission, days in TARGETS:
        print(f"{name} ({mission}) ...", end=" ", flush=True)
        try:
            if mission == "TESS":
                res = lk.search_lightcurve(name, mission="TESS", author="SPOC", exptime=120)
            else:
                res = lk.search_lightcurve(name, mission="Kepler", author="Kepler", cadence="long")
            if len(res) == 0:
                print("nothing found")
                continue
            lc = res[0].download(quality_bitmask="default").remove_nans().normalize()
            t = np.asarray(lc.time.value, dtype=float)
            f = np.asarray(lc.flux.value, dtype=float)
            keep = (t - t[0]) <= days
            t, f = t[keep], f[keep]
            t, f = bin_to(t, f, 10 / 1440)
            with open(os.path.join(OUT, f"{sid}.json"), "w") as fh:
                json.dump({"time": [round(float(x), 5) for x in t], "flux": [round(float(x), 6) for x in f]}, fh)
            print(f"ok, {len(t)} points")
            ok += 1
        except Exception as e:  # network or one target failing should not stop the rest
            print("skipped:", e)
    print(f"\nWrote {ok} of {len(TARGETS)} stars to public/data/. Restart `npm run dev`.")


if __name__ == "__main__":
    main()
