#!/usr/bin/env node
/**
 * Build a reel from a queued post: script -> Swahili voiceover -> vertical MP4.
 *
 *   node src/cli-reel.js                # the next eligible queued post
 *   node src/cli-reel.js <post-id>
 *
 * Publishing is a separate step (cli-publish-reel.js) because, exactly like the
 * posters, the file must be live on a public URL before Instagram can fetch it.
 */
import path from "node:path";
import { createHash } from "node:crypto";
import { writeReelScript } from "./brain.js";
import { speak } from "./audio.js";
import { renderReel, probeVideo } from "./video.js";
import { readQueue, writeQueue, hoursLate, MAX_LATE_HOURS } from "./queue.js";
import { readConfig } from "./config.js";
import { appendFileSync, existsSync, unlinkSync } from "node:fs";
import { uploadMedia } from "./media-store.js";
import { notify } from "./notify.js";

/** Tell the workflow whether there is anything downstream to do. */
function setOutput(built) {
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `built=${built}
`);
  }
}

const ROOT = path.resolve(import.meta.dirname, "..");
// Normalise to null: the workflow passes "" when no id is given, and "" is
// neither null nor undefined, so ?? would keep it and skip the fallback.
const wanted = process.argv[2]?.trim() || null;

const queue = await readQueue();

// Cadence lives in config, not in cron, so it can be changed from Telegram.
// The workflow wakes often; this decides whether a reel is actually owed.
const cfg = await readConfig();
if (!wanted && process.env.IGNORE_CADENCE !== "1" && cfg.reelsPerDay === 0) {
  console.log("No reel slots in the current routine — nothing to do.");
  setOutput(false);
  process.exit(0);
}

/**
 * Worth filming at all?
 *
 * Filming takes a browser, a voiceover and several minutes, and the publisher
 * refuses anything more than MAX_LATE_HOURS past its slot — so a reel filmed
 * after that point can never go out. GitHub fired this cron four hours late and
 * cli-reel dutifully filmed a slot that was already seven hours gone: the work
 * was done, the MP4 was committed, and it went straight to "filmed but
 * unpublished past their slot".
 *
 * The heartbeat already applies this rule before dispatching. The cron did not,
 * because the rule lived in the caller instead of here.
 */
const filmable = (p) =>
  p.status !== "posted" &&
  p.status !== "reject" &&
  p.status !== "missed" &&
  !p.reel &&
  hoursLate(p) <= MAX_LATE_HOURS;

// Prefer a post that is already written and not yet posted — the reel and the
// poster then carry the same idea, and nothing is invented twice.
const post =
  (wanted ? queue.find((p) => p.id === wanted) : null) ??
  // Slots declare their own format now, so the reel job films what was planned
  // as a reel rather than guessing at the next unfilmed post. Earliest slot
  // first, so a late run catches up in order rather than by file position.
  queue
    .filter((p) => p.format === "reel" && filmable(p))
    .sort((a, b) => new Date(a.scheduledFor) - new Date(b.scheduledFor))[0] ??
  queue.find((p) => filmable(p) && !p.format);

if (wanted && !post) {
  console.error(`No post with id "${wanted}" in the queue.`);
  process.exit(1);
}

if (!post) {
  console.log("No eligible post to turn into a reel — nothing to do.");
  setOutput(false);
  process.exit(0);
}

console.log(`Building a reel from: ${post.headline} [${post.language ?? "en"}]`);

const brandId = post.brand ?? "operra";
const videoFile = path.join(ROOT, "public", `${post.id}.mp4`);

