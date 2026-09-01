#!/usr/bin/env node
/**
 * What actually happened to everything posted, and what may be concluded from it.
 *
 * The previous version measured `likes + comments*2 + shares*3` and fed the
 * average per pillar straight into pillar rotation. Two things were wrong with
 * that, and together they made the loop worse than no loop at all:
 *
 *   1. It counted Alice's OWN first comment. Checked against the live API:
 *      every recent post reads likes=0, comments=1, and that one comment is the
 *      CTA she posts herself. So the "engagement" driving her decisions was her
 *      own footprint, plus the occasional stray like.
 *
 *   2. It acted on any difference at all. Pillar scores sat between 2.25 and
 *      3.75 — a spread of roughly one accidental like — and nextPillar thins a
 *      pillar scoring under half the average. One like away from silently
 *      dropping a perfectly good pillar.
 *
 * So: subtract our own comments, prefer REACH over engagement because reach is
 * the thing that exists on a cold account, and refuse to conclude anything from
 * a sample too small to mean it. A lesson now carries n and a confidence, and
 * only a confident lesson is allowed to change behaviour.
 */
import { writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { readHistory, readQueue } from "./queue.js";
import { graphGet } from "./graph.js";

const ROOT = path.resolve(import.meta.dirname, "..");
const token = process.env.FB_PAGE_ACCESS_TOKEN;
if (!token) throw new Error("Missing FB_PAGE_ACCESS_TOKEN");

/** Below this many posts, a difference is noise and must not steer anything. */
const MIN_SAMPLE = Number(process.env.METRICS_MIN_SAMPLE ?? 8);
/** A lesson must beat the field by this much before it counts as a finding. */
const MIN_EFFECT = Number(process.env.METRICS_MIN_EFFECT ?? 0.25);

// Declared up here, not beside isOurs at the bottom: `const` does not hoist,
// and isOurs runs during the fetch loop above that point.
const ctaNumber = String(process.env.WHATSAPP_CTA_NUMBER ?? "").replace(/\D/g, "");

const ours = new Set(
  existsSync(path.join(ROOT, "state", "our-comments.json"))
    ? JSON.parse(await readFile(path.join(ROOT, "state", "our-comments.json"), "utf8"))
    : []
);

const history = await readHistory();
const queue = await readQueue();
const byId = new Map(queue.map((q) => [q.id, q]));

const rows = [];
for (const h of history) {
  if (!h.postId || h.postId === "dry-run") continue;
  const post = byId.get(h.id);
  if (!post) continue;
  try {
    const stats =
      h.platform === "facebook" ? await facebookStats(h.postId) : await instagramStats(h.postId);
    rows.push({
      id: h.id,
      platform: h.platform,
      pillar: post.pillar,
      format: post.format ?? "poster",
      language: post.language,
      look: post.look ?? null,
      headline: post.headline,
      ...stats,
    });
  } catch (err) {
    console.warn(`${h.platform} ${h.postId}: ${err.message.slice(0, 80)}`);
  }
}

// One post is several rows — combine so an idea is judged once, on its total.
const merged = new Map();
for (const r of rows) {
  const prev = merged.get(r.id);
  if (!prev) {
    merged.set(r.id, { ...r, platforms: [r.platform] });
    continue;
  }
  prev.reach += r.reach;
  prev.likes += r.likes;
  prev.comments += r.comments;
  prev.shares += r.shares;
  prev.saves += r.saves;
  prev.engagement += r.engagement;
  prev.platforms.push(r.platform);
}
const posts = [...merged.values()];

// ── the metric hierarchy ─────────────────────────────────────────────────────
// Leading: did anyone see it. Conversion: did seeing it do anything.
// Outcome: did it produce a person. On a cold account only the first is
// meaningful yet, which is exactly why it has to be measured separately.
const leadsPath = path.join(ROOT, "state", "leads.json");
const leads = existsSync(leadsPath) ? JSON.parse(await readFile(leadsPath, "utf8")) : [];

const totals = {
  posts: posts.length,
  // Leading: did anyone see it.
  reach: sum(posts, "reach"),
  // Conversion: of those who saw it, did any act. Raw interactions, NOT the
  // weighted engagement score — dividing a weighted score by reach produces a
  // number that looks like a rate, reads like 24%, and means nothing.
  interactions: sum(posts, "likes") + sum(posts, "comments") + sum(posts, "shares") + sum(posts, "saves"),
  engagementScore: sum(posts, "engagement"),
  // Outcome: did it produce a person.
  leads: leads.length,
};
totals.interactionRate = totals.reach
  ? +((totals.interactions / totals.reach) * 100).toFixed(2)
  : null;

// ── top performers, ranked on reach where we have it ─────────────────────────
const ranked = [...posts].sort((a, b) => b.reach - a.reach || b.engagement - a.engagement);
const top = ranked.filter((p) => p.headline).slice(0, 5);
await writeFile(path.join(ROOT, "state", "top-performers.json"), JSON.stringify(top, null, 2));

// ── lessons, with the evidence attached ──────────────────────────────────────
// The shape a future fleet could pool: what was varied, what happened, how many
// times, and how much to trust it.
const lessons = [];
for (const dimension of ["pillar", "format", "language", "look"]) {
  lessons.push(...learn(posts, dimension));
}
await writeFile(
  path.join(ROOT, "state", "lessons.json"),
  JSON.stringify({ generatedAt: new Date().toISOString(), totals, lessons }, null, 2)
);

// pillar-scores.json keeps its shape, but ONLY carries pillars we are entitled
// to have an opinion about. An empty file means "no opinion", and nextPillar
// falls back to plain round-robin — which is the correct behaviour on a young
// account, and what should have been happening all along.
const confidentPillars = Object.fromEntries(
  lessons
    .filter((l) => l.dimension === "pillar" && l.confidence !== "low")
    .map((l) => [l.value, l.mean])
);
await writeFile(
  path.join(ROOT, "state", "pillar-scores.json"),
  JSON.stringify(confidentPillars, null, 2)
);

console.log(
  `scored ${posts.length} post(s) · reach ${totals.reach} · ${totals.interactions} interaction(s)` +
    ` (${totals.interactionRate}% of reach, own comments excluded) · ${leads.length} lead(s)`
);
if (!Object.keys(confidentPillars).length) {
  console.log(
    `no pillar has ${MIN_SAMPLE}+ posts with a clear enough difference — rotation stays round-robin`
  );
}
for (const l of lessons.filter((x) => x.confidence !== "low")) {
  console.log(`  [${l.confidence}] ${l.dimension}=${l.value}: ${l.finding} (n=${l.n})`);
}
for (const t of top.slice(0, 3)) {
  console.log(`  reach ${t.reach} · ${t.engagement} eng — [${t.pillar}] ${String(t.headline).slice(0, 45)}`);
}

// ── helpers ──────────────────────────────────────────────────────────────────

function sum(list, key) {
  return list.reduce((a, b) => a + (b[key] ?? 0), 0);
}

/**
 * Ours, by recorded id OR by content.
 *
 * The id is the real mechanism, but cli-publish only started recording the CTA
 * comment's id partway through — 20 ids exist for roughly 50 comments posted.
 * Everything older leaked in as audience engagement and produced a 25%
 * engagement rate, which is not a number a two-follower account can produce.
 * The same content check the engage job uses closes the gap for the back
 * catalogue, and costs nothing.
 */
function isOurs(c) {
  if (ours.has(c.id)) return true;
  const t = String(c.message ?? c.text ?? "");
  if (!t.trim()) return false;
  if (ctaNumber && t.replace(/\D/g, "").includes(ctaNumber)) return true;
  if (t.includes("wa.me/")) return true;
  if (t.includes("operra.tech")) return true;
  return false;
}

/**
 * Turn one dimension into lessons.
 *
 * Deliberately conservative. A finding needs a real sample AND a real gap: on a
 * two-follower account almost every apparent difference is one person having a
 * quiet week, and acting on it is how a good pillar gets silently dropped.
 */
function learn(list, dimension) {
  const groups = new Map();
  for (const p of list) {
    const v = p[dimension];
    if (!v) continue;
    if (!groups.has(v)) groups.set(v, []);
    groups.get(v).push(p);
  }
  if (groups.size < 2) return [];

  // Score on reach when the account has any, engagement otherwise.
  const useReach = sum(list, "reach") > 0;
  const score = (p) => (useReach ? p.reach : p.engagement);
  const field = list.length ? sum(list, useReach ? "reach" : "engagement") / list.length : 0;

  const out = [];
  for (const [value, members] of groups) {
    const n = members.length;
    const mean = members.reduce((a, b) => a + score(b), 0) / n;
    const lift = field ? (mean - field) / field : 0;

    const confidence =
      n < MIN_SAMPLE || Math.abs(lift) < MIN_EFFECT
        ? "low"
        : n >= MIN_SAMPLE * 2 && Math.abs(lift) >= MIN_EFFECT * 2
          ? "high"
          : "medium";

    out.push({
      dimension,
      value,
      n,
      metric: useReach ? "reach" : "engagement",
      mean: +mean.toFixed(2),
      field: +field.toFixed(2),
      lift: +lift.toFixed(2),
      confidence,
      finding:
        confidence === "low"
          ? `not enough evidence yet (n=${n}, needs ${MIN_SAMPLE})`
          : `${lift > 0 ? "above" : "below"} average by ${Math.abs(Math.round(lift * 100))}%`,
    });
  }
  return out;
}

/**
 * Facebook. Reach comes from insights and is often refused on a young Page, so
 * it degrades to zero rather than throwing — a missing metric must not cost us
 * the ones we can read.
 */
async function facebookStats(postId) {
  // A reel is a video, not a page post, and rejects `shares` — the whole
  // request then fails with "nonexisting field" and the post scores nothing.
  // Same trap as asking a video for is_published. Ask for everything, and fall
  // back to the fields every object has.
  let j;
  try {
    j = await graphGet(postId, {
      fields: "likes.summary(true),comments.summary(true).limit(50){id,message},shares",
      access_token: token,
    });
  } catch {
    j = await graphGet(postId, {
      fields: "likes.summary(true),comments.summary(true).limit(50){id,message}",
      access_token: token,
    });
  }
  const likes = j.likes?.summary?.total_count ?? 0;
  const total = j.comments?.summary?.total_count ?? 0;
  // Subtract our own first comment: it is our footprint, not an audience.
  const mine = (j.comments?.data ?? []).filter(isOurs).length;
  const comments = Math.max(0, total - mine);
  const shares = j.shares?.count ?? 0;

  let reach = 0;
  try {
    const ins = await graphGet(`${postId}/insights/post_impressions_unique`, { access_token: token });
    reach = ins.data?.[0]?.values?.[0]?.value ?? 0;
  } catch {
    /* insights are frequently unavailable; reach stays 0 */
  }

  return { reach, likes, comments, shares, saves: 0, engagement: likes + comments * 2 + shares * 3 };
}

async function instagramStats(mediaId) {
  const j = await graphGet(mediaId, {
    fields: "like_count,comments_count,comments.limit(50){id,text}",
    access_token: token,
  });
  const likes = j.like_count ?? 0;
  const mine = (j.comments?.data ?? []).filter(isOurs).length;
  const comments = Math.max(0, (j.comments_count ?? 0) - mine);

  let reach = 0;
  let saves = 0;
  try {
    const ins = await graphGet(`${mediaId}/insights`, { metric: "reach,saved", access_token: token });
    for (const d of ins.data ?? []) {
      if (d.name === "reach") reach = d.values?.[0]?.value ?? 0;
      if (d.name === "saved") saves = d.values?.[0]?.value ?? 0;
    }
  } catch {
    /* same as Facebook: a missing metric is not a failure */
  }

  return { reach, likes, comments, shares: 0, saves, engagement: likes + comments * 2 + saves * 2 };
}
