#!/usr/bin/env node
/**
 * Every product screen on every device it can appear on, and every payoff
 * moment, as contact sheets: one look shows the whole scene library.
 *
 *   node studio/ink/gallery.mjs [sw|en]   -> state/frames/ink-gallery-*.jpg
 */
import { chromium } from "playwright";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { composeInk, VARIANTS, MOMENTS } from "./engine.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const lang = process.argv[2] === "en" ? "en" : "sw";
const url = (p) => pathToFileURL(path.resolve(ROOT, p)).href;
const urls = { tex: url("studio/ink/tex"), gsap: url("studio/assets/gsap.min.js"), logo: url("brands/operra/assets/logo-light.png"), fonts: (w) => url(`brands/operra/assets/fonts/inter-latin-${w}-normal.woff2`) };
const brand = { ...JSON.parse(readFileSync(path.join(ROOT, "brands/operra/brand.json"), "utf8")), id: "operra" };
const voice = { duration: 23, speechStart: 0.3, speechEnd: 21.5, pauses: [] };
const out = path.join(ROOT, "state", "frames", "ink-gallery");
mkdirSync(out, { recursive: true });

const shots = [];
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
async function shoot(brief, sceneIdx, name) {
  const r = composeInk(brief, voice, brand, urls);
  const file = path.join(out, "page.html");
  writeFileSync(file, r.html);
  await p.goto(pathToFileURL(file).href, { timeout: 120000 });
  const w = r.windows[sceneIdx];
  await p.evaluate((t) => window.setFrame(t), w.t1 - 0.4);
  const png = path.join(out, `${name}.png`);
  await p.screenshot({ path: png });
  shots.push(png);
}
const cities = ["Moshi", "Zanzibar", "Mwanza", "Dar es Salaam", "Arusha"];
let n = 0;
for (const [screen, list] of Object.entries(VARIANTS)) for (const device of list) {
  await shoot({ id: `gallery-2026-10-24-${String(8 + (n % 12)).padStart(2, "0")}`, language: lang, cta: "Ona", city: cities[n % 5], scenes: [
    { type: "place", line: "Mwanzo wa hadithi", prop: "bell" },
    { type: "ui-screen", screen, device, line: `${screen} · ${device}` },
    { type: "payoff", line: "Mwisho", moment: "toast" }] }, 1, `s-${screen}-${device}`);
  n++;
}
for (const [i, moment] of MOMENTS.entries()) {
  await shoot({ id: `gallery-2026-10-24-${String(8 + i).padStart(2, "0")}`, language: lang, cta: "Ona", city: cities[i % 5], scenes: [
    { type: "place", line: "Mwanzo", prop: "bell" }, { type: "checklist", line: "Katikati", items: ["Moja", "Mbili"] },
    { type: "payoff", line: `payoff · ${moment}`, moment, chip: "Sawa" }] }, 2, `m-${moment}`);
}
await b.close();

// contact sheets, 6 across
const rows = [];
for (let i = 0; i < shots.length; i += 6) rows.push(shots.slice(i, i + 6));
rows.forEach((row, k) => {
  const sheet = path.join(ROOT, "state", "frames", `ink-gallery-${lang}-${k + 1}.jpg`);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...row.flatMap((s) => ["-i", s]),
    "-filter_complex", `${row.map((_, i) => `[${i}:v]scale=360:640[v${i}]`).join(";")};${row.map((_, i) => `[v${i}]`).join("")}hstack=inputs=${row.length}`, "-q:v", "3", sheet]);
  console.log(sheet);
});
