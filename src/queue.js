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

/**
 * Record why a post did not go out this time.
 *
 * Nothing used to write this down. Every skip printed one line into an Actions
 * log and vanished, so the queue could say a post was "pending" but never why
 * it had stayed that way for six hours — and the only way to find out was to
 * read the logs of a job that had already scrolled past. `/status` can now
 * answer the question instead.
 */
export function noteSkip(post, reason) {
  post.lastAttempt = new Date().toISOString();
  post.lastSkipReason = reason;
}

export function clearSkip(post) {
  post.lastAttempt = new Date().toISOString();
  delete post.lastSkipReason;
}

/** "40m late", "2h late", "7h20m late" — never "2.0h late". */
function lateness(hours) {
  const mins = Math.round(hours * 60);
  if (mins < 60) return `${mins}m late`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h${m}m late` : `${h}h late`;
}

function ago(iso) {
  const mins = Math.round((Date.now() - new Date(iso)) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h${mins % 60}m ago`;
}

/** One plain sentence for the owner: what is this post waiting for? */
export function whyWaiting(post, now = new Date()) {
  if (post.status === "posted") return "posted";
  if (post.status === "reject") return "rejected";
  if (post.status === "needs-review") return "held — a figure in it is not in facts.md";
  if (post.status === "missed") {
    return `missed — ${lateness(hoursLate(post, now))}, past the ${MAX_LATE_HOURS}h cutoff`;
  }

  const when = new Date(post.scheduledFor);
  if (when > now) {
    const mins = Math.round((when - now) / 60_000);
    const eta = mins < 60 ? `due in ${mins}m` : `due in ${Math.floor(mins / 60)}h${mins % 60}m`;
    if (post.format === "reel") {
      return post.reel?.status === "ready" ? `filmed and waiting — ${eta}` : `${eta}, not filmed yet`;
    }
    return eta;
  }

  const late = lateness(hoursLate(post, now));
  if (post.lastSkipReason) return `${late} · ${post.lastSkipReason} (tried ${ago(post.lastAttempt)})`;
  if (post.format === "reel" && post.reel?.status !== "ready") return `${late} · not filmed yet`;
  return `${late} · nothing has tried to publish it yet`;
}

/**
 * How long a post may sit waiting for a human before its slot is written off.
 *
 * Longer than MAX_LATE_HOURS on purpose: a held post is waiting on a person,
 * and people sleep. An overnight hold should survive until morning. But it must
 * not sit for ever, which is exactly what happened — a carousel was held on a
 * false-positive figure and was still sitting there thirty hours later with
 * nothing chasing it.
 */
export const HELD_MAX_HOURS = Number(process.env.HELD_MAX_HOURS ?? 14);

/** Held posts whose slot is so far gone that the decision no longer matters. */
export function heldTooLong(queue, now = new Date()) {
  return queue.filter(
    (p) => p.status === "needs-review" && p.scheduledFor && hoursLate(p, now) > HELD_MAX_HOURS
  );
}

/**
 * The next slot with nothing in it, for a post approved after its own slot
 * passed. "I was late to allow it" should move the post, not lose it.
 */
export function nextFreeSlot(queue, config, now = new Date()) {
  const taken = new Set(
    queue.filter((p) => p.status !== "reject" && p.status !== "missed").map((p) => p.scheduledFor)
  );
  for (let day = 0; day <= 2; day++) {
    for (const slot of [...(config.slots ?? [])].sort((a, b) => a.hour - b.hour)) {
      const when = new Date(now);
      when.setDate(when.getDate() + day);
      when.setUTCHours(slot.hour - 3, 0, 0, 0); // EAT is UTC+3, no DST
      if (when <= now) continue;
      if (!taken.has(when.toISOString())) return { when, format: slot.format };
    }
  }
  return null;
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
  return queue.filter(
    (p) =>
      OPEN(p) &&
      p.scheduledFor &&
      hoursLate(p, now) > MAX_LATE_HOURS &&
      // A platform outage is not a missed slot. When Meta blocked the app,
      // every post sat unpublished through the cutoff and would have been
      // closed as "missed" — throwing away a day of finished content because
      // someone else's API was down. Held posts wait for the platform instead.
      !p.blockedByOutage
  );
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
