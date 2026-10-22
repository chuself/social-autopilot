#!/usr/bin/env node
/**
 * Proves the checker catches every failure it exists for, by feeding it each
 * one on purpose. A clean reel must pass; each mutant must fail on the right
 * check. Run after any change to check.mjs:
 *
 *   node studio/selftest-check.mjs <work-dir-of-a-passing-reel> <its.mp4>
 */
import { mkdirSync, readFileSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { checkReel } from "./check.mjs";

const [dir, video] = process.argv.slice(2);
const meta = JSON.parse(readFileSync(path.join(dir, "reel.json"), "utf8"));
const html = readFileSync(path.join(dir, "page.html"), "utf8");
const ROOT = path.resolve(import.meta.dirname, "..");
let failed = 0;

function mutant(name, { page = html, metaPatch = {} } = {}) {
  const d = path.join(dir, "..", `_mutant-${name}`);
  mkdirSync(d, { recursive: true });
  writeFileSync(path.join(d, "page.html"), page);
  writeFileSync(path.join(d, "reel.json"), JSON.stringify({ ...meta, ...metaPatch }, null, 1));
  return d;
}

async function expect(name, d, vid, check, opts = { images: false }) {
  const r = await checkReel(d, vid, opts);
  const hit = r.problems.filter((p) => !p.warn && p.check === check);
  const ok = check === null ? r.ok : hit.length > 0;
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "MISS"}  ${name.padEnd(28)} ${check === null ? (r.ok ? "passes" : r.problems.map((p) => p.msg).join("; ")) : hit[0]?.msg ?? "not caught"}`);
}

// 0. the clean reel passes (images skipped here; they cost API calls)
await expect("clean reel", dir, video, null);

// 1. a total that is not nights × rate
const T = meta.ledger;
const shown = `${T.currency} ${T.rightTotal.toLocaleString("en-US")}`;
const wrong = `${T.currency} ${(T.rightTotal + T.rightRate).toLocaleString("en-US")}`;
await expect("wrong total on the folio", mutant("sum", { page: html.split(shown).join(wrong) }), video, "numbers");

// 2. a chip pushed into Instagram's button column
await expect("chip off the safe area", mutant("layout", { page: html.replace('class="chip soft" id="s2-chip0" style="left:80px', 'class="chip soft" id="s2-chip0" style="left:700px') }), video, "layout");

// 3. the voice 3 dB down (amix's own mono upmix, the bug this guards)
const quiet = path.join(dir, "..", "_mutant-quiet.mp4");
execFileSync("ffmpeg", ["-y", "-v", "error", "-i", video, "-i", meta.voice, "-map", "0:v", "-map", "1:a", "-af", "volume=-3dB", "-c:v", "copy", "-c:a", "aac", "-shortest", quiet]);
await expect("voice 3 dB quieter", dir, quiet, "voice");

// 4. a black frame in the middle (the light-leak filter bug)
const flash = path.join(dir, "..", "_mutant-flash.mp4");
const f = Math.round(meta.cuts[0] * 30) + 20;
execFileSync("ffmpeg", ["-y", "-v", "error", "-i", video, "-vf", `drawbox=x=0:y=0:w=iw:h=ih:color=black:t=fill:enable='eq(n\\,${f})'`, "-c:a", "copy", flash]);
await expect("one black frame", dir, flash, "flash");

// 5. lettering in a background (yesterday's "HOTEL DAR ES SALAONI")
const lettered = path.join(ROOT, "state", "frames", "preview", "backgrounds", "operra-2026-12-01-16-swahili-tip.png");
if (existsSync(lettered)) {
  const d = mutant("letters", { metaPatch: { imageFiles: [lettered] } });
  await expect("lettering in an image", d, video, "images", { images: true });
} else console.log("skip  lettering (sample image not on this machine)");

console.log(failed ? `\n${failed} failure(s) NOT caught` : "\nevery planted failure was caught");
process.exitCode = failed ? 1 : 0;
