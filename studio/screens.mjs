/**
 * The real Operra v2 app on screen: the screen library (brands/operra/screens, built by
 * scripts/screens-sync.mjs from the demo hotel's tutorial recordings) turned into what a reel,
 * a carousel or a poster needs.
 *
 *   steps(feature)                      the approved steps that show a feature, phone first
 *   catalogue(features, lang)           the list a writer may choose from, with each step's own words
 *   still(ref, dir, width)              one settled PNG of a step
 *   sequence(ref, dir, {dur, width})    the step as frames, timed to fill `dur` seconds
 *
 * A ref is "<recording>#<step>" or "<recording>#<a>-<b>" for consecutive steps, e.g.
 * "checkin-mobile#3-4". Nothing on screen is drawn or invented: every pixel is the recording.
 * Loading stretches (skeletons, "Authenticating...") are cut: the last real frame holds.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const LIB = path.join(ROOT, "brands", "operra", "screens");
let cache = null;

export function library() {
  if (!cache) cache = existsSync(path.join(LIB, "manifest.json")) ? JSON.parse(readFileSync(path.join(LIB, "manifest.json"), "utf8")).recordings : {};
  return cache;
}

export function parseRef(ref) {
  const m = /^([a-z-]+-(?:mobile|desktop))#(\d+)(?:-(\d+))?$/.exec(String(ref ?? "").trim());
  if (!m) throw new Error(`screen "${ref}": expected <recording>#<step> or #<a>-<b>, e.g. checkin-mobile#3`);
  const rec = library()[m[1]];
  if (!rec) throw new Error(`screen "${ref}": no recording ${m[1]} in the library`);
  const a = Number(m[2]), b = m[3] === undefined ? a : Number(m[3]);
  if (b < a || b >= rec.steps.length) throw new Error(`screen "${ref}": ${m[1]} has steps 0-${rec.steps.length - 1}`);
  for (let k = a; k <= b; k++) if (!rec.steps[k].ok) throw new Error(`screen "${ref}": step ${k} is not approved (${rec.steps[k].note ?? "not reviewed"})`);
  return { name: m[1], rec, a, b, steps: rec.steps.slice(a, b + 1) };
}

/** Approved steps showing a feature; phone recordings first (they fill a vertical frame). */
export function steps(feature, { device = null } = {}) {
  const out = [];
  for (const [name, r] of Object.entries(library())) {
    if (feature && !r.features.includes(feature)) continue;
    if (device && r.device !== device) continue;
    r.steps.forEach((s, k) => s.ok && out.push({ ref: `${name}#${k}`, name, page: r.page, device: r.device, k, en: s.en, sw: s.sw }));
  }
  return out.sort((x, y) => (x.device === y.device ? 0 : x.device === "mobile" ? -1 : 1));
}

export const hasFootage = (feature) => steps(feature).length > 0;

