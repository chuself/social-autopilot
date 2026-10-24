#!/usr/bin/env node
/**
 * Studio renderer: a built reel page + its voiceover -> vertical MP4.
 *
 *   node studio/render.mjs <page.html> <voice.mp3|-> <out.mp4> [--fps 30] [--from 0 --to 24]
 *
 * Same discipline as src/video.js: nothing animates on its own. The page builds
 * one paused GSAP timeline and exposes setFrame(t); we seek every frame and
 * screenshot it, so a render is reproducible and matches the audio exactly.
 * Frames are streamed straight into ffmpeg as JPEG, never written to disk.
 */
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SIZE = { width: 1080, height: 1920 };

export async function renderPage(pageFile, audioFile, outFile, { fps = 30, from = 0, to = null } = {}) {
  const browser = await chromium.launch();
  const started = Date.now();
  try {
    const page = await browser.newPage({ viewport: SIZE, deviceScaleFactor: 1 });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(pathToFileURL(path.resolve(pageFile)).href, { waitUntil: "load", timeout: 120000 });
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() =>
      Promise.all([...document.images].map((i) => (i.complete ? i.decode?.().catch(() => {}) : new Promise((r) => (i.onload = i.onerror = r)))))
    );
    if (errors.length) throw new Error(`page error: ${errors[0]}`);
    const duration = await page.evaluate(() => window.REEL_DURATION);
    if (!duration) throw new Error("page did not set window.REEL_DURATION");
    const end = to ?? duration;

    await mkdir(path.dirname(path.resolve(outFile)), { recursive: true });
    const args = ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(fps), "-i", "-"];
    if (audioFile && audioFile !== "-") args.push("-ss", String(from), "-i", audioFile);
    else args.push("-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo");
    args.push(
      "-map", "0:v", "-map", "1:a",
      // Capped: constant camera motion and drifting dust made CRF 19 produce
      // 11.5 MB for 24 s (the plain reels are about 1 MB), and every MP4 is
      // committed to git. Instagram re-encodes anyway; 1.3 Mb/s keeps text crisp (checked).
      "-c:v", "libx264", "-preset", "medium", "-crf", "23", "-maxrate", "1300k", "-bufsize", "2600k",
      "-pix_fmt", "yuv420p", "-r", String(fps),
      "-c:a", "aac", "-b:a", "160k", "-ar", "44100",
      "-t", String(end - from), "-movflags", "+faststart", outFile,
    );
    const ff = spawn("ffmpeg", args, { stdio: ["pipe", "inherit", "inherit"] });
    const done = new Promise((res, rej) => ff.on("close", (c) => (c === 0 ? res() : rej(new Error(`ffmpeg exited ${c}`)))));

    const total = Math.round((end - from) * fps);
    for (let i = 0; i < total; i++) {
      await page.evaluate((t) => window.setFrame(t), from + i / fps);
      const buf = await page.screenshot({ type: "jpeg", quality: 92 });
      if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
    }
    ff.stdin.end();
    await done;
    if (errors.length) throw new Error(`page error during render: ${errors[0]}`);
    console.log(`${outFile}  ${total} frames at ${fps}fps, ${((Date.now() - started) / 1000).toFixed(0)}s wall`);
  } finally {
    await browser.close();
  }
}

/** Single stills, for review: node studio/render.mjs --stills page.html out-dir 1.5 7 12 */
export async function stills(pageFile, outDir, times) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: SIZE, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(path.resolve(pageFile)).href, { waitUntil: "load", timeout: 120000 });
    await page.evaluate(() => document.fonts.ready);
    await mkdir(outDir, { recursive: true });
    for (const t of times) {
      await page.evaluate((x) => window.setFrame(x), t);
      await page.screenshot({ path: path.join(outDir, `t${t.toFixed(2).padStart(6, "0")}.png`) });
    }
  } finally {
    await browser.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  if (argv[0] === "--stills") {
    await stills(argv[1], argv[2], argv.slice(3).map(Number));
  } else {
    const flag = (k, d) => (argv.includes(k) ? Number(argv[argv.indexOf(k) + 1]) : d);
    await renderPage(argv[0], argv[1], argv[2], { fps: flag("--fps", 30), from: flag("--from", 0), to: flag("--to", null) });
  }
}
