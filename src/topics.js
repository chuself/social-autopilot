/**
 * What each post is about.
 *
 * The pillar says HOW to talk (a pain, a tip, a number); the topic says WHAT
 * about: one Operra feature from brands/<id>/features.json, and one story
 * angle inside it. Before this, the writer chose its own subject from a facts
 * file with three lines in it, and 115 of the first 251 posts came back to
 * the same one: low bandwidth. Choosing the subject in code, from every
 * feature page on the site, is what makes the feed cover the product.
 *
 * Deterministic: the same history gives the same pick, so a re-plan agrees
 * with the first one.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

/** Connectivity talk. Allowed only when the topic is the offline feature. */
export const NETWORK_RE = /\b(bandwidth|low[- ]bandwidth|internet|wi-?fi|offline|connectivity|network|fibre|fiber|outage|power cuts?|mtandao|intaneti|nje ya mtandao|umeme ukikatika|kukatika kwa umeme)\b/i;

// How much of the feed a feature should get. The owner asked for more of the
// restaurant, events and booking side; outages are a fact, not a story a day.
const WEIGHT = { "restaurant-pos": 1.3, "digital-menu": 1.3, "table-management": 1.25, events: 1.3, reservations: 1.25, offline: 0.35 };

// Older posts carry no feature. These words place them, so the first new
// plans steer away from what the feed has already said a lot.
const INFER = [
  ["offline", /bandwidth|mtandao (hafifu|dhaifu|ukikatika|ukisumbua|ukiwa chini)|internet|wi-?fi|bila mtandao|connectivity/i],
  ["digital-menu", /\bqr\b|room service|huduma ya chumbani|kuagiza/i],
  ["kitchen-display", /kitchen|jikoni|chef|mpishi/i],
  ["table-management", /table|meza/i],
  ["restaurant-pos", /\bpos\b|\bbar\b|baa|restaurant|mgahawa|dining|vinywaji/i],
  ["events", /conference|mkutano|mikutano|event|tukio|matukio|wedding|harusi|banquet|workshop|delegates|wajumbe/i],
  ["credit-accounts", /corporate|makampuni|kampuni|\blpo\b|credit|mkopo|tour operator|mawakala|agent/i],
  ["night-audit", /night audit|ukaguzi wa usiku|midnight audit/i],
  ["audit-center", /audit|kumbukumbu|nani alibadilisha|who changed|void/i],
  ["reports", /report|ripoti/i],
  ["housekeeping", /housekeeping|usafi|vyumba viko tayari|room readiness|laundry|dobi/i],
  ["mobile-money", /m-?pesa|tigo|airtel|mobile money|malipo ya simu/i],
  ["finance", /\bvat\b|currency|sarafu|dola|exchange rate|ledger|leja/i],
  ["reservations", /double[- ]book|booking|reservation|uhifadhi|kuhifadhi|ota\b/i],
  ["guest-crm", /returning|loyal|wanaorudi|profile/i],
  ["guest-stay", /folio|bill|bili|ankara|invoice|checkout|check-out/i],
  ["front-desk", /front desk|mapokezi|check-?in/i],
];

export function inferFeature(post) {
  if (post.feature) return post.feature;
  const text = [post.eyebrow, post.headline, post.body].filter(Boolean).join(" ");
  return INFER.find(([, re]) => re.test(text))?.[0] ?? null;
}

export function loadFeatures(brandId = "operra") {
  const file = path.join(ROOT, "brands", brandId, "features.json");
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf8"));
}

function hash(s) {
  let h = 2166136261;
  for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

/**
 * @param recent  newest first; queue/history records
 * @param pillar  the post's pillar (a number post needs a feature with a figure)
 * @param seed    anything stable for this slot (the post id)
 * @returns {{feature, angle} | null}
 */
export function pickTopic(recent, { brandId = "operra", pillar = null, seed = "" } = {}) {
  const cat = loadFeatures(brandId);
  if (!cat) return null;
  const used = recent.slice(0, 60).map((r) => ({ f: inferFeature(r), angle: r.angle ?? null }));
  const lastSeen = (id) => { const i = used.findIndex((u) => u.f === id); return i < 0 ? 60 : i; };
  const moduleOf = Object.fromEntries(cat.features.map((f) => [f.id, f.module]));
  const recentModules = used.slice(0, 2).map((u) => moduleOf[u.f]).filter(Boolean);

  let pool = cat.features.filter((f) => !(pillar === "number-that-lands" && !f.claims.some((c) => /\d/.test(c))));
  const fresh = pool.filter((f) => lastSeen(f.id) >= 6 && !recentModules.includes(f.module));
  if (fresh.length) pool = fresh;

  const score = (f) => Math.min(lastSeen(f.id), 40) * (WEIGHT[f.id] ?? 1) + (hash(seed + f.id) % 1000) / 1000 * 3;
  const feature = pool.sort((a, b) => score(b) - score(a))[0];

  const angleSeen = (a) => { const i = used.findIndex((u) => u.angle === a); return i < 0 ? 999 : i; };
  const angle = [...feature.angles].sort((a, b) => angleSeen(b) - angleSeen(a) || (hash(seed + a) % 97) - (hash(seed + b) % 97))[0];
  return { feature, angle };
}

/** Facts for the writer: the network line only when the topic is the network. */
export function factsFor(facts, topic) {
  if (!topic || topic.feature.offline) return facts;
  return facts.split("\n").filter((l) => !NETWORK_RE.test(l)).join("\n");
}

/** The block every writer gets: what this post is about, and what it may say. */
export function topicBlock(topic, brandId = "operra") {
  if (!topic) return "";
  const { feature: f, angle } = topic;
  const never = loadFeatures(brandId)?.neverClaim ?? [];
  return `
## This post's subject: write about THIS and nothing else
Feature: **${f.en}** (in Kiswahili you might say "${f.sw}")
What it does: ${f.what}
Story angle: ${angle}
Facts you may state about it (product facts from operra.tech; no other figures):
${f.claims.map((c) => `- ${c}`).join("\n")}
Never claim: ${never.join("; ")}.
${f.offline ? "" : `Do NOT mention internet, connectivity, bandwidth, working offline, power cuts or "mtandao".
That is a different feature, and the feed has said it far too often.`}
`;
}

/** True when a written post talks about connectivity although its topic is not that. */
export function offTopicNetwork(post, topic) {
  if (!topic || topic.feature.offline) return false;
  const text = [post.headline, post.body, post.caption, post.narration,
    ...(post.slides ?? []).flatMap((s) => [s.headline, s.body])].filter(Boolean).join(" ");
  return NETWORK_RE.test(text);
}

/** The topic a planned post was written about, to brief its reel the same way. */
export function topicOf(post, brandId = "operra") {
  const feature = post?.feature && loadFeatures(brandId)?.features.find((f) => f.id === post.feature);
  return feature ? { feature, angle: post.angle ?? feature.angles[0] } : null;
}
