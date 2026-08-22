#!/usr/bin/env node
/**
 * Plan a run of posts: brain writes the copy, a background is generated,
 * the poster is rendered, and each post lands in state/queue.json as `pending`.
 *
 *   MOCK_LLM=1 node src/cli-plan.js            # tomorrow, per state/config.json
 *   node src/cli-plan.js --days 3 --replace
 */
import path from "node:path";
import { writePost, writeCarousel, nextPillar, findUnapprovedFigures, cityForIndex } from "./brain.js";
import { generateBackground } from "./background.js";
import { renderPoster } from "./render.js";
import { readQueue, writeQueue, recentPosts } from "./queue.js";
import { readConfig } from "./config.js";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

const ROOT = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};

const EAT_OFFSET = 3; // Tanzania is UTC+3, no DST
const config = await readConfig();
// Days, not posts. Planning one day at a time means a change you make today is
// live tomorrow — no wasted week to throw away when you change your mind.
const days = Number(arg("days", 1));
const brandId = arg("brand", "operra");
const start = arg("start") ? new Date(arg("start")) : new Date();
// Free-text steering for one run, e.g.
//   --note "push the new POS module, and sound urgent — high season starts next week"
const note = arg("note") ?? process.env.PLAN_NOTE ?? null;
// --hours 8,13 --format carousel  overrides the configured day for one run.
const forcedFormat = arg("format");
const slots = arg("hours")
  ? arg("hours").split(",").map((h) => ({ hour: Number(h), format: forcedFormat ?? "poster" }))
  : forcedFormat
    ? config.slots.map((s) => ({ ...s, format: forcedFormat }))
    : config.slots;

let queue = await readQueue();
// A routine change rebuilds the schedule rather than appending to the old one.
if (args.includes("--replace")) {
  const { unlinkSync, existsSync: exists } = await import("node:fs");
  const dropped = queue.filter((p) => p.status !== "posted");
  for (const p of dropped) {
    for (const f of [path.join(ROOT, "public", `${p.id}.png`), path.join(ROOT, "state", "bg", `${p.id}.png`)]) {
      if (exists(f)) unlinkSync(f);
    }
  }
  queue = queue.filter((p) => p.status === "posted");
  console.log(`--replace: dropped ${dropped.length} unposted row(s)`);
}
const planned = [];

// Written by cli-metrics.js from real engagement; absent on the first run.
const scoresPath = path.join(ROOT, "state", "pillar-scores.json");
const pillarScores = existsSync(scoresPath)
  ? JSON.parse(await readFile(scoresPath, "utf8"))
  : null;

// Build the timetable first, dropping anything already past — planning into the
// past means every one of them fires at once on the next publish run.
const timetable = [];
for (let day = 0; day < days; day++) {
  for (const slot of slots) {
    const when = new Date(start);
    when.setDate(when.getDate() + day);
    when.setUTCHours(slot.hour - EAT_OFFSET, 0, 0, 0);
    if (when > new Date()) timetable.push({ when, hour: slot.hour, format: slot.format });
  }
}
timetable.sort((a, b) => a.when - b.when);

// Never plan a slot that is already filled. Re-running the planner should be
// safe: without this it appends a second post to every slot it has seen before.
// Includes posted slots: a slot that has already been served is spent for that
// day. Excluding them let the planner refill a slot that had already gone out,
// which is how 16:00 ended up with two reels.
const taken = new Set(
  queue.filter((p) => p.status !== "reject").map((p) => p.scheduledFor)
);
const wanted = timetable.filter((t) => !taken.has(t.when.toISOString()));
if (wanted.length < timetable.length) {
  console.log(`${timetable.length - wanted.length} slot(s) already filled — skipping those`);
}
timetable.length = 0;
timetable.push(...wanted);

for (let n = 0; n < timetable.length; n++) {
  const { when, hour, format } = timetable[n];
  // Newest first — nextPillar() and the dedupe list both read position 0 as "last post".
  const recent = [...planned].reverse().concat(await recentPosts());
  const pillar = nextPillar(recent, pillarScores);

  // Rotate the city by total posts written, so it advances across days rather
  // than resetting every run.
  const brandFile = JSON.parse(
    await readFile(path.join(ROOT, "brands", brandId, "brand.json"), "utf8")
  );
  const city = cityForIndex(brandFile, queue.length + planned.length);

  let post;
  try {
    post =
      format === "carousel"
        ? await writeCarousel({ brandId, pillar, recent, note, city })
        : await writePost({ brandId, pillar, recent, note, city });
  } catch (err) {
    console.error(`slot ${n + 1} (${pillar}): brain failed — ${err.message}`);
    continue;
  }

  const scheduledFor = when;

  const id = `${brandId}-${scheduledFor.toISOString().slice(0, 10)}-${String(hour).padStart(2, "0")}-${pillar}`;

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
    // Relative to the repo root: an absolute runner path is meaningless anywhere else.
    backgroundPath: bgPath ? path.relative(ROOT, bgPath).split(path.sep).join("/") : null,
    format,
    platforms: ["facebook", "instagram"],
    scheduledFor: scheduledFor.toISOString(),
    createdAt: new Date().toISOString(),
    status: figures.length ? "needs-review" : "pending",
    heldFigures: figures.length ? figures : undefined,
  };

  if (format === "carousel") {
    // One PNG per slide, numbered in swipe order.
    record.slideFiles = [];
    for (const [i, slide] of (post.slides ?? []).entries()) {
      const file = `${id}-${i + 1}.png`;
      await renderPoster(
        {
          ...record,
          ...slide,
          // Only the last slide asks for anything.
          cta: i === (post.slides.length - 1) ? post.cta ?? record.cta : "",
        },
        brandId,
        path.join(ROOT, "public", file)
      );
      record.slideFiles.push(file);
    }
    record.headline = post.slides?.[0]?.headline ?? post.caption?.slice(0, 50) ?? id;
    console.log(`planned ${id} [carousel ${record.slideFiles.length} slides] [${record.status}] — "${record.headline}"`);
  } else {
    await renderPoster(record, brandId, path.join(ROOT, "public", `${id}.png`));
    console.log(`planned ${id} [${format}] [${record.status}] — "${post.headline}"`);
  }

  planned.push(record);
}

await writeQueue([...queue, ...planned]);
console.log(`\n${planned.length} post(s) queued. Review: state/queue.json`);