/** The writer's menu: phone recordings for these features, step by step, in the post's language. */
export function catalogue(features, lang = "en") {
  const lines = [];
  for (const [name, r] of Object.entries(library())) {
    if (r.device !== "mobile" || (features && !r.features.some((f) => features.includes(f)))) continue;
    lines.push(`${name} (${r.title?.en}):`);
    r.steps.forEach((s, k) => s.ok && lines.push(`  ${name}#${k}  "${captionOf(`${name}#${k}`, lang)}" (${lang === "sw" ? s.sw : s.en})`));
  }
  return lines.join("\n");
}

let caps = null;
/**
 * The words that go with a ref: the director's caption (captions.json) of its LAST step, the
 * state the scene ends on. At most eight words, no figures, nothing the screen does not show.
 */
export function captionOf(ref, lang = "en") {
  const { name, rec, b } = parseRef(ref);
  caps ??= JSON.parse(readFileSync(path.join(LIB, "captions.json"), "utf8"));
  const c = caps[`${name}#${b}`] ?? caps[`${rec.page}#${b}`];
  if (!c?.[lang]) throw new Error(`screen "${ref}": no ${lang} caption in captions.json`);
  return c[lang];
}

/** Every approved step must have both captions: a gap would stop a reel at render time. */
export function verifyCaptions() {
  const missing = [];
  for (const [name, r] of Object.entries(library())) r.steps.forEach((s, k) => {
    if (!s.ok) return;
    for (const lang of ["en", "sw"]) {
      try { captionOf(`${name}#${k}`, lang); } catch { missing.push(`${name}#${k} ${lang}`); }
    }
  });
  return missing;
}

const clip = (name) => path.join(LIB, name, "clip.mp4");
const loadingAt = (rec, t) => (rec.loading ?? []).some(([a, b]) => t >= a && t <= b);

/** One settled still of a ref (its last step's chosen frame). */
export function still(ref, dir, width = 780) {
  const { name, rec, b } = parseRef(ref);
  const s = rec.steps[b];
  mkdirSync(dir, { recursive: true });
  const out = path.join(dir, `${name}-${b}-${width}.png`);
  if (!existsSync(out)) execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", String(s.still), "-i", clip(name), "-frames:v", "1", "-vf", `scale=${width}:-2:flags=lanczos`, out]);
  return out;
}

/**
 * The steps as a frame sequence lasting `dur` seconds. Played at 1x when it fits; a longer
 * stretch plays up to 1.6x, and if it is still too long its start is trimmed so the END state
 * (what the words promise) is always on screen. Shorter than `dur`: the last frame holds.
 * Returns [{t, file}] with t relative to the scene's start; identical neighbours are merged.
 */
export function sequence(ref, dir, { dur, width = 560, fps = 15, lead = 0 } = {}) {
  const { name, rec, a, b } = parseRef(ref);
  let t0 = rec.steps[a].t, t1 = Math.max(rec.steps[b].end, rec.steps[b].still + 0.2);
  t1 = Math.min(t1, rec.duration - 0.05);
  const play = Math.max(0.5, dur - lead);
  let speed = 1, hold = 0;
  // Shorter than the scene: part of the spare time holds the opening screen before the tap, so a
  // line about that screen ("arrivals wait at the top") is seen with it, not with the next page
  // the tap opens (first test reel, 2026-11-20). The rest holds the end state.
  if (t1 - t0 < play) hold = Math.min(1.6, (play - (t1 - t0)) * 0.45);
  if (t1 - t0 > play) {
    speed = Math.min(1.6, (t1 - t0) / play);
    if ((t1 - t0) / speed > play) t0 = t1 - play * speed;
  }
  const out = path.join(dir, `${name}-${a}-${b}-${width}`);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", t0.toFixed(3), "-i", clip(name), "-t", (t1 - t0).toFixed(3),
    "-vf", `fps=${fps},scale=${width}:-2:flags=lanczos`, "-q:v", "2", path.join(out, "%05d.jpg")]);
  const files = readdirSync(out).filter((f) => f.endsWith(".jpg")).sort();
  const frames = [];
  let lastHash = null;
  files.forEach((f, i) => {
    const srcT = t0 + i / fps;
    if (loadingAt(rec, srcT)) return rmSync(path.join(out, f));
    const h = createHash("md5").update(readFileSync(path.join(out, f))).digest("hex");
    if (h === lastHash) return rmSync(path.join(out, f));
    lastHash = h;
    frames.push({ t: +(lead + hold + (srcT - t0) / speed).toFixed(3), file: path.join(out, f) });
  });
  if (!frames.length) throw new Error(`screen "${ref}": every frame is loading`);
  frames[0].t = 0;
  return { frames, speed: +speed.toFixed(2), from: +t0.toFixed(2), to: +t1.toFixed(2), size: rec.size, device: rec.device };
}

/** Words a ref is allowed to stand for: its steps' own lines (the writer's caption must not claim more). */
export function wordsOf(ref, lang = "en") {
  return parseRef(ref).steps.map((s) => (lang === "sw" ? s.sw : s.en)).join(" ");
}
