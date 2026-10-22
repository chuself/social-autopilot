#!/usr/bin/env node
/**
 * What Alice's model calls actually cost, from the meter (state/usage/).
 *
 *   node scripts/usage-report.mjs            last 7 days
 *   node scripts/usage-report.mjs --days 1
 *   node scripts/usage-report.mjs --json
 *
 * Prices are Google's published paid-tier rates per 1M tokens (checked
 * 2026-10-22). Google states they DOUBLE on 2027-01-01, so both are shown.
 * Alice runs on the free tier today: these are what the same traffic would
 * cost on a paid key, which is the number that matters for other brands.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const argv = process.argv.slice(2);
const days = Number(argv.includes("--days") ? argv[argv.indexOf("--days") + 1] : 7);

// [input, output] USD per 1M tokens. Thinking tokens bill as output; TTS output is audio.
const PRICE = [
  [/flash-lite.*tts|lite-tts/, [0.5, 6]],
  [/2\.5-flash-preview-tts/, [0.5, 10]],
  [/3\.1-flash-tts/, [1, 20]],
  [/tts/, [0.5, 9]],
  [/3\.5-flash-lite/, [0.3, 2.5]],
  [/flash-lite/, [0.25, 1.5]],
  [/flash/, [0.75, 3.75]],
  [/^openai\/|groq/, [0, 0]], // Groq: free tier, the fallback only
];
const priceOf = (model) => PRICE.find(([re]) => re.test(model))?.[1] ?? [0.75, 3.75];
const cost = (r) => {
  const [pin, pout] = priceOf(r.model);
  return (r.in * pin + (r.out + r.think) * pout) / 1e6;
};

const since = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
const dir = path.join(ROOT, "state", "usage");
const rows = [];
if (existsSync(dir)) {
  for (const day of readdirSync(dir).filter((d) => d >= since).sort()) {
    for (const f of readdirSync(path.join(dir, day))) {
      for (const line of readFileSync(path.join(dir, day, f), "utf8").split("\n")) {
        if (line.trim()) rows.push(JSON.parse(line));
      }
    }
  }
}

function group(key) {
  const m = new Map();
  for (const r of rows) {
    const k = key(r) ?? "—";
    const g = m.get(k) ?? { calls: 0, failed: 0, in: 0, out: 0, think: 0, audio: 0, image: 0, usd: 0 };
    g.calls++;
    if (!r.ok) g.failed++;
    g.in += r.in;
    g.out += r.out;
    g.think += r.think;
    g.audio += r.outAudio ?? 0;
    g.image += r.inImage ?? 0;
    g.usd += cost(r);
    m.set(k, g);
  }
  return [...m.entries()].sort((a, b) => b[1].usd - a[1].usd);
}

const usd = (x) => `$${x.toFixed(4)}`;
const k = (x) => (x >= 1000 ? `${(x / 1000).toFixed(1)}k` : String(x));
function table(title, entries) {
  console.log(`\n${title}`);
  console.log(`  ${"".padEnd(30)} calls  fail     in    out  think  audio    now      2027`);
  for (const [name, g] of entries) {
    console.log(`  ${name.slice(0, 30).padEnd(30)} ${String(g.calls).padStart(5)} ${String(g.failed).padStart(5)} ${k(g.in).padStart(6)} ${k(g.out).padStart(6)} ${k(g.think).padStart(6)} ${k(g.audio).padStart(6)}  ${usd(g.usd)}  ${usd(g.usd * 2)}`);
  }
}

if (argv.includes("--json")) {
  console.log(JSON.stringify({ since, days, byFeature: Object.fromEntries(group((r) => r.feature)), byModel: Object.fromEntries(group((r) => r.model)), byPost: Object.fromEntries(group((r) => r.post)) }, null, 1));
} else {
  const total = rows.reduce((a, r) => a + cost(r), 0);
  const nDays = new Set(rows.map((r) => r.t.slice(0, 10))).size || 1;
  console.log(`Model usage since ${since}: ${rows.length} calls over ${nDays} day(s), ${rows.filter((r) => !r.ok).length} refused or failed`);
  console.log(`Paid-tier equivalent: ${usd(total)} (${usd(total / nDays)}/day, about ${usd((total / nDays) * 30)}/month); from 2027-01-01 double that.`);
  table("By feature", group((r) => r.feature));
  table("By model", group((r) => r.model));
  const posts = group((r) => r.post).filter(([p]) => p !== "—");
  table(`By post (${posts.length} posts; follow-ups such as comment replies are charged to their post)`, posts);
  const errs = group((r) => (r.ok ? null : `${r.model}: ${r.error ?? "failed"}`)).filter(([e]) => e !== "—");
  if (errs.length) table("Refusals and failures", errs);
}
