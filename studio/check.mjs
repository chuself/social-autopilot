/**
 * The checker. Every check is a failure that actually happened while this tool
 * was being built, turned into a rule a reel must pass before it can be posted.
 *
 *   numbers   a figure on screen that the ledger did not compute, or an
 *             "A × B" whose total in the same card is not A × B
 *   layout    text outside Instagram's safe area, cut off, or on top of a card
 *   contrast  a caption colour against the pixels actually behind it
 *   flash     a frame that dips dark against both neighbours (the light-leak
 *             black frame) and any stretch where nothing moves
 *   voice     the voice quieter or louder than Alice made it (the 3 dB upmix)
 *   sound     a whoosh not on a cut, a cue with no meaning, a pile-up
 *   images    lettering, a face to camera or a distortion in a MOSS image
 *
 * Each problem says how it can be fixed: "reimage" (draw that scene's image
 * again with a new seed) or "none" (deterministic: retrying cannot help, so
 * the caller falls back to Alice's plain reel). The checker never posts and
 * never blocks: it only reports.
 */
import { chromium } from "playwright";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { VOCABULARY } from "./sfx.mjs";

const run = promisify(execFile);
const SAFE = { left: 40, right: 1040, top: 60, bottom: 1640, lowerRight: 950, lowerFrom: 1180 };

/** Relative luminance of a #rrggbb / rgb() colour. */
function lum(css) {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(css);
  const [r, g, b] = (m ? m.slice(1).map(Number) : [255, 255, 255]).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Luminance (0..1, linear) of the brightest 10% of a PNG region, via ffmpeg. */
async function brightLum(png) {
  const { stdout } = await new Promise((resolve, reject) => {
    const p = execFile("ffmpeg", ["-v", "error", "-f", "png_pipe", "-i", "-", "-vf", "format=gray", "-f", "rawvideo", "-"], { encoding: "buffer", maxBuffer: 1 << 26 }, (e, out) => (e ? reject(e) : resolve({ stdout: out })));
    p.stdin.end(png);
  });
  const v = Array.from(stdout).sort((a, b) => a - b);
  const p90 = v[Math.floor(v.length * 0.9)] / 255;
  return p90 <= 0.03928 ? p90 / 12.92 : ((p90 + 0.055) / 1.055) ** 2.4;
}

const digitsIn = (s) => (String(s).match(/\d[\d,]*(?:\.\d+)?%?/g) ?? []).map((x) => x.replace(/,$/, ""));

async function checkPage(pageFile, meta, problems) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
    await page.goto(pathToFileURL(pageFile).href, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    const allowedDigits = new Set(meta.allowed.flatMap(digitsIn));

    for (const w of meta.windows) {
      const t = +(w.t1 - 0.6).toFixed(2); // every entrance done, the exit not yet started
      await page.evaluate((x) => window.setFrame(x), t);
      const found = await page.evaluate(({ id, SAFE }) => {
        const vis = (el) => {
          for (let e = el; e && e !== document.body; e = e.parentElement) {
            const cs = getComputedStyle(e);
            if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) < 0.5) return false;
          }
          return true;
        };
        const scene = document.getElementById(id);
        const out = { texts: [], boxes: [], overflow: [], sums: [], caption: null };
        const box = (el) => { const r = el.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom }; };
        scene.querySelectorAll("*").forEach((el) => {
          const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join("").trim();
          if (own && vis(el)) out.texts.push({ text: own, cls: el.className?.baseVal ?? el.className });
        });
        for (const sel of [".cap", ".chip", ".paper", ".fcard", ".win", ".phone", ".place"]) {
          scene.querySelectorAll(sel).forEach((el) => {
            if (!vis(el)) return;
            // a caption is as wide as its words, not its container
            const words = el.matches(".cap") ? [...el.querySelectorAll(".wi")].map(box) : null;
            const b = words?.length ? { l: Math.min(...words.map((w) => w.l)), r: Math.max(...words.map((w) => w.r)), t: Math.min(...words.map((w) => w.t)), b: Math.max(...words.map((w) => w.b)) } : box(el);
            out.boxes.push({ sel, id: el.id, ...b });
            if (el.scrollWidth > el.clientWidth + 2 && !el.matches(".win,.phone")) out.overflow.push(el.id || sel);
          });
        }
        // "3 × TSh 150,000" must equal a total shown in the same card
        scene.querySelectorAll(".fcard,.paper").forEach((card) => {
          if (!vis(card)) return;
          const txt = [...card.querySelectorAll("*")].filter((e) => vis(e) && [...e.childNodes].some((n) => n.nodeType === 3)).map((e) => e.textContent.trim());
          for (const s of txt) {
            const m = /^(\d+)\s*×\s*([A-Za-z]+)\s*([\d,]+)$/.exec(s);
            if (m) out.sums.push({ n: +m[1], cur: m[2], rate: +m[3].replace(/,/g, ""), rest: txt.join(" | ") });
          }
        });
        const cap = scene.querySelector(".cap");
        if (cap && vis(cap)) {
          const colours = [...cap.querySelectorAll(".wi")].map((x) => getComputedStyle(x).color);
          out.caption = { ...box(cap), colours, size: parseFloat(getComputedStyle(cap).fontSize) };
        }
        return out;
      }, { id: w.id, SAFE });

      // numbers
      for (const { text } of found.texts) {
        for (const d of digitsIn(text)) {
          if (!allowedDigits.has(d)) problems.push({ check: "numbers", scene: w.id, fix: "none", msg: `"${text}" shows ${d}, which the ledger did not compute` });
        }
      }
      for (const s of found.sums) {
        const total = (s.n * s.rate).toLocaleString("en-US");
        if (!s.rest.includes(`${s.cur} ${total}`)) problems.push({ check: "numbers", scene: w.id, fix: "none", msg: `${s.n} × ${s.cur} ${s.rate} should show ${s.cur} ${total} in the same card` });
      }
      // layout
      for (const b of found.boxes) {
        const out = b.l < SAFE.left || b.r > SAFE.right || b.t < SAFE.top || b.b > SAFE.bottom || (b.b > SAFE.lowerFrom && b.r > SAFE.lowerRight && b.sel !== ".paper");
        if (out) problems.push({ check: "layout", scene: w.id, fix: "none", msg: `${b.id || b.sel} sits outside the safe area (${Math.round(b.l)},${Math.round(b.t)} → ${Math.round(b.r)},${Math.round(b.b)})` });
      }
      for (const id of found.overflow) problems.push({ check: "layout", scene: w.id, fix: "none", msg: `${id} is cut off` });
      const cap = found.boxes.find((b) => b.sel === ".cap");
      for (const b of found.boxes) {
        if (!cap || b === cap || b.sel === ".place") continue;
        const hit = b.l < cap.r && b.r > cap.l && b.t < cap.b && b.b > cap.t;
        if (hit) problems.push({ check: "layout", scene: w.id, fix: "none", msg: `the caption overlaps ${b.id || b.sel}` });
      }
      // contrast: the caption's dimmest colour against the brightest pixels behind it
      if (found.caption) {
        const c = found.caption;
        await page.evaluate((id) => (document.querySelector(`#${id} .cap`).style.visibility = "hidden"), w.id);
        const png = await page.screenshot({ clip: { x: Math.max(0, c.l), y: Math.max(0, c.t), width: Math.min(1080, c.r) - Math.max(0, c.l), height: c.b - c.t } });
        await page.evaluate((id) => (document.querySelector(`#${id} .cap`).style.visibility = ""), w.id);
        const bg = await brightLum(png);
        const text = Math.min(...c.colours.map(lum));
        const ratio = (Math.max(text, bg) + 0.05) / (Math.min(text, bg) + 0.05);
        const need = c.size >= 24 ? 3 : 4.5; // large text
        if (ratio < need) problems.push({ check: "contrast", scene: w.id, fix: "reimage", msg: `caption contrast ${ratio.toFixed(1)}:1 against its background (needs ${need}:1)` });
      }
    }
  } finally {
    await browser.close();
  }
}

