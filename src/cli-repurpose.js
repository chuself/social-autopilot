#!/usr/bin/env node
/**
 * Re-run a post that actually worked.
 *
 * A proven angle re-told beats a new mediocre one, and the audience has long
 * since scrolled past. Only considers posts older than REPURPOSE_MIN_AGE_DAYS
 * so nobody sees the same idea twice in a fortnight.
 *
 *   node src/cli-repurpose.js            # suggest one
 *   node src/cli-repurpose.js --plan     # write it into the queue for tomorrow
 */
import path from "node:path";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { readQueue, writeQueue } from "./queue.js";
import { writePost } from "./brain.js";
import { generateBackground } from "./background.js";
import { renderPoster } from "./render.js";

const ROOT = path.resolve(import.meta.dirname, "..");
const MIN_AGE = Number(process.env.REPURPOSE_MIN_AGE_DAYS ?? 30);

const topPath = path.join(ROOT, "state", "top-performers.json");
if (!existsSync(topPath)) {
  console.log("No performance data yet — nothing to repurpose.");
  process.exit(0);
}

const top = JSON.parse(await readFile(topPath, "utf8"));
const queue = await readQueue();
const cutoff = Date.now() - MIN_AGE * 86400_000;

const candidate = top.find((t) => {
  const original = queue.find((q) => q.id === t.id);
  if (!original?.postedAt) return false;
  if (new Date(original.postedAt).getTime() > cutoff) return false;
  return !queue.some((q) => q.repurposedFrom === t.id);
});

if (!candidate) {
  console.log(`Nothing worth repurposing yet (needs a winner older than ${MIN_AGE} days).`);
  process.exit(0);
}

console.log(`Best candidate: [${candidate.pillar}] ${candidate.headline}`);
console.log(`  engagement: ${candidate.engagement}`);

if (!process.argv.includes("--plan")) process.exit(0);

const original = queue.find((q) => q.id === candidate.id);
const post = await writePost({
  brandId: original.brand ?? "operra",
  pillar: candidate.pillar,
  recent: [],
  language: original.language,
  note:
    `This angle worked before — tell it again, freshly. Do NOT reuse the wording.\n` +
    `Original headline: "${candidate.headline}"\nOriginal body: "${original.body ?? ""}"`,
});

const when = new Date();
when.setDate(when.getDate() + 1);
when.setUTCHours(6, 0, 0, 0);
const id = `${post.brand}-${when.toISOString().slice(0, 10)}-repost-${candidate.pillar}`;

const bg = post.imagePrompt
  ? await generateBackground(post.imagePrompt, path.join(ROOT, "state", "bg", `${id}.png`))
  : null;

const record = {
  id,
  ...post,
  backgroundPath: bg ? path.relative(ROOT, bg).split(path.sep).join("/") : null,
  format: "poster",
  platforms: ["facebook", "instagram"],
  scheduledFor: when.toISOString(),
  createdAt: new Date().toISOString(),
  status: "pending",
  repurposedFrom: candidate.id,
};

await renderPoster(record, post.brand, path.join(ROOT, "public", `${id}.png`));
await writeQueue([...queue, record]);
console.log(`\nQueued as ${id} — "${post.headline}"`);
