"""How much a reel moves, second by second.

Mean absolute difference between frames 0.1 s apart (greyscale, 108x192),
averaged per second. A still second scores ~0; the hand-built prototype
sits around 0.5-1.3 mid-scene. Prints the slowest seconds, so "nothing is
ever still" is a number, not an impression.

    python studio/ink/motion.py reel.mp4 [more.mp4 ...]
"""
import subprocess
import sys

import numpy as np

W, H, FPS = 108, 192, 10


def per_second(video):
    raw = subprocess.run(
        ["ffmpeg", "-loglevel", "error", "-i", video, "-vf", f"fps={FPS},scale={W}:{H},format=gray", "-f", "rawvideo", "-"],
        capture_output=True, check=True,
    ).stdout
    frames = np.frombuffer(raw, np.uint8).reshape(-1, H, W).astype(np.float32)
    d = np.abs(np.diff(frames, axis=0)).mean(axis=(1, 2))
    return [float(d[i:i + FPS].mean()) for i in range(0, len(d), FPS)]


for v in sys.argv[1:]:
    s = per_second(v)
    body = s[1:-3]  # skip the first draw-in second and the end card
    slow = sorted(range(len(body)), key=lambda i: body[i])[:3]
    print(f"{v.split('/')[-1].split(chr(92))[-1]}: mean {np.mean(body):.2f}, min {min(body):.2f} at "
          + ", ".join(f"{i + 1}s={body[i]:.2f}" for i in slow))
