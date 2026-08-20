/**
 * Operational settings the owner can change by messaging the bot — cadence and
 * timing, as opposed to state/steer.md which shapes what gets written.
 *
 * Kept deliberately small and validated hard: this file decides how often the
 * account posts, so a bad value is worse than a rejected instruction.
 */
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const FILE = path.join(ROOT, "state", "config.json");

export const DEFAULTS = {
  postsPerDay: 1,
  // Local (EAT) hours posts are scheduled at. Length should match postsPerDay.
  postHours: [9],
};

export const LIMITS = { maxPostsPerDay: 4, minHour: 6, maxHour: 23 };

export async function readConfig() {
  if (!existsSync(FILE)) return { ...DEFAULTS };
  try {
    return { ...DEFAULTS, ...JSON.parse(await readFile(FILE, "utf8")) };
  } catch {
    return { ...DEFAULTS };
  }
}

/**
 * Apply a partial change. Returns { config, changes, rejected } so the caller can
 * tell the owner exactly what took effect — silent clamping would be worse than
 * saying no.
 */
export async function updateConfig(patch) {
  const current = await readConfig();
  const next = { ...current };
  const changes = [];
  const rejected = [];

  if (patch.postsPerDay != null) {
    const n = Number(patch.postsPerDay);
    if (!Number.isInteger(n) || n < 1 || n > LIMITS.maxPostsPerDay) {
      rejected.push(`postsPerDay ${patch.postsPerDay} (allowed 1-${LIMITS.maxPostsPerDay})`);
    } else if (n !== current.postsPerDay) {
      next.postsPerDay = n;
      changes.push(`${current.postsPerDay} → ${n} posts per day`);
    }
  }

  if (Array.isArray(patch.postHours) && patch.postHours.length) {
    const hours = patch.postHours
      .map(Number)
      .filter((h) => Number.isInteger(h) && h >= LIMITS.minHour && h <= LIMITS.maxHour);
    if (hours.length !== patch.postHours.length) {
      rejected.push(`some hours outside ${LIMITS.minHour}:00-${LIMITS.maxHour}:00`);
    }
    if (hours.length) {
      const sorted = [...new Set(hours)].sort((a, b) => a - b);
      if (sorted.join(",") !== current.postHours.join(",")) {
        next.postHours = sorted;
        changes.push(`times → ${sorted.map((h) => `${h}:00`).join(", ")}`);
      }
    }
  }

  // Keep the two consistent: a cadence without enough slots would silently
  // collapse several posts onto one hour.
  if (next.postHours.length < next.postsPerDay) {
    next.postHours = spreadHours(next.postsPerDay);
    changes.push(`times auto-spread to ${next.postHours.map((h) => `${h}:00`).join(", ")}`);
  }

  if (changes.length) {
    await writeFile(FILE, JSON.stringify(next, null, 2));
  }
  return { config: next, changes, rejected };
}

/**
 * Sensible slots per cadence. An even mathematical spread puts posts at 6am,
 * which is wrong for this audience — these are hand-picked reading moments:
 * before the shift, the midday lull, and the evening wind-down.
 */
const SLOTS = {
  1: [9],
  2: [9, 17],
  3: [8, 13, 19],
  4: [8, 12, 16, 20],
};

export function spreadHours(n) {
  if (SLOTS[n]) return SLOTS[n];
  const { minHour, maxHour } = LIMITS;
  const step = (maxHour - minHour) / (n - 1);
  return Array.from({ length: n }, (_, i) => Math.round(minHour + step * i));
}