/** Per-frame brightness: a 1-3 frame dip is a flash; a long flat run is a freeze. */
async function checkVideo(videoFile, meta, problems) {
  const { stderr } = await run("ffmpeg", ["-hide_banner", "-i", videoFile, "-vf", "signalstats,metadata=print:key=lavfi.signalstats.YAVG", "-an", "-f", "null", "-"], { maxBuffer: 1 << 26 });
  // Measured above video black (16), so a black frame inside a dark scene,
  // a dip of only a few levels, still counts. A fade falls steadily; a flash
  // drops and comes straight back, below both neighbours.
  const y = [...stderr.matchAll(/YAVG=([\d.]+)/g)].map((m) => Math.max(0, Number(m[1]) - 16));
  for (let i = 2; i < y.length - 2; i++) {
    const around = Math.min(y[i - 2], y[i + 2]);
    if (around > 2 && y[i] < around * 0.5 && around - y[i] > 2 && y[i] < y[i - 1] && y[i] < y[i + 1]) {
      problems.push({ check: "flash", fix: "none", msg: `frame ${i} (${(i / 30).toFixed(2)}s) dips to ${y[i].toFixed(0)} between ${y[i - 2].toFixed(0)} and ${y[i + 2].toFixed(0)}` });
      i += 3;
    }
  }
  const { stderr: fz } = await run("ffmpeg", ["-hide_banner", "-i", videoFile, "-vf", "freezedetect=n=0.002:d=1.4", "-an", "-f", "null", "-"], { maxBuffer: 1 << 24 });
  for (const m of fz.matchAll(/freeze_start: ([\d.]+)/g)) {
    if (Number(m[1]) < meta.endAt + 1.2) problems.push({ check: "flash", fix: "none", msg: `nothing moves from ${Number(m[1]).toFixed(2)}s` });
  }
}

