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
import { readQueue, writeQueue, duePosts } from "./queue.js";
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

if (!posts.length) {
  console.log("Nothing due.");
  process.exit(0);
}

const dailyCap = await maxPostsPerDay();
const history = existsSync(path.join(ROOT, "state", "history.json"))
  ? JSON.parse(await readFile(path.join(ROOT, "state", "history.json"), "utf8"))
  : [];

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
      console.error(`  ${err.message} — skipped`);
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
