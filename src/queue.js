import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const QUEUE = path.join(ROOT, "state", "queue.json");
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
 * `pending` auto-approves after AUTO_APPROVE_HOURS so silence never stops the line —
 * but `needs-review` (an unapproved figure) never auto-approves.
 */
export function duePosts(queue, now = new Date()) {
  const autoApproveMs = Number(process.env.AUTO_APPROVE_HOURS ?? 24) * 3600_000;
  return queue.filter((p) => {
    if (p.status === "posted" || p.status === "reject" || p.status === "needs-review") return false;
    if (new Date(p.scheduledFor) > now) return false;
    if (p.status === "approved") return true;
    if (p.status === "pending") {
      return now - new Date(p.createdAt ?? p.scheduledFor) >= autoApproveMs;
    }
    return false;
  });
}
