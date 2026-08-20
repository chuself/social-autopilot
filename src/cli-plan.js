#!/usr/bin/env node
/**
 * Plan a run of posts: brain writes the copy, a background is generated,
 * the poster is rendered, and each post lands in state/queue.json as `pending`.
 *
 *   MOCK_LLM=1 node src/cli-plan.js --count 3
 *   node src/cli-plan.js --count 7 --start 2026-08-24
 */
import path from "node:path";
import { writePost, nextPillar, findUnapprovedFigures } from "./brain.js";
import { generateBackground } from "./background.js";
import { renderPoster } from "./render.js";
import { readQueue, writeQueue, recentPosts } from "./queue.js";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

const ROOT = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};

const count = Number(arg("count", 7));
const brandId = arg("brand", "operra");
const start = arg("start") ? new Date(arg("start")) : new Date();
// Free-text steering for one run, e.g.
//   --note "push the new POS module, and sound urgent — high season starts next week"
const note = arg("note") ?? process.env.PLAN_NOTE ?? null;
const postHour = Number(process.env.POST_HOUR ?? 9);

const queue = await readQueue();
const planned = [];

// Written by cli-metrics.js from real engagement; absent on the first run.
const scoresPath = path.join(ROOT, "state", "pillar-scores.json");
const pillarScores = existsSync(scoresPath)
  ? JSON.parse(await readFile(scoresPath, "utf8"))
  : null;

for (let day = 0; day < count; day++) {
  // Newest first — nextPillar() and the dedupe list both read position 0 as "last post".
  const recent = [...planned].reverse().concat(await recentPosts());
  const pillar = nextPillar(recent, pillarScores);

  let post;
  try {
    post = await writePost({ brandId, pillar, recent, note });
  } catch (err) {
    console.error(`day ${day + 1} (${pillar}): brain failed — ${err.message}`);
    continue;
  }

  const scheduledFor = new Date(start);
  scheduledFor.setDate(scheduledFor.getDate() + day);
  scheduledFor.setHours(postHour, 0, 0, 0);

  const id = `${brandId}-${scheduledFor.toISOString().slice(0, 10)}-${pillar}`;

  // Held, not dropped: a human decides whether the figure is real.
  const figures = await findUnapprovedFigures(post, brandId);
  if (figures.length) {
    console.warn(`  ${id}: unapproved figures ${figures.join(", ")} — held for review`);
  }

  const bgPath = post.imagePrompt
    ? await generateBackground(post.imagePrompt, path.join(ROOT, "state", "bg", `${id}.png`))
    : null;

  const record = {
    id,
    ...post,
    backgroundPath: bgPath,
    platforms: ["facebook", "instagram"],
    scheduledFor: scheduledFor.toISOString(),
    createdAt: new Date().toISOString(),
    status: figures.length ? "needs-review" : "pending",
    heldFigures: figures.length ? figures : undefined,
  };

  await renderPoster(record, brandId, path.join(ROOT, "public", `${id}.png`));
  console.log(`planned ${id} [${record.status}] — "${post.headline}"`);

  planned.push(record);
}

await writeQueue([...queue, ...planned]);
console.log(`\n${planned.length} post(s) queued. Review: state/queue.json`);
