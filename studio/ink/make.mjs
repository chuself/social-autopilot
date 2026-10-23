#!/usr/bin/env node
// Render the ink & wash prototype: its own cues -> synthesised sound, laid
// under the untouched voice at unity, then the frames.
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { renderSfx, VOCABULARY } from "../sfx.mjs";
import { renderPage } from "../render.mjs";

const dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(dir, "..", "..");
const out = path.join(ROOT, "state", "frames", "ink");
execFileSync("node", [path.join(dir, "build.mjs")], { stdio: "inherit" });

const b = await chromium.launch();
const p = await b.newPage();
await p.goto(pathToFileURL(path.join(dir, "page.html")).href);
const { cues, duration } = await p.evaluate(() => ({ cues: window.REEL_CUES, duration: window.REEL_DURATION }));
await b.close();
for (const c of cues) if (!VOCABULARY[c.type]) throw new Error(`cue ${c.type} has no meaning`);

execFileSync("node", ["-e", "require('fs').mkdirSync(process.argv[1],{recursive:true})", out]);
const sfx = await renderSfx(cues, duration, path.join(out, "sfx.wav"));
const voice = path.join(ROOT, "studio", "proto", "media", "voice.mp3");
const mix = path.join(out, "mix.m4a");
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", voice, "-i", sfx,
  "-filter_complex", "[0:a]aresample=44100,pan=stereo|c0=c0|c1=c0,apad[v];[1:a]volume=0.6[s];[v][s]amix=inputs=2:normalize=0:duration=longest[a]",
  "-map", "[a]", "-t", String(duration), "-c:a", "aac", "-b:a", "192k", mix]);
await renderPage(path.join(dir, "page.html"), mix, path.join(out, "ink-wash-arusha.mp4"), { fps: 30 });
console.log(`${cues.length} cues: ${[...new Set(cues.map((c) => c.type))].join(", ")}`);
