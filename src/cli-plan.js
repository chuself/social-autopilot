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
import { readCampaigns, campaignFor } from "./campaigns.js";
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
  const { notify, sendVideo } = await import("./notify.js");
  const dropped = queue.filter((p) => p.status !== "posted");

  // A built reel is minutes of render time, a voiceover, and an MP4 already
  // live on Pages. One --replace threw away a finished Kiswahili reel that had
  // never been posted, deleted nothing but its poster, and said so only in a
  // log line. Hand the video over before destroying the row — the same handoff
  // the TikTok path already uses — so the work survives the schedule change.
  const base = (process.env.PUBLIC_ASSET_BASE ?? "").replace(/\/$/, "");
  const builtReels = dropped.filter((p) => p.reel?.file && p.reel.status !== "posted");
  for (const p of builtReels) {
    if (!base) break;
    try {
      await sendVideo(
        `${base}/${p.reel.file}`,
        `🎬 <b>Made but never posted</b>\nThe routine changed before this one went out, so it is being dropped from the schedule. Here it is to post by hand if you want it.\n\n${p.headline ?? p.id}`
      );
    } catch (err) {
      console.warn(`  could not hand over ${p.reel.file}: ${err.message}`);
    }
  }

  for (const p of dropped) {
    const files = [
      path.join(ROOT, "public", `${p.id}.png`),
      path.join(ROOT, "state", "bg", `${p.id}.png`),
      // MP4s were never cleaned up, so every discarded reel left an orphan
      // sitting on Pages for good.
      ...(p.reel?.file ? [path.join(ROOT, "public", p.reel.file)] : []),
      ...(p.slideFiles ?? []).map((f) => path.join(ROOT, "public", f)),
    ];
    for (const f of files) if (exists(f)) unlinkSync(f);
  }

  queue = queue.filter((p) => p.status === "posted");
  console.log(`--replace: dropped ${dropped.length} unposted row(s), ${builtReels.length} of them already filmed`);

  // Destroying planned work is worth a sentence to the owner. Silence here is
  // how a whole day's reel disappeared without anyone noticing.
  if (dropped.length) {
    const clip = (s, n) => (String(s).length > n ? `${String(s).slice(0, n - 1)}…` : String(s));
    await notify(
      `🗑 <b>Schedule rebuilt</b> — dropped ${dropped.length}` +
        (builtReels.length ? `, incl. ${builtReels.length} filmed reel(s) sent above` : "") +
        `\n` +
        dropped
          .slice(0, 6)
          .map((p) => `• ${clip(p.headline ?? p.id, 45)}`)
          .join("\n") +
        (dropped.length > 6 ? `\n<i>+${dropped.length - 6} more</i>` : "")
    );
  }
}
const campaigns = await readCampaigns();
// How many of a given day s slots the campaign has already taken. The FIRST
// slots of the day go to it, so it gets the morning rather than the leftovers.
const campaignSlotIndex = new Map();

const planned = [];

// Written by cli-metrics.js from real engagement; absent on the first run.
const scoresPath = path.join(ROOT, "state", "pillar-scores.json");
const pillarScores = existsSync(scoresPath)
  ? JSON.parse(await readFile(scoresPath, "utf8"))
  : null;

// Build the timetable first, dropping anything already past — planning into the
// past means every one of them fires at once on the next publish run.
//
// The daily job runs at 21:00 EAT to plan TOMORROW — but `days` counted from
// today, and by 21:00 every one of today's slots is behind us, so the whole
// timetable filtered away and the evening planner queued nothing. Every night.
// The queue only ever filled up because of ad-hoc replans during the day.
// If the starting day has nothing left in it, roll forward and plan the next.
const timetable = [];
for (let offset = 0; timetable.length === 0 && offset <= 1; offset++) {
  for (let day = 0; day < days; day++) {
    for (const slot of slots) {
      const when = new Date(start);
      when.setDate(when.getDate() + day + offset);
      when.setUTCHours(slot.hour - EAT_OFFSET, 0, 0, 0);
      if (when > new Date()) timetable.push({ when, hour: slot.hour, format: slot.format });
    }
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

  // A campaign is a note handed to the SAME writer for some of the day s
  // slots, not a second pipeline. Rendering, the figure guard, publishing and
  // the reel path are all untouched and cannot regress because of it.
  const dayKey = when.toISOString().slice(0, 10);
  const campaign = campaignFor(campaigns, when);
  const usedToday = campaignSlotIndex.get(dayKey) ?? 0;
  const onCampaign = Boolean(campaign) && usedToday < campaign.slotsPerDay;
  if (onCampaign) campaignSlotIndex.set(dayKey, usedToday + 1);

  const slotNote = onCampaign
    ? [
        note,
        `This post is part of a campaign called "${campaign.name}".`,
        `What it is about: ${campaign.brief}`,
        campaign.cta ? `End with this call to action: ${campaign.cta}` : null,
        `It runs ${campaign.startsOn} to ${campaign.endsOn}, so write it as part of a run`,
        `rather than as a one-off announcement.`,
        `Do NOT invent dates, prices or discounts that are not stated above.`,
      ]
        .filter(Boolean)
        .join(" ")
    : note;

  if (onCampaign) console.log(`  slot ${n + 1} belongs to campaign "${campaign.name}"`);

  let post;
  try {
    post =
      format === "carousel"
        ? await writeCarousel({ brandId, pillar, recent, note: slotNote, city, language: onCampaign ? campaign.language ?? undefined : undefined })
        : await writePost({ brandId, pillar, recent, note: slotNote, city, language: onCampaign ? campaign.language ?? undefined : undefined });
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
    ? await generateBackground(post.imagePrompt, path.join(ROOT, "state", "bg", `${id}.png`), {
        aspect: format === "reel" ? "9:16" : "4:5",
      })
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

  // On the record, not the draft: `record` is what reaches the queue.
  if (onCampaign) {
    record.campaign = campaign.id;
    record.campaignName = campaign.name;
  }
  planned.push(record);
}

await writeQueue([...queue, ...planned]);
console.log(`\n${planned.length} post(s) queued. Review: state/queue.json`);
