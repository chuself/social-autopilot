#!/usr/bin/env node
/**
 * The message that goes out after planning: what is lined up, and anything a
 * human has to touch.
 *
 * It used to open "week of <today>" from a weekly-planning era that no longer
 * exists, count history ROWS as posts (so one post to Facebook and Instagram
 * read as two), print the internal pillar name next to every headline, and
 * close by telling the owner to edit state/queue.json and create state/PAUSED
 * — instructions for a developer at a laptop, not for someone on a phone.
 */
import { readQueue, readHistory } from "./queue.js";
import { notify } from "./notify.js";
import { escapeHtml, clip, slotLine, longDay, todayEat } from "./format.js";

const queue = await readQueue();
const history = await readHistory();
const now = new Date();
const weekAgo = new Date(now - 7 * 86400_000);

const upcoming = queue
  .filter(
    (p) =>
      p.status !== "posted" &&
      p.status !== "reject" &&
      p.status !== "missed" &&
      new Date(p.scheduledFor) >= now
  )
  .sort((a, b) => new Date(a.scheduledFor) - new Date(b.scheduledFor));

// One post that went to Facebook, Instagram and TikTok is ONE post, not three.
const postedThisWeek = new Set(
  history.filter((h) => new Date(h.postedAt) >= weekAgo && h.id).map((h) => h.id)
).size;

const lines = [];

if (!upcoming.length) {
  // Planning that produced nothing is a fault, not a quiet success. The nightly
  // planner silently queued nothing for days and this message said "0 queued"
  // in the same neutral tone it uses for a good day.
  lines.push(
    "⚠️ <b>Nothing is queued</b>",
    "Planning ran but produced no posts, so nothing will go out.",
    "",
    `<i>${postedThisWeek} posts out in the last 7 days</i>`
  );
  await notify(lines.join("\n"));
  console.log("digest sent (empty plan)");
  process.exit(0);
}

// Group by day so a multi-day plan does not read as one undifferentiated list.
const byDay = new Map();
for (const p of upcoming) {
  const key = todayEat(new Date(p.scheduledFor)).slice(0, 10);
  if (!byDay.has(key)) byDay.set(key, []);
  byDay.get(key).push(p);
}

const needsReview = upcoming.filter((p) => p.status === "needs-review");

for (const [, posts] of byDay) {
  lines.push(`📅 <b>${longDay(posts[0].scheduledFor)}</b>`);
  for (const p of posts) lines.push(slotLine(p, now, { withDay: false }));
  lines.push("");
}

if (needsReview.length) {
  lines.push(
    `⚠️ <b>${needsReview.length} held for you</b> — an unapproved figure, so ${needsReview.length === 1 ? "it will" : "they will"} not auto-post:`
  );
  for (const p of needsReview) {
    const figures = (p.heldFigures ?? []).join(", ");
    lines.push(`• ${escapeHtml(clip(p.headline ?? p.id, 45))}${figures ? ` — ${escapeHtml(figures)}` : ""}`);
  }
  lines.push("");
}

lines.push(`<i>${postedThisWeek} posts out in the last 7 days · /status anytime</i>`);

await notify(lines.join("\n"));
console.log("digest sent");
