/**
 * Confirm that everything the queue still needs is actually being served.
 *
 * plan.yml used to loop over public/*.png, echo the HTTP code, and carry on
 * regardless — so a 404 scrolled past in a green build and the poster failed
 * hours later at its slot, where it looked like "nothing was due".
 *
 * Only assets belonging to OPEN posts matter; a 404 on last week's poster is
 * noise. Retries, because a fresh Pages deploy takes a moment to propagate.
 *
 *   node scripts/confirm-live.mjs
 */
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
if (existsSync(path.join(ROOT, ".env"))) {
  try {
    process.loadEnvFile(path.join(ROOT, ".env"));
  } catch {}
}

const base = (process.env.PUBLIC_ASSET_BASE ?? "").replace(/\/$/, "");
if (!base) {
  console.error("PUBLIC_ASSET_BASE is not set");
  process.exit(1);
}

const queue = JSON.parse(await readFile(path.join(ROOT, "state", "queue.json"), "utf8"));
const open = queue.filter(
  (p) => p.status !== "posted" && p.status !== "reject" && p.status !== "missed"
);

const wanted = new Set();
for (const p of open) {
  if (p.format === "carousel" && p.slideFiles?.length) p.slideFiles.forEach((f) => wanted.add(f));
  else if (p.format === "reel") {
    if (p.reel?.file) wanted.add(p.reel.file);
  } else wanted.add(`${p.id}.png`);
}

if (!wanted.size) {
  console.log("no open posts — nothing to confirm");
  process.exit(0);
}

const ATTEMPTS = Number(process.env.CONFIRM_ATTEMPTS ?? 10);
const missing = [];

for (const file of wanted) {
  const url = `${base}/${file}`;
  let ok = false;
  for (let i = 1; i <= ATTEMPTS; i++) {
    try {
      const r = await fetch(url, { method: "HEAD" });
      if (r.ok) {
        ok = true;
        console.log(`  200  ${file}`);
        break;
      }
      if (i === ATTEMPTS) console.log(`  ${r.status}  ${file}`);
    } catch (err) {
      if (i === ATTEMPTS) console.log(`  ERR  ${file} (${err.message})`);
    }
    await new Promise((r) => setTimeout(r, 6000));
  }
  if (!ok) missing.push(file);
}

if (!missing.length) {
  console.log(`\nall ${wanted.size} asset(s) for open posts are live`);
  process.exit(0);
}

console.log(`::error::${missing.length} asset(s) are committed but not being served`);
const { notify } = await import("../src/notify.js");
await notify(
  `🌐 <b>${missing.length} asset(s) not live</b>\nThese belong to posts still due, so those slots will pass with nothing published:\n\n` +
    missing.map((f) => `• ${f}`).join("\n") +
    `\n\nUsually a Pages deploy that raced and lost. Re-run the <b>pages</b> workflow.`
);
process.exit(1);
