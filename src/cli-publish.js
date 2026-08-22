#!/usr/bin/env node
/**
 * Publish every queued post that is due and cleared.
 *
 *   node src/cli-publish.js                       # queue mode
 *   node src/cli-publish.js state/sample-post.json # one specific post
 *
 * The poster PNG must already be rendered AND live at PUBLIC_ASSET_BASE —
 * Instagram fetches the image URL server-side, so publishing first always fails.
 */
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { publisherFor } from "./publish/index.js";
import { publishCarousel } from "./publish/instagram.js";
import { publishAlbum } from "./publish/facebook.js";
import { ctaLink, ctaComment } from "./brain.js";
import { commentOn } from "./publish/comment.js";
import { readConfig } from "./config.js";
import { readFile as readFileAsync } from "node:fs/promises";
import { readQueue, writeQueue, duePosts, stalePosts, hoursLate, MAX_LATE_HOURS } from "./queue.js";
import { notify } from "./notify.js";
import {
  isPaused, isDryRun, postedTodayCount, assertAssetReachable, maxPostsPerDay,
} from "./guards.js";

const ROOT = path.resolve(import.meta.dirname, "..");
const dryRun = isDryRun();

if (isPaused()) {
  console.log("PAUSED file present — nothing published.");
  process.exit(0);
}

const base = (process.env.PUBLIC_ASSET_BASE ?? "").replace(/\/$/, "");
if (!base) throw new Error("PUBLIC_ASSET_BASE is not set — Instagram needs a public image URL");

const singleFile = process.argv[2];
const queue = singleFile ? null : await readQueue();
const posts = singleFile
  ? [JSON.parse(await readFile(path.resolve(ROOT, singleFile), "utf8"))]
  : duePosts(queue);

const dailyCap = await maxPostsPerDay();
const history = existsSync(path.join(ROOT, "state", "history.json"))
  ? JSON.parse(await readFile(path.join(ROOT, "state", "history.json"), "utf8"))
  : [];

// A slot that slipped past the cutoff is closed here rather than left to
// publish at some wrong hour days later. Marking it `missed` also stops it
// being reported as overdue forever — but it is never closed quietly.
const stale = queue ? stalePosts(queue) : [];
if (stale.length && !dryRun) {
  for (const p of stale) {
    p.status = "missed";
    p.missedAt = new Date().toISOString();
    console.log(`  MISSED ${p.id} — ${hoursLate(p).toFixed(1)}h late, past the ${MAX_LATE_HOURS}h cutoff`);
  }
  await writeQueue(queue);
  await notify(
    `⏰ <b>${stale.length} slot(s) missed</b>\nMore than ${MAX_LATE_HOURS}h late, so they were closed rather than posted at the wrong hour.\n\n` +
      stale.map((p) => `• ${p.headline ?? p.id}`).join("\n")
  );
}

if (!posts.length) {
  console.log("Nothing due.");
  process.exit(0);
}

/**
 * Has this exact post already gone to this platform?
 *
 * The commit that records a post can lose a race and never land, and the next
 * hourly run then sees the slot as still pending and posts it a second time.
 * History is the receipt; check it before trusting the queue's status.
 */
const alreadyPosted = (postId, platform) =>
  history.some((h) => h.id === postId && h.platform === platform && h.postId !== "dry-run");

/**
 * An asset that is committed but not being served needs a Pages deploy, not a
 * shrug. Signals the workflow to dispatch one, and tells the owner once, so an
 * unreachable poster surfaces this hour instead of after the slot has gone.
 */
let redeployRequested = false;
async function requestRedeploy(postId, why) {
  if (redeployRequested) return;
  redeployRequested = true;
  if (process.env.GITHUB_OUTPUT) {
    const { appendFile } = await import("node:fs/promises");
    await appendFile(process.env.GITHUB_OUTPUT, "redeploy=true\n");
  }
  await notify(
    `🌐 <b>Asset not being served</b>\n${postId} could not be published because its file is not live yet.\n` +
      `<code>${String(why).slice(0, 160)}</code>\n\nAsking Pages to redeploy; it should go out next hour.`
  );
}

