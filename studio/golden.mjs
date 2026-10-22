#!/usr/bin/env node
/**
 * The golden set: the reels the owner approved, rebuilt and re-checked on
 * every change to the studio. If an approved reel stops passing, the change
 * broke something.
 *
 *   node studio/golden.mjs [filter]      -> state/frames/studio/golden/*.mp4 + report.json
 *
 * Every image for every brief is drawn in ONE MOSS batch first: one GPU
 * start-up for the whole set instead of one per reel.
 */
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { produceReel } from "./make.mjs";
import { validateBrief } from "./compose.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const DIR = path.join(ROOT, "studio", "briefs", "golden");
const OUT = path.join(ROOT, "state", "frames", "studio", "golden");
mkdirSync(OUT, { recursive: true });

const filter = process.argv[2] ?? "";
const briefs = readdirSync(DIR)
  .filter((f) => f.endsWith(".json") && f.includes(filter))
  .sort()
  .map((f) => ({ file: f, brief: validateBrief(JSON.parse(readFileSync(path.join(DIR, f), "utf8"))) }));

// 1. every image the set needs, in one batch
const jobs = [];
for (const { brief } of briefs) {
  const work = path.join(ROOT, "state", "frames", "studio", brief.id);
  mkdirSync(work, { recursive: true });
  brief.scenes.forEach((s, i) => {
    if (!s.image || existsSync(path.resolve(ROOT, s.image))) return;
    const file = path.join(work, `s${i}.png`);
    const sidecar = `${file}.prompt.txt`;
    if (existsSync(file) && existsSync(sidecar) && readFileSync(sidecar, "utf8") === s.image) return;
    jobs.push({ prompt: s.image, outFile: file, aspect: "9:16", sidecar });
  });
}
if (jobs.length) {
  console.log(`drawing ${jobs.length} image(s) in one MOSS batch`);
  const { generateBackgrounds } = await import("../src/background.js");
  const done = await generateBackgrounds(jobs, { fallbackProviders: false });
  done.forEach((d, k) => d?.file && writeFileSync(jobs[k].sidecar, jobs[k].prompt));
}

// 2. build and check each reel
const report = [];
for (const { file, brief } of briefs) {
  const out = path.join(OUT, file.replace(/\.json$/, ".mp4"));
  const started = Date.now();
  try {
    const r = await produceReel(brief, { out, reuse: true, voice: brief.voice ? path.resolve(ROOT, brief.voice) : null });
    const row = {
      file, ok: r.ok, attempts: (r.report.attempt ?? 0) + 1, seconds: Math.round((Date.now() - started) / 1000),
      problems: r.report.problems.map((p) => `${p.warn ? "WARN" : "FAIL"} ${p.check} ${p.scene ?? ""} ${p.msg}`),
    };
    report.push(row);
    console.log(`${r.ok ? "PASS" : "FAIL"}  ${file}  (${row.attempts} attempt(s), ${row.seconds}s)`);
    for (const p of row.problems) console.log(`      ${p}`);
  } catch (e) {
    report.push({ file, ok: false, error: e.message });
    console.log(`ERROR ${file}: ${e.message}`);
  }
}
writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 1));
console.log(`\n${report.filter((r) => r.ok).length} of ${report.length} passed`);
