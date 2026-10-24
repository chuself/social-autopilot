#!/usr/bin/env node
/**
 * Layout sweep for the ink engine: every golden brief (and studio/ink/briefs/)
 * drawn with four seeds, every scene sampled three times, every card, chip,
 * tag and screen measured against the Instagram safe area. The camera moves
 * every frame, so one passing render proves little; this proves the range.
 *
 *   node studio/ink/sweep.mjs
 */
import { composeInk, MOMENTS, VARIANTS } from "./engine.mjs";
import { PROP_NAMES } from "./art.mjs";
import { chromium } from "playwright";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";
const ROOT = path.resolve(import.meta.dirname, "..", "..");
const url = (p) => pathToFileURL(path.resolve(ROOT, p)).href;
const urls = { tex: url("studio/ink/tex"), gsap: url("studio/assets/gsap.min.js"), logo: url("brands/operra/assets/logo-light.png"), fonts: (w) => url(`brands/operra/assets/fonts/inter-latin-${w}-normal.woff2`) };
const brand = { ...JSON.parse(readFileSync(`${ROOT}/brands/operra/brand.json`, "utf8")), id: "operra" };
const SAFE = { left: 40, right: 1040, top: 60, bottom: 1640, lowerRight: 950, lowerFrom: 1180 };
const voice = { duration: 23, speechStart: 0.3, speechEnd: 21.5, pauses: [] };
const briefs = readdirSync(`${ROOT}/studio/briefs/golden`).map((f) => JSON.parse(readFileSync(`${ROOT}/studio/briefs/golden/${f}`, "utf8")));
briefs.push(...readdirSync(path.join(import.meta.dirname, "briefs")).map((f) => JSON.parse(readFileSync(path.join(import.meta.dirname, "briefs", f), "utf8"))));
for (const [screen, list] of Object.entries(VARIANTS)) for (const device of list) briefs.push({ id: `dev-${screen}-${device}`, language: "sw", cta: "Ona", city: "Moshi", narration: "x", scenes: [{ type: "place", line: "Mwanzo wa hadithi hii", prop: "bell" }, { type: "ui-screen", screen, device, line: "Skrini ya mfumo inaonyesha hili" }, { type: "payoff", line: "Mwisho mzuri wa hadithi", moment: MOMENTS[(screen.length + device.length) % MOMENTS.length], chip: "Sawa" }] });
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
let bad = 0, n = 0;
for (const g of briefs) for (const k of [0, 1, 2, 3]) {
  const brief = { ...g, style: "ink", seed: `${g.id}#s${k}`, scenes: g.scenes.map(({ image, ...s }, j) => (s.type === "place" ? { ...s, prop: PROP_NAMES[(k + j + g.id.length) % PROP_NAMES.length] } : s.type === "payoff" ? { ...s, moment: MOMENTS[(k + g.id.length) % MOMENTS.length] } : s)) };
  const r = composeInk(brief, voice, brand, urls);
  const file = path.join(ROOT, "state", "frames", "ink-sweep.html"); writeFileSync(file, r.html);
  await p.goto(pathToFileURL(file).href); await p.evaluate(() => document.fonts.ready);
  for (const w of r.windows) for (const t of [w.t0 + 0.8, (w.t0 + w.t1) / 2, w.t1 - 0.3]) {
    n++;
    const out = await p.evaluate(({ id, t, SAFE }) => {
      window.setFrame(t);
      const res = [];
      document.querySelectorAll(`#${id} .chip, #${id} .place, #${id} .fcard, #${id} .kt, #${id} .door, #${id} .ev, #${id} .tb, #${id} .dev, #${id} .own, #${id} .rep, #${id} .desk, #${id} .note, #${id} .invw`).forEach((el) => {
        let op = 1; for (let e = el; e && e !== document.body; e = e.parentElement) op *= +getComputedStyle(e).opacity;
        if (op < 0.5) return;
        const q = el.getBoundingClientRect();
        if (q.left < SAFE.left || q.right > SAFE.right || q.top < SAFE.top || q.bottom > SAFE.bottom || (q.bottom > SAFE.lowerFrom && q.right > SAFE.lowerRight)) res.push(`${el.className || el.id} ${Math.round(q.left)},${Math.round(q.top)}→${Math.round(q.right)},${Math.round(q.bottom)}`);
      });
      return res;
    }, { id: w.id, t, SAFE });
    if (out.length) { bad++; console.log(g.id, k, w.type, t.toFixed(1), out.join(" | ")); }
  }
}
await b.close();
console.log(`${n} frames checked, ${bad} with something outside the safe area`);
process.exit(bad ? 1 : 0);
