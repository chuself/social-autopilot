"""Find where each screen recording is loading, and propose each step's still.

    python scripts/screens-analyse.py            writes `loading` and proposed `still` into the manifest
    python scripts/screens-analyse.py --force    re-proposes stills already chosen

Run on the PC after scripts/screens-sync.mjs (needs numpy + opencv). Never in CI: the results
are committed in brands/operra/screens/manifest.json, and the director checks the proposals
by eye (node scripts/screens-sync.mjs --stills) before marking a step ok.

A loading frame is a skeleton (nine or more text-free bands of flat grey, see skeleton_bands) or
a blank page (under 0.4% dark pixels: "Authenticating..."). Sparse real screens such as a check-in
success page keep 7-8% dark pixels, so they are never mistaken for loading. Playback holds the last real
frame through a loading stretch, and a still is never taken from one.
"""
import json
import sys
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
LIB = ROOT / "brands" / "operra" / "screens"
FPS = 10


def skeleton_bands(g):
    """Rows of a half-size frame that are flat skeleton grey with no text at all. A page still
    loading has many (18-44 measured); a real screen, even with grey inputs or a grey balance
    box, has at most 5 (stay, today, checkin, kds, 2026-11-20). The first rule (grey share plus
    almost no dark pixels) missed half-loaded pages: a real header over skeleton lists."""
    n = 0
    for y in range(0, g.shape[0] - 10, 10):
        b = g[y:y + 10]
        if ((b >= 226) & (b < 244)).mean() > 0.45 and (b < 200).mean() == 0:
            n += 1
    return n


def frames(clip):
    cap = cv2.VideoCapture(str(clip))
    src = cap.get(cv2.CAP_PROP_FPS) or 30
    step = max(1, round(src / FPS))
    i, out = 0, []
    while True:
        ok, f = cap.read()
        if not ok:
            break
        if i % step == 0:
            g = cv2.cvtColor(f, cv2.COLOR_BGR2GRAY)
            g = cv2.resize(g, (g.shape[1] // 2, g.shape[0] // 2))
            dark = float((g < 200).mean())
            out.append((i / src, g, skeleton_bands(g) >= 9 or dark < 0.004))
        i += 1
    return out


def main(force):
    m = json.loads((LIB / "manifest.json").read_text(encoding="utf-8"))
    for name, r in m["recordings"].items():
        fr = frames(LIB / name / "clip.mp4")
        ts = np.array([t for t, _, _ in fr])
        dens = np.array([(cv2.Canny(g, 60, 160) > 0).mean() for _, g, _ in fr])
        diff = np.array([0.0] + [float(np.abs(fr[k][1].astype(np.int16) - fr[k - 1][1].astype(np.int16)).mean()) for k in range(1, len(fr))])
        ref = float(np.percentile(dens, 75))
        low = np.array([x for _, _, x in fr])
        spans, k = [], 0
        while k < len(low):
            if low[k]:
                j = k
                while j + 1 < len(low) and low[j + 1]:
                    j += 1
                a, b = round(float(ts[k]) - 0.1, 2), round(float(ts[j]) + 0.1, 2)
                # two loading stretches under 0.3 s apart are one: the screen between them would
                # flash for a frame (stay-mobile: Guests list between two skeletons)
                if spans and a - spans[-1][1] < 0.3:
                    spans[-1][1] = b
                else:
                    spans.append([a, b])
                k = j + 1
            else:
                k += 1
        r["loading"] = spans
        for s in r["steps"]:
            if s.get("still") is not None and not force:
                continue
            a, b = s["t"] + 0.35 * (s["end"] - s["t"]), s["end"] - 0.15
            best, score = None, -1
            for k in range(1, len(fr) - 1):
                if not (a <= ts[k] <= b) or low[k]:
                    continue
                calm = diff[k] < 1.0 and diff[k + 1] < 1.0
                # Late and calm beats busy: a step's end state is what its words promise, and the
                # densest frame was often a mid-state ("Checking in...", "Saving...") because
                # success pages are sparse (first pass, 2026-11-20).
                sc = 0.3 * min(1.0, dens[k] / ref) + (0.5 if calm else 0) + 0.6 * (ts[k] - a) / max(0.1, b - a)
                if sc > score:
                    best, score = float(ts[k]), sc
            s["still"] = round(best, 2) if best is not None else None
        # Steps whose stills are the same picture (a long page scrolled to one view): a carousel
        # must never show one screen twice (plan-test, 2026-11-20: overview steps 2 and 3).
        cap = cv2.VideoCapture(str(LIB / name / "clip.mp4"))
        thumbs = {}
        for k, s in enumerate(r["steps"]):
            if s.get("still") is None:
                continue
            cap.set(cv2.CAP_PROP_POS_MSEC, s["still"] * 1000)
            ok, f = cap.read()
            if ok:
                thumbs[k] = cv2.resize(cv2.cvtColor(f, cv2.COLOR_BGR2GRAY), (96, 192) if r["device"] == "mobile" else (192, 108)).astype(np.int16)
        for k, s in enumerate(r["steps"]):
            s.pop("same", None)
            for j in range(k):
                if j in thumbs and k in thumbs and float(np.abs(thumbs[j] - thumbs[k]).mean()) < 3:
                    s["same"] = r["steps"][j].get("same", j)
                    break
        print(f"{name}: {len(spans)} loading stretch(es) {spans}")
    (LIB / "manifest.json").write_text(json.dumps(m, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main("--force" in sys.argv)
