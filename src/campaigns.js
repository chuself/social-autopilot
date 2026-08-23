/**
 * Campaigns: a thing that is happening, for a while.
 *
 * Alice was entirely evergreen — pillars rotating forever, no way to say "we
 * have an Eid offer next week" or "the new wing opens on the 12th". That is
 * most of what a real business actually wants to post about, and a content
 * system that cannot express it is one they will outgrow.
 *
 * A campaign is deliberately NOT a separate content pipeline. It is a note
 * handed to the same writer for some of the day's slots, so everything
 * downstream — rendering, the figure guard, publishing, the reel path — is
 * unchanged and cannot regress.
 */
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const FILE = path.join(ROOT, "state", "campaigns.json");

export const CAMPAIGN_LIMITS = {
  maxDays: 45,
  maxSlotsPerDay: 4,
  // Beyond this share of the day the feed stops being a feed and becomes an
  // advert, which costs reach that takes months to win back.
  safeShare: 0.5,
};

export async function readCampaigns() {
  if (!existsSync(FILE)) return [];
  try {
    const rows = JSON.parse(await readFile(FILE, "utf8"));
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

export async function writeCampaigns(rows) {
  await writeFile(FILE, JSON.stringify(rows, null, 2));
}

/** Dates are compared as plain YYYY-MM-DD in EAT — no timezone edge cases. */
export function eatDay(when = new Date()) {
  return new Date(new Date(when).getTime() + 3 * 3600_000).toISOString().slice(0, 10);
}

/** The campaign covering a given day, if any. Newest wins if they overlap. */
export function campaignFor(campaigns, when) {
  const day = eatDay(when);
  return (
    [...campaigns]
      .filter((c) => c.status !== "ended" && c.startsOn <= day && day <= c.endsOn)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0] ?? null
  );
}

export function isActive(c, when = new Date()) {
  const day = eatDay(when);
  return c.status !== "ended" && c.startsOn <= day && day <= c.endsOn;
}

/**
 * Validate and normalise what the model extracted from a sentence.
 * Returns { campaign, rejected, needsConfirmation } — the same shape
 * updateConfig uses, so the Telegram confirmation flow works unchanged.
 */
export function buildCampaign(raw, { slotsInDay = 4 } = {}) {
  const rejected = [];
  const name = String(raw?.name ?? "").trim().slice(0, 60);
  const brief = String(raw?.brief ?? "").trim().slice(0, 400);

  if (!name) rejected.push("it needs a name");
  if (!brief) rejected.push("it needs something to say");

  const today = eatDay();
  const startsOn = /^\d{4}-\d{2}-\d{2}$/.test(raw?.startsOn ?? "") ? raw.startsOn : today;
  let endsOn = /^\d{4}-\d{2}-\d{2}$/.test(raw?.endsOn ?? "") ? raw.endsOn : null;

  if (!endsOn) {
    const days = Number.isInteger(raw?.days) ? raw.days : 5;
    endsOn = eatDay(new Date(new Date(`${startsOn}T00:00:00Z`).getTime() + (days - 1) * 86400_000));
  }
  if (endsOn < startsOn) rejected.push("it ends before it starts");

  const span = Math.round(
    (new Date(`${endsOn}T00:00:00Z`) - new Date(`${startsOn}T00:00:00Z`)) / 86400_000
  ) + 1;
  if (span > CAMPAIGN_LIMITS.maxDays) rejected.push(`${span} days is too long (max ${CAMPAIGN_LIMITS.maxDays})`);

  let slotsPerDay = Number.isInteger(raw?.slotsPerDay) ? raw.slotsPerDay : 1;
  slotsPerDay = Math.max(1, Math.min(slotsPerDay, CAMPAIGN_LIMITS.maxSlotsPerDay, slotsInDay));

  if (rejected.length) return { campaign: null, rejected, needsConfirmation: null };

  const campaign = {
    id: `${startsOn}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 24)}`,
    name,
    brief,
    cta: String(raw?.cta ?? "").trim().slice(0, 60) || null,
    language: raw?.language === "sw" || raw?.language === "en" ? raw.language : null,
    startsOn,
    endsOn,
    slotsPerDay,
    status: "live",
    createdAt: new Date().toISOString(),
  };

  // Held, not applied — the same posture as the TikTok cap. Turning the whole
  // feed into one advert for a fortnight is the kind of thing that looks fine
  // on the day and costs reach for months.
  let needsConfirmation = null;
  const share = slotsPerDay / Math.max(1, slotsInDay);
  if (share > CAMPAIGN_LIMITS.safeShare) {
    needsConfirmation = {
      field: "campaign",
      why:
        `That gives the campaign ${slotsPerDay} of ${slotsInDay} posts a day for ${span} days — ` +
        `${Math.round(share * 100)}% of everything you publish. A feed that is mostly one advert ` +
        `loses reach that takes months to win back.`,
    };
  }

  return { campaign, rejected, needsConfirmation };
}

/** One line for Telegram. */
export function describeCampaign(c) {
  const span = c.startsOn === c.endsOn ? c.startsOn : `${c.startsOn} → ${c.endsOn}`;
  return `<b>${c.name}</b> · ${span} · ${c.slotsPerDay}/day${c.status === "ended" ? " · ended" : ""}`;
}
