import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { readConfig } from "./config.js";

const ROOT = path.resolve(import.meta.dirname, "..");

/**
 * Ceiling, not a target: the configured cadence plus one, so a retry or a
 * manual post still fits but a bug cannot spam the account.
 */
export async function maxPostsPerDay() {
  const cfg = await readConfig();
  // Count the slots themselves. Reading a postsPerDay field that no longer
  // exists made this NaN, and `already >= NaN` is always false — the cap was
  // silently off for every post.
  const perDay = cfg.slots?.length ?? 1;
  const cap = Math.max(2, perDay + 1);
  if (!Number.isFinite(cap)) throw new Error(`daily cap did not resolve to a number: ${cap}`);
  return cap;
}

/** Kill switch: `git commit` an empty state/PAUSED file to stop all publishing. */
export function isPaused() {
  return existsSync(path.join(ROOT, "state", "PAUSED"));
}

export function isDryRun() {
  return process.env.DRY_RUN === "1";
}

/** How many times this platform has already been posted to today. */
export async function postedTodayCount(platform) {
  const historyPath = path.join(ROOT, "state", "history.json");
  if (!existsSync(historyPath)) return 0;
  const history = JSON.parse(await readFile(historyPath, "utf8"));
  const today = new Date().toISOString().slice(0, 10);
  return history.filter((h) => h.platform === platform && h.postedAt?.startsWith(today)).length;
}

/**
 * A post never goes out without a reachable asset — this is the check that stops
 * Instagram from silently publishing a broken container.
 */
export async function assertAssetReachable(imageUrl) {
  let res;
  try {
    res = await fetch(imageUrl, { method: "HEAD" });
  } catch (err) {
    throw new Error(`Asset unreachable: ${imageUrl} (${err.message})`);
  }
  if (!res.ok) throw new Error(`Asset returned ${res.status}: ${imageUrl}`);
  const type = res.headers.get("content-type") ?? "";
  if (!type.startsWith("image/")) throw new Error(`Asset is not an image (${type}): ${imageUrl}`);
}