// ── The studio is the reel engine (studio/). The plain renderer below runs
// only if the studio could not deliver a reel that passes its checker: a
// plain reel on time beats a missed slot, and the owner is told why.
let studio = null;
let brief = null;
let fallbackWhy = null;
if (cfg.studio !== false && process.env.STUDIO !== "0") {
  try {
    const { writeReelBrief } = await import("../studio/brief.mjs");
    const { produceReel } = await import("../studio/make.mjs");
    brief = await writeReelBrief(post, brandId);
    // A share of reels in the hand-drawn ink & wash style (config "inkShare",
    // 0 to 1; off until the owner approves the look). Fixed per post id, so a
    // re-run of the same reel keeps its style.
    const inkShare = Number(cfg.inkShare ?? 0);
    if (inkShare > 0 && (parseInt(createHash("md5").update(post.id).digest("hex").slice(0, 8), 16) % 1000) / 1000 < inkShare) {
      brief = { ...brief, style: "ink", city: post.city ?? undefined };
    }
    console.log(`  studio brief${brief.style === "ink" ? " (ink)" : ""}: ${brief.scenes.map((s) => s.type).join(" > ")}`);
    const r = await produceReel(brief, { out: videoFile, work: path.join(ROOT, "state", "frames", "studio", post.id), brandId });
    for (const p of r.report?.problems ?? []) console.log(`  check ${p.warn ? "WARN" : "FAIL"} ${p.check} ${p.scene ?? ""} ${p.msg}`);
    if (r.ok) {
      studio = {
        narration: brief.narration,
        beats: brief.scenes.map((s) => s.line),
        scenes: brief.scenes.map((s) => (s.screen ? `${s.type}:${s.screen}` : s.type)),
        attempts: (r.report.attempt ?? 0) + 1,
        warnings: r.report.problems.filter((p) => p.warn).map((p) => `${p.check}: ${p.msg}`).slice(0, 5),
        hasVoice: Boolean(r.meta?.voice),
      };
    } else {
      fallbackWhy = `checker: ${r.report.problems.filter((p) => !p.warn).slice(0, 3).map((p) => `${p.check} ${p.msg}`).join("; ")}`;
    }
  } catch (e) {
    fallbackWhy = String(e.message).slice(0, 300);
  }
  if (fallbackWhy) console.warn(`  studio could not deliver (${fallbackWhy}) — using the plain renderer`);
}

let script = null;
let audio = null;
if (!studio) {
  // Reuse what the studio already paid for: its brief's words and its voice.
  script = brief
    ? { beats: brief.scenes.map((s) => s.line).slice(0, 4), narration: brief.narration }
    : await writeReelScript(post, brandId);
  console.log(`  beats: ${script.beats.map((b) => `"${b}"`).join(" · ")}`);
  console.log(`  narration: ${script.narration}`);

  const studioVoice = path.join(ROOT, "state", "frames", "studio", post.id, "voice.mp3");
  const audioFile = path.join(ROOT, "state", "audio", `${post.id}.mp3`);
  audio = brief && existsSync(studioVoice) ? studioVoice : await speak(script.narration, post.language ?? "en", audioFile);

  await renderReel(
    {
      ...post,
      beats: script.beats,
      cta: post.cta ?? (post.language === "sw" ? "Tuongee" : "Talk to us"),
    },
    brandId,
    audio,
    videoFile
  );
  if (fallbackWhy) {
    try {
      await notify(`Reel for ${post.id} went out with the plain renderer, not the studio.\nWhy: ${fallbackWhy}`);
    } catch {
      // an alert that cannot be sent must not cost the reel
    }
  }
}

const probe = await probeVideo(videoFile);
const v = (probe.streams ?? []).find((s) => s.width);
const sizeMb = (Number(probe.format?.size ?? 0) / 1e6).toFixed(1);
console.log(`  ${videoFile.split(path.sep).pop()} — ${v?.width}x${v?.height}, ${Number(probe.format?.duration).toFixed(1)}s, ${sizeMb} MB`);

// Instagram rejects anything outside these bounds; fail here, not at upload.
const problems = [];
if (v?.width !== 1080 || v?.height !== 1920) problems.push(`wrong size ${v?.width}x${v?.height}`);
if (Number(probe.format?.duration) < 3) problems.push("shorter than 3s");
if (Number(probe.format?.duration) > 90) problems.push("longer than 90s");
if (Number(probe.format?.size) > 300e6) problems.push("larger than 300MB");
if (problems.length) throw new Error(`Reel rejected before upload: ${problems.join(", ")}`);

// The MP4 goes to the media bucket, not into git. If that fails the file stays
// in public/ and ships through Pages exactly as before.
const url = await uploadMedia(videoFile, `reels/${post.id}.mp4`, "video/mp4");
if (url) {
  unlinkSync(videoFile);
  console.log(`  stored outside git: ${url}`);
}

post.reel = {
  file: `${post.id}.mp4`,
  ...(url ? { url } : {}),
  beats: studio ? studio.beats : script.beats,
  narration: studio ? studio.narration : script.narration,
  hasVoice: studio ? studio.hasVoice : Boolean(audio),
  engine: studio ? (brief?.style === "ink" ? "studio-ink" : "studio") : "classic",
  ...(studio ? { scenes: studio.scenes, attempts: studio.attempts, warnings: studio.warnings } : {}),
  ...(fallbackWhy ? { fallback: fallbackWhy } : {}),
  builtAt: new Date().toISOString(),
  status: "ready",
};
await writeQueue(queue);
setOutput(true);
console.log(`\nReel ready. Marked on ${post.id}.`);
