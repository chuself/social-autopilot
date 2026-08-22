#!/usr/bin/env node
/**
 * Publish a built reel to Instagram Reels and the Facebook Page.
 *
 * The MP4 must already be live at PUBLIC_ASSET_BASE — both platforms fetch the
 * file server-side, exactly like the posters.
 */
import path from "node:path";
import {
  readQueue, writeQueue, dueReels, hoursLate, noteSkip, clearSkip, MAX_LATE_HOURS,
} from "./queue.js";
import { publishInstagramReel, publishFacebookVideo } from "./publish/reels.js";
import { publishTikTok, tiktokConfigured } from "./publish/tiktok.js";
import { readConfig } from "./config.js";
import { ctaLink } from "./brain.js";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { isPaused, isDryRun } from "./guards.js";
import { notify, sendVideo } from "./notify.js";

const ROOT = path.resolve(import.meta.dirname, "..");
const dryRun = isDryRun();

if (isPaused()) {
  console.log("PAUSED file present — nothing published.");
  process.exit(0);
}

const base = (process.env.PUBLIC_ASSET_BASE ?? "").replace(/\/$/, "");
if (!base) throw new Error("PUBLIC_ASSET_BASE is not set");

const queue = await readQueue();
// Same empty-string trap as cli-reel.js — "" is not null, so ?? would keep it.
const wanted = process.argv[2]?.trim() || null;
const eatOf = (iso) =>
  new Date(new Date(iso).getTime() + 3 * 3600_000).toISOString().slice(11, 16);

// Film ahead, publish on time. Pick the EARLIEST reel whose slot has arrived,
// not merely the first one in the file: taking the first and giving up when it
// was not due yet is what stranded a filmed reel for an entire day.
const ready = queue.filter((p) => p.reel?.status === "ready");
const post = wanted
  ? queue.find((p) => p.id === wanted)
  : process.env.IGNORE_SCHEDULE === "1"
    ? ready[0]
    : dueReels(queue)[0];

if (!post) {
  // Say which of the three "nothing happened" cases this is. All three used to
  // print the same line, so a stuck reel was indistinguishable from no reel.
  if (!ready.length) {
    console.log("No reel is filmed and waiting.");
  } else {
    for (const p of ready) {
      const late = hoursLate(p);
      const reason =
        late < 0
          ? `filmed, waiting for its ${eatOf(p.scheduledFor)} EAT slot`
          : `filmed but past the ${MAX_LATE_HOURS}h lateness cutoff`;
      console.log(`  ${p.id}: ${reason}`);
      noteSkip(p, reason);
    }
    console.log(`${ready.length} reel(s) filmed, none due right now.`);
    if (!dryRun) await writeQueue(queue);
  }
  process.exit(0);
}

console.log(`Slot ${eatOf(post.scheduledFor)} EAT selected out of ${ready.length} filmed reel(s).`);

const videoUrl = `${base}/${post.reel.file}`;
console.log(`Publishing reel: ${post.headline}`);
console.log(`  ${videoUrl}`);

// Both platforms fetch the file themselves — if it is not live, stop here
// rather than letting the platform fail opaquely minutes later.
if (!dryRun) {
  const head = await fetch(videoUrl, { method: "HEAD" });
  const type = head.headers.get("content-type") ?? "";
  if (!head.ok || !type.startsWith("video/")) {
    throw new Error(`Reel not reachable as video (${head.status}, ${type}): ${videoUrl}`);
  }
  console.log(`  reachable: ${head.status} ${type}`);
}

const brand = JSON.parse(
  await readFile(path.join(ROOT, "brands", post.brand ?? "operra", "brand.json"), "utf8")
);
const caption = [post.caption, ctaLink(brand, post.id), (post.hashtags ?? []).join(" ")]
  .filter(Boolean)
  .join("\n\n");

// Same receipt check as the posters: if the commit recording a post was lost to
// a race, the queue still says pending and the next run would post it twice.
const priorHistory = existsSync(path.join(ROOT, "state", "history.json"))
  ? JSON.parse(await readFile(path.join(ROOT, "state", "history.json"), "utf8"))
  : [];
const alreadyPosted = (platform) =>
  priorHistory.some((h) => h.id === post.id && h.platform === platform && h.postId !== "dry-run");

const results = [];
for (const [name, fn] of [
  ["instagram", publishInstagramReel],
  ["facebook", publishFacebookVideo],
]) {
  if (alreadyPosted(name)) {
    console.log(`  skip ${name}: already in history`);
    continue;
  }
  try {
    const r = await fn({ videoUrl, caption, dryRun });
    console.log(`  posted to ${name}: ${r.postId}`);
    results.push({ ...r, id: post.id, format: "reel", postedAt: new Date().toISOString() });
  } catch (err) {
    // One platform failing must never stop the other.
    console.error(`  FAILED ${name}: ${err.message}`);
  }
}