for (const post of posts) {
  console.log(`\n--- ${post.id}`);
  // A carousel is several files in swipe order; everything else is one.
  const isCarousel = post.format === "carousel" && (post.slideFiles ?? []).length > 1;
  const assets = isCarousel ? post.slideFiles : [`${post.id}.png`];
  const imageUrls = assets.map((f) => `${base}/${f}`);
  const imageUrl = imageUrls[0];

  if (!assets.every((f) => existsSync(path.join(ROOT, "public", f)))) {
    console.error(`  missing rendered asset(s) — skipped`);
    continue;
  }
  if (!dryRun) {
    try {
      for (const u of imageUrls) await assertAssetReachable(u);
    } catch (err) {
      // The file is committed but Pages is not serving it — usually a deploy
      // that raced and lost. Skipping alone means the slot passes in silence
      // every hour forever, so ask for a redeploy and say so out loud.
      console.error(`  ${err.message} — skipped, requesting a Pages deploy`);
      await requestRedeploy(post.id, err.message);
      continue;
    }
  }

  // The link is appended at send time, not written into the queue, so changing
  // the WhatsApp number never means regenerating a week of posts.
  const brand = JSON.parse(
    await readFileAsync(path.join(ROOT, "brands", post.brand ?? "operra", "brand.json"), "utf8")
  );
  // The link goes in the first comment by default — a caption link is widely
  // observed to suppress reach, and it is still one tap away.
  const cfg = await readConfig();
  const link = ctaLink(brand, post.id);
  const linkInComment = cfg.linkInFirstComment !== false;

  const caption = [post.caption, linkInComment ? null : link, (post.hashtags ?? []).join(" ")]
    .filter(Boolean)
    .join("\n\n");
  const results = [];

  for (const platform of post.platforms ?? []) {
    if (alreadyPosted(post.id, platform)) {
      console.log(`  skip ${platform}: already in history — a lost commit, not a new post`);
      continue;
    }
    const already = await postedTodayCount(platform);
    if (already >= dailyCap) {
      console.log(`  skip ${platform}: daily cap reached (${already})`);
      continue;
    }
    try {
      // A carousel is a different call on both platforms, not a flag on the same one.
      const result = isCarousel
        ? platform === "instagram"
          ? await publishCarousel({ imageUrls, caption, dryRun })
          : await publishAlbum({ imageUrls, caption, dryRun })
        : await publisherFor(platform).publish({ imageUrl, caption, dryRun });
      console.log(`  posted to ${platform}: ${result.postId}${isCarousel ? ` (${imageUrls.length} slides)` : ""}`);
      results.push({ ...result, id: post.id, postedAt: new Date().toISOString() });

      if (linkInComment && result.postId && result.postId !== "dry-run") {
        try {
          // Instagram does not linkify comments, so it gets a readable number
          // instead of an unclickable URL.
          await commentOn(result.postId, ctaComment(brand, post.id, platform), { dryRun });
          console.log(`    link added as the first comment`);
        } catch (err) {
          // Not fatal: the post is already live and useful without it.
          console.warn(`    could not add the link comment: ${err.message}`);
        }
      }
    } catch (err) {
      // One platform failing must never stop the others.
      console.error(`  FAILED ${platform}: ${err.message}`);
    }
  }

  if (!dryRun && results.length) {
    history.push(...results);
    if (queue) {
      const row = queue.find((q) => q.id === post.id);
      if (row) {
        row.status = "posted";
        row.postedAt = new Date().toISOString();
        row.postIds = results.map((r) => `${r.platform}:${r.postId}`);
      }
    }
  }
}

if (!dryRun) {
  await writeFile(path.join(ROOT, "state", "history.json"), JSON.stringify(history.slice(-200), null, 2));
  if (queue) await writeQueue(queue);
}

console.log(dryRun ? "\nDRY RUN — nothing was actually posted." : "\ndone.");
