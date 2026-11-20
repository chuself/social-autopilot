#!/usr/bin/env node
/**
 * The real-app screen library: Operra v2's own tutorial recordings, step by step.
 *
 *   node scripts/screens-sync.mjs [--src <tutorials/out>]   copy clips + timelines, refresh the manifest
 *   node scripts/screens-sync.mjs --review                  contact sheets for choosing each step's still
 *
 * Source: operra-migration/infra/tutorials/out/<page>-<device>/{main.mp4,timeline.json}, recorded
 * on the demo hotel (never real guest data). Each step there has an English and a Kiswahili line
 * and exact times, so every clip comes with words that describe only what it shows.
 *
 * Only the clip and the manifest are committed (about 11 MB for all 26). Stills and frame sequences
 * are cut from the clip at render time (studio/screens.mjs). The director's choices per step
 * (`still`: the second inside the step that shows it best; `ok`: fit to post) live in the manifest
 * and survive a re-sync, so remaking a tutorial never loses them; a step whose words changed is
 * reset to unreviewed.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, copyFileSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const LIB = path.join(ROOT, "brands", "operra", "screens");
const MANIFEST = path.join(LIB, "manifest.json");
const argv = process.argv.slice(2);
const SRC = argv.includes("--src") ? argv[argv.indexOf("--src") + 1] : path.resolve(ROOT, "..", "operra-migration", "infra", "tutorials", "out");

// Which Operra features (brands/operra/features.json ids) each recording shows, set by eye.
const FEATURES = {
  today: ["front-desk"],
  checkin: ["front-desk", "guest-stay", "mobile-money"],
  walkin: ["front-desk", "mobile-money"],
  newbooking: ["reservations"],
  reservations: ["reservations"],
  stay: ["guest-stay", "finance"],
  rooms: ["room-operations", "housekeeping"],
  "rooms-setup": ["room-operations"],
  hk: ["housekeeping"],
  counter: ["restaurant-pos", "mobile-money"],
  kds: ["kitchen-display"],
  overview: ["reports", "finance"],
  audit: ["night-audit", "audit-center"],
};

const old = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, "utf8")) : { recordings: {} };

function sync() {
  const meta = JSON.parse(readFileSync(path.join(SRC, "meta.json"), "utf8"));
  const recordings = {};
  for (const name of readdirSync(SRC).sort()) {
    const dir = path.join(SRC, name);
    if (!existsSync(path.join(dir, "timeline.json")) || !existsSync(path.join(dir, "main.mp4"))) continue;
    const tl = JSON.parse(readFileSync(path.join(dir, "timeline.json"), "utf8"));
    const page = tl.key, device = tl.device;
    if (!FEATURES[page]) throw new Error(`${name}: no feature mapping; add it to FEATURES`);
    mkdirSync(path.join(LIB, name), { recursive: true });
    copyFileSync(path.join(dir, "main.mp4"), path.join(LIB, name, "clip.mp4"));
    const probe = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration", "-of", "json", path.join(dir, "main.mp4")]).toString();
    const p = JSON.parse(probe);
    const prev = old.recordings?.[name]?.steps ?? [];
    recordings[name] = {
      page, device,
      size: [p.streams[0].width, p.streams[0].height],
      duration: +Number(p.format.duration).toFixed(2),
      title: { en: meta[page]?.title, sw: meta[page]?.title_sw },
      about: { en: meta[page]?.description, sw: meta[page]?.description_sw },
      features: FEATURES[page],
      steps: tl.steps.map((s, k) => {
        const same = prev[k] && prev[k].en === s.en;
        const taps = tl.taps.filter((x) => x >= s.t - 0.01 && x < s.end).map((x) => +(x - s.t).toFixed(2));
        return {
          en: s.en, sw: s.sw, t: +s.t.toFixed(3), end: +s.end.toFixed(3), taps,
          still: same ? prev[k].still ?? null : null,
          ok: same ? prev[k].ok ?? null : null,
          ...(same && prev[k].note ? { note: prev[k].note } : {}),
        };
      }),
    };
  }
  const out = { source: "operra-migration/infra/tutorials (demo hotel recordings)", syncedAt: new Date().toISOString(), recordings };
  writeFileSync(MANIFEST, JSON.stringify(out, null, 1) + "\n");
  const n = Object.values(recordings).reduce((a, r) => a + r.steps.length, 0);
  const size = Object.keys(recordings).reduce((a, k) => a + statSync(path.join(LIB, k, "clip.mp4")).size, 0);
  console.log(`${Object.keys(recordings).length} recordings, ${n} steps, ${(size / 1e6).toFixed(1)} MB of clips`);
}

/** Five candidate stills per step, one row per step, for choosing `still` by eye. */
function review() {
  const m = JSON.parse(readFileSync(MANIFEST, "utf8"));
  const out = path.join(ROOT, "state", "frames", "screens-review");
  mkdirSync(out, { recursive: true });
  const only = argv.filter((a) => !a.startsWith("--"));
  for (const [name, r] of Object.entries(m.recordings)) {
    if (only.length && !only.some((o) => name.startsWith(o))) continue;
    const clip = path.join(LIB, name, "clip.mp4");
    const w = r.device === "mobile" ? 180 : 320;
    const rows = r.steps.map((s, k) => {
      const len = s.end - s.t;
      const at = [0.15, 0.3, 0.5, 0.75, 0.97].map((f) => Math.min(r.duration - 0.05, s.t + Math.max(0.05, len * f - (f > 0.9 ? 0.25 : 0))));
      return at.map((t, j) => {
        const f = path.join(out, `${name}-s${k}-${j}.jpg`);
        execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", t.toFixed(3), "-i", clip, "-frames:v", "1", "-vf", `scale=${w}:-2,drawtext=text='s${k} ${t.toFixed(2)}':x=4:y=4:fontsize=16:fontcolor=white:box=1:boxcolor=black@0.7`, f]);
        return f;
      });
    });
    const files = rows.flat();
    const sheet = path.join(out, `${name}.jpg`);
    const inputs = files.flatMap((f) => ["-i", f]);
    const cols = 5;
    const layout = files.map((_, i) => `${(i % cols) === 0 ? "0" : Array.from({ length: i % cols }, (_, j) => `w${j}`).join("+")}_${Math.floor(i / cols) === 0 ? "0" : Array.from({ length: Math.floor(i / cols) }, (_, j) => `h${j * cols}`).join("+")}`).join("|");
    execFileSync("ffmpeg", ["-v", "error", "-y", ...inputs, "-filter_complex", `${files.map((_, i) => `[${i}:v]`).join("")}xstack=inputs=${files.length}:layout=${layout}`, "-q:v", "4", sheet]);
    console.log(sheet);
  }
}