if (!dryRun && !results.length) {
  noteSkip(post, "both platforms refused the reel — see the reel job log");
  await writeQueue(queue);
}

if (!dryRun && results.length) {
  clearSkip(post);
  post.reel.status = "posted";
  // Close the slot so nothing else picks it up.
  if (post.format === "reel") post.status = "posted";
  post.reel.postedAt = new Date().toISOString();
  post.reel.postIds = results.map((r) => `${r.platform}:${r.postId}`);
  await writeQueue(queue);

  const historyPath = path.join(ROOT, "state", "history.json");
  const history = existsSync(historyPath)
    ? JSON.parse(await readFile(historyPath, "utf8"))
    : [];
  history.push(...results);
  await writeFile(historyPath, JSON.stringify(history.slice(-200), null, 2));

  // Platform post ids are for the log, not for a phone.
  await notify(
    `🎬 <b>Reel posted</b> — ${results.map((r) => r.platform).join(" + ")}\n${post.headline}`
  );
}

// TikTok goes through Metricool, which is already TikTok-audited, so the post is
// public without an audit of our own. Runs after the Meta legs so a TikTok
// problem can never cost us Instagram and Facebook.
// TikTok is rationed and Kiswahili gets first claim on the day's slot.
const cfg = await readConfig();
const tiktokDecision = await decideTikTok(post, cfg, queue);
if (!dryRun && tiktokConfigured() && tiktokDecision.go) {
  try {
    const r = await publishTikTok({ videoUrl, caption, dryRun });
    console.log(`  queued on tiktok for ${r.scheduledFor}`);
    await notify(`📱 <b>TikTok</b> queued for ${r.scheduledFor}\n${post.headline}`, { mirror: false });

    const historyPath = path.join(ROOT, "state", "history.json");
    const history = existsSync(historyPath)
      ? JSON.parse(await readFile(historyPath, "utf8"))
      : [];
    history.push({ ...r, id: post.id, format: "reel", postedAt: new Date().toISOString() });
    await writeFile(historyPath, JSON.stringify(history.slice(-200), null, 2));
  } catch (err) {
    console.error(`  TikTok failed: ${err.message}`);
    await notify(
      `⚠️ TikTok scheduling failed — the video is below to post by hand.\n<code>${err.message.slice(0, 200)}</code>`
    );
  }
} else if (!dryRun) {
  console.log(`  tiktok skipped — ${tiktokDecision.reason ?? "not configured"}`);
}

/**
 * One TikTok a day, and a Kiswahili reel outranks an English one for it.
 * Metricool's free allowance is 20 posts a month, so the daily cap is what keeps
 * TikTok alive to month end; the language rule is editorial — the audience is
 * Tanzanian and TikTok is where a cold account can still reach them.
 */
async function decideTikTok(post, cfg, queue) {
  const limit = cfg.tiktokPerDay ?? 1;
  if (limit === 0) return { go: false, reason: "tiktok is switched off" };

  const today = new Date().toISOString().slice(0, 10);
  const historyPath = path.join(ROOT, "state", "history.json");
  const history = existsSync(historyPath)
    ? JSON.parse(await readFile(historyPath, "utf8"))
    : [];
  const usedToday = history.filter(
    (h) => String(h.platform).includes("tiktok") && String(h.postedAt).slice(0, 10) === today
  ).length;

  if (usedToday >= limit) {
    return { go: false, reason: `already ${usedToday} TikTok post(s) today (limit ${limit})` };
  }

  // If this reel is English and a Kiswahili reel is still to come today, save
  // the slot for it rather than spending it on the weaker fit.
  if (post.language !== "sw") {
    const swahiliLater = queue.some(
      (p) =>
        p.format === "reel" &&
        p.language === "sw" &&
        p.status !== "posted" &&
        p.status !== "reject" &&
        String(p.scheduledFor).slice(0, 10) === today
    );
    if (swahiliLater) {
      return { go: false, reason: "holding today's TikTok slot for a Kiswahili reel" };
    }
  }
  return { go: true };
}

// Belt and braces: the finished file also comes to you ready to upload, so a
// TikTok failure or the monthly cap never blocks the content.
if (!dryRun && process.env.TIKTOK_HANDOFF !== "0") {
  const tags = (post.hashtags ?? []).join(" ");
  await sendVideo(
    videoUrl,
    `📱 <b>For TikTok</b> — tap and upload\n\n${post.caption ?? post.headline}\n\n${tags}`
  );
}

console.log(dryRun ? "\nDRY RUN — nothing was posted." : "\ndone.");
