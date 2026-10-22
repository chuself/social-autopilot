#!/usr/bin/env node
// Build the prototype page, synthesise its sound from the page's own cues,
// lay the sound under the untouched voiceover, render the MP4.
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";
import { renderSfx, VOCABULARY } from "../sfx.mjs";
import { renderPage } from "../render.mjs";

const SFX_BUS = 0.6; // effects bus, about -4.4 dB
const dir = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(dir, "out");
execFileSync("node", [path.join(dir, "build.mjs")], { stdio: "inherit" });

const b = await chromium.launch();
const p = await b.newPage();
await p.goto(pathToFileURL(path.join(dir, "page.html")).href);
const { cues, duration } = await p.evaluate(() => ({ cues: window.REEL_CUES, duration: window.REEL_DURATION }));
await b.close();
for (const c of cues) if (!VOCABULARY[c.type]) throw new Error(`cue ${c.type} has no meaning`);
writeFileSync(path.join(out, "cues.json"), JSON.stringify(cues, null, 1));
console.log(`${cues.length} cues: ${cues.map((c) => `${c.t}s ${c.type}`).join(", ")}`);

const sfx = await renderSfx(cues, duration, path.join(out, "sfx.wav"));
// The voice is passed through at unity gain; only the effects are added.
const mix = path.join(out, "mix.m4a");
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", path.join(dir, "media", "voice.mp3"), "-i", sfx,
  "-filter_complex", // A mono voice is copied to both channels at unity: amix's own upmix would
  // quietly lower it by 3 dB, and the voice is the one thing not to touch.
  `[0:a]aresample=44100,pan=stereo|c0=c0|c1=c0,apad[v];[1:a]volume=${SFX_BUS}[s];[v][s]amix=inputs=2:normalize=0:duration=longest[a]`,
  "-map", "[a]", "-t", String(duration), "-c:a", "aac", "-b:a", "192k", mix]);
await renderPage(path.join(dir, "page.html"), mix, path.join(out, "reel.mp4"), { fps: 30 });
