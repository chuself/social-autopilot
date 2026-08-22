import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
// QUEUE_FILE lets a preview run write somewhere harmless instead of the live
// schedule. Defaults to the real queue, so normal operation is unchanged.
const QUEUE = process.env.QUEUE_FILE
  ? path.resolve(ROOT, process.env.QUEUE_FILE)
  : path.join(ROOT, "state", "queue.json");
const HISTORY = path.join(ROOT, "state", "history.json");

export async function readQueue() {
  if (!existsSync(QUEUE)) return [];
  return JSON.parse(await readFile(QUEUE, "utf8"));
}

export async function writeQueue(queue) {
  await writeFile(QUEUE, JSON.stringify(queue, null, 2));
}

export async function readHistory() {
  if (!existsSync(HISTORY)) return [];
  return JSON.parse(await readFile(HISTORY, "utf8"));
}

/** What the brain is shown so it does not repeat itself: newest first. */
export async function recentPosts(limit = 60) {
  const queue = await readQueue();
  return [...queue].reverse().slice(0, limit);
}

/**
 * Posts that are due and cleared to go out.
 *
 * A `pending` post publishes at its scheduled time. The review window is the
 * gap between planning and the slot itself — an extra countdown on top of that
 * silently pushed same-week posts past their slot, which is exactly what
 * happened to the first 08:00 run.
 *
 * `needs-review` (an unapproved figure) never auto-publishes; a human decides.
 */
/**
 * How late a post may be and still go out. A slot missed by an hour is worth
 * catching up; one missed by a working day is not — a "good morning" post
 * landing at midnight is worse than no post, and publishing it also hides the
 * fault that stranded it. Past this, the post is marked `missed` and said out
 * loud, because the whole failure class here is things that go quiet.
 */
export const MAX_LATE_HOURS = Number(process.env.MAX_LATE_HOURS ?? 6);

const OPEN = (p) =>
  p.status !== "posted" && p.status !== "reject" && p.status !== "needs-review" && p.status !== "missed";

export function duePosts(queue, now = new Date()) {
  return queue.filter((p) => {
    if (!OPEN(p)) return false;
    // Reel slots are filmed and published by the reel pipeline. Publishing them
    // here too would post the same idea twice — once as video, once as a poster.
    if (p.format === "reel") return false;
    if (new Date(p.scheduledFor) > now) return false;
    if (hoursLate(p, now) > MAX_LATE_HOURS) return false;
    return p.status === "pending" || p.status === "approved";
  });
}

export function hoursLate(post, now = new Date()) {
  if (!post.scheduledFor) return 0;
  return (now - new Date(post.scheduledFor)) / 3600_000;
}

/**
 * Open posts that are now too late to publish. Kept separate from duePosts so
 * the caller can report them rather than silently dropping them on the floor.
 */
export function stalePosts(queue, now = new Date()) {
  return queue.filter((p) => OPEN(p) && p.scheduledFor && hoursLate(p, now) > MAX_LATE_HOURS);
}

/**
 * Reels that are filmed and whose slot has arrived, earliest first.
 *
 * `find(ready)` was the bug that stranded a reel for a whole day: it took the
 * FIRST ready reel, and if that one was not due yet it gave up entirely — even
 * with an earlier reel sitting ready and overdue behind it.
 */
export function dueReels(queue, now = new Date()) {
  return queue
    .filter(
      (p) =>
        p.reel?.status === "ready" &&
        OPEN(p) &&
        new Date(p.scheduledFor) <= now &&
        hoursLate(p, now) <= MAX_LATE_HOURS
    )
    .sort((a, b) => new Date(a.scheduledFor) - new Date(b.scheduledFor));
}