/** Every step's chosen still, one row per recording, for the director's pass (mobile and desktop sheets). */
function stills() {
  const m = JSON.parse(readFileSync(MANIFEST, "utf8"));
  const out = path.join(ROOT, "state", "frames", "screens-review");
  mkdirSync(out, { recursive: true });
  for (const device of ["mobile", "desktop"]) {
    const w = device === "mobile" ? 200 : 360, h = device === "mobile" ? 400 : 203;
    const rows = Object.entries(m.recordings).filter(([, r]) => r.device === device);
    const tiles = [];
    for (const [name, r] of rows) {
      for (let k = 0; k < 5; k++) {
        const f = path.join(out, `st-${name}-${k}.png`);
        const s = r.steps[k];
        if (s && s.still != null) {
          const mark = s.ok === false ? "red" : s.ok === true ? "green" : "black";
          execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", String(s.still), "-i", path.join(LIB, name, "clip.mp4"), "-frames:v", "1",
            "-vf", `scale=${w}:${h},drawtext=text='${r.page} s${k}':x=4:y=4:fontsize=15:fontcolor=white:box=1:boxcolor=${mark}@0.8`, f]);
        } else execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", `color=c=gray:s=${w}x${h}`, "-frames:v", "1", f]);
        tiles.push(f);
      }
    }
    const per = 5, half = Math.ceil(rows.length / 2);
    for (const [part, slice] of [[1, tiles.slice(0, half * per)], [2, tiles.slice(half * per)]]) {
      if (!slice.length) continue;
      const layout = slice.map((_, i) => `${i % per ? Array.from({ length: i % per }, (_, j) => `w${j}`).join("+") : "0"}_${Math.floor(i / per) ? Array.from({ length: Math.floor(i / per) }, (_, j) => `h${j * per}`).join("+") : "0"}`).join("|");
      const sheet = path.join(out, `stills-${device}-${part}.jpg`);
      execFileSync("ffmpeg", ["-v", "error", "-y", ...slice.flatMap((f) => ["-i", f]), "-filter_complex", `xstack=inputs=${slice.length}:layout=${layout}`, "-q:v", "3", sheet]);
      console.log(sheet);
    }
  }
}

if (argv.includes("--review")) review();
else if (argv.includes("--stills")) stills();
else sync();