async function meanVolume(file, filter = "") {
  const { stderr } = await run("ffmpeg", ["-hide_banner", "-i", file, "-af", `${filter}volumedetect`, "-vn", "-f", "null", "-"], { maxBuffer: 1 << 24 });
  return Number(/mean_volume: (-?[\d.]+)/.exec(stderr)?.[1]);
}

async function checkSound(videoFile, meta, problems) {
  const voice = await meanVolume(meta.voice, `atrim=0:${meta.endAt},`);
  const mixed = await meanVolume(videoFile, `pan=mono|c0=c0,atrim=0:${meta.endAt},`);
  if (Math.abs(mixed - voice) > 0.8) problems.push({ check: "voice", fix: "none", msg: `voice was ${voice} dB, the reel plays ${mixed} dB` });
  for (const c of meta.cues) {
    if (!VOCABULARY[c.type]) problems.push({ check: "sound", fix: "none", msg: `cue "${c.type}" has no meaning` });
    if (c.t < 0 || c.t > meta.duration) problems.push({ check: "sound", fix: "none", msg: `cue ${c.type} at ${c.t}s is outside the reel` });
  }
  const whooshes = meta.cues.filter((c) => c.type === "whoosh").map((c) => c.t);
  for (const cut of meta.cuts) if (!whooshes.some((t) => Math.abs(t - cut) < 0.06)) problems.push({ check: "sound", fix: "none", msg: `the cut at ${cut}s has no whoosh` });
  for (const t of whooshes) if (!meta.cuts.some((cut) => Math.abs(t - cut) < 0.06)) problems.push({ check: "sound", fix: "none", msg: `a whoosh at ${t}s with no cut` });
  const loud = meta.cues.filter((c) => ["stamp", "whoosh", "logo"].includes(c.type));
  for (let i = 1; i < loud.length; i++) if (loud[i].t - loud[i - 1].t < 0.3) problems.push({ check: "sound", fix: "none", msg: `${loud[i - 1].type} and ${loud[i].type} pile up at ${loud[i].t}s` });
}

const IMAGE_PROMPT = `You check a background photo for a video ad. Answer ONLY JSON:
{"lettering": true|false, "what": "the words or marks you can see, or empty",
 "faceToCamera": true|false, "distorted": true|false, "note": "one short sentence"}
lettering: ANY readable or pseudo-readable writing, letters, numbers, logos, signage, labels or
screen text anywhere, however small (not plain textures). faceToCamera: a person's face, large in
frame, looking at the camera. distorted: malformed hands, faces, bodies or objects.`;

async function checkImages(meta, problems) {
  const { describeImage } = await import("../src/llm.js");
  for (const [i, img] of (meta.imageFiles ?? []).entries()) {
    if (!img) continue;
    const v = await describeImage(readFileSync(img), img.endsWith(".png") ? "image/png" : "image/jpeg", IMAGE_PROMPT);
    if (!v) {
      problems.push({ check: "images", scene: `s${i}`, fix: "none", warn: true, msg: "could not be inspected (vision unavailable)" });
      continue;
    }
    if (v.lettering) problems.push({ check: "images", scene: `s${i}`, fix: "reimage", msg: `lettering in the image: ${v.what || "unspecified"}` });
    if (v.faceToCamera) problems.push({ check: "images", scene: `s${i}`, fix: "reimage", msg: "a face looks at the camera" });
    if (v.distorted) problems.push({ check: "images", scene: `s${i}`, fix: "reimage", msg: `distortion: ${v.note}` });
  }
}

/**
 * @returns {{ ok: boolean, problems: object[] }}  ok ignores warnings
 */
export async function checkReel(dir, videoFile, { images = true } = {}) {
  const meta = JSON.parse(readFileSync(path.join(dir, "reel.json"), "utf8"));
  const problems = [];
  await checkPage(path.join(dir, "page.html"), meta, problems);
  await checkVideo(videoFile, meta, problems);
  await checkSound(videoFile, meta, problems);
  if (images) await checkImages(meta, problems);
  return { ok: !problems.some((p) => !p.warn), problems };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const [dir, video] = process.argv.slice(2);
  const r = await checkReel(dir, video, { images: !process.argv.includes("--no-images") });
  for (const p of r.problems) console.log(`${p.warn ? "WARN" : "FAIL"}  ${p.check.padEnd(8)} ${p.scene ?? ""}  ${p.msg}  [fix: ${p.fix}]`);
  console.log(r.ok ? "PASS" : `FAIL (${r.problems.filter((p) => !p.warn).length})`);
  process.exitCode = r.ok ? 0 : 1;
}
