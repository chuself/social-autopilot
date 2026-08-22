#!/usr/bin/env node
/**
 * Render every look side by side so a rotation can be judged before it runs.
 *
 * Deliberately reuses ONE existing post's copy for all of them: the point is to
 * isolate the visual variable, and it costs no LLM calls to do so.
 */
import path from "node:path";
import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { renderPoster } from "./render.js";
import { readQueue } from "./queue.js";
import { lookForDate } from "./brain.js";

const run = promisify(execFile);
const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "public", "looks-preview.png");

const brand = JSON.parse(
  await readFile(path.join(ROOT, "brands", "operra", "brand.json"), "utf8")
);
const looks = brand.looks ?? [];
if (!looks.length) {
  console.log("This brand has no looks defined.");
  process.exit(0);
}

const queue = await readQueue();
const sample =
  queue.find((p) => p.status !== "posted" && p.backgroundPath) ??
  queue.find((p) => p.backgroundPath) ??
  queue[queue.length - 1];
if (!sample) {
  console.log("No post to sample.");
  process.exit(0);
}

const today = lookForDate(brand)?.name;
const files = [];
for (const look of looks) {
  const file = path.join(ROOT, "state", "frames", `look-${look.name}.png`);
  await renderPoster({ ...sample, look: look.name }, "operra", file);
  files.push(file);
  console.log(`  ${look.name}${look.name === today ? "  <- today" : ""}`);
}

// Two rows, three across.
const inputs = files.flatMap((f) => ["-i", f]);
const n = files.length;
const half = Math.ceil(n / 2);
const scale = files.map((_, i) => `[${i}:v]scale=330:-1[v${i}]`).join(";");
const top = Array.from({ length: half }, (_, i) => `[v${i}]`).join("");
const bot = Array.from({ length: n - half }, (_, i) => `[v${i + half}]`).join("");
const filter =
  `${scale};${top}hstack=inputs=${half}[top];${bot}hstack=inputs=${n - half}[bot];[top][bot]vstack=inputs=2`;

await run("ffmpeg", ["-v", "error", ...inputs, "-filter_complex", filter, OUT, "-y"]);
console.log(`\ncontact sheet -> ${path.relative(ROOT, OUT)}`);
