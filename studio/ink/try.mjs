#!/usr/bin/env node
/**
 * Re-draw golden reels in ink & wash, on their approved voices.
 *
 *   node studio/ink/try.mjs 03 06 07 [--stills] [--check]
 *
 * --stills renders a contact row of frames instead of the video (fast).
 */
import { readFileSync, readdirSync, mkdirSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { makeReel, produceReel } from "../make.mjs";
import { stills } from "../render.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const argv = process.argv.slice(2);
const pickIds = argv.filter((a) => !a.startsWith("--"));
const dirG = path.join(ROOT, "studio", "briefs", "golden");
for (const f of readdirSync(dirG).filter((f) => pickIds.some((p) => f.startsWith(p)))) {
  const g = JSON.parse(readFileSync(path.join(dirG, f), "utf8"));
  const brief = { ...g, id: `${g.id}-ink`, style: "ink" };
  const work = path.join(ROOT, "state", "frames", "studio", brief.id);
  mkdirSync(work, { recursive: true });
  const voice = path.join(ROOT, "state", "frames", "studio", g.id, "voice.mp3");
  const out = path.join(ROOT, "state", "frames", "studio", "ink", `${f.replace(".json", "")}.mp4`);
  mkdirSync(path.dirname(out), { recursive: true });
  if (argv.includes("--stills")) {
    const meta = await makeReel(brief, { out, voice, work, pageOnly: true });
    const times = [...meta.windows.flatMap((w) => [w.t0 + 0.6, (w.t0 + w.t1) / 2, w.t1 - 0.3]), meta.endAt + 1.6];
    const ts = times.map((t) => +t.toFixed(2));
    await stills(meta.page, path.join(work, "stills"), ts);
    const shots = ts.map((t) => path.join(work, "stills", `t${t.toFixed(2).padStart(6, "0")}.png`));
    const row = path.join(ROOT, "state", "frames", "studio", "ink", `${f.replace(".json", "")}-row.jpg`);
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...shots.flatMap((s) => ["-i", s]),
      "-filter_complex", `${shots.map((_, i) => `[${i}:v]scale=270:480[v${i}]`).join(";")};${shots.map((_, i) => `[v${i}]`).join("")}hstack=inputs=${shots.length}`, row]);
    console.log(`${f}: ${JSON.stringify(meta.look)} -> ${row}`);
  } else if (argv.includes("--check")) {
    const r = await produceReel(brief, { out, voice, work });
    for (const p of r.report.problems) console.log(`${p.warn ? "WARN" : "FAIL"}  ${p.check.padEnd(8)} ${p.scene ?? ""}  ${p.msg}`);
    console.log(`${f}: ${r.ok ? "PASS" : "FAIL"} -> ${out}`);
  } else {
    const meta = await makeReel(brief, { out, voice, work });
    console.log(`${f}: ${JSON.stringify(meta.look)} -> ${out}`);
  }
}
