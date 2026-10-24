/**
 * Alice's side of the studio: turn a planned post into a studio brief.
 *
 * The model chooses scenes from a fixed library and writes words and image
 * prompts; everything else (layout, motion, numbers, sound) is the studio's.
 * A brief is only accepted after it has actually been composed in a dry run,
 * so every rule the studio enforces (no typed digits, marked words present,
 * no writing surfaces in image prompts...) is checked before any GPU or voice
 * time is spent. A rejected brief goes back to the model once with the exact
 * errors; after that the caller falls back.
 */
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { completeJson } from "../src/llm.js";
import { setUsageContext } from "../src/usage.js";
import { compose, validateBrief } from "./compose.mjs";
import { composeInk } from "./ink/engine.mjs";
import { factsFor, topicBlock, topicOf } from "../src/topics.js";

const ROOT = path.resolve(import.meta.dirname, "..");

/** Scene shapes of the last few studio reels, so the next one can differ. */
function recentShapes(post) {
  try {
    const q = JSON.parse(readFileSync(path.join(ROOT, "state", "queue.json"), "utf8"));
    return q
      .filter((p) => p.id !== post.id && p.reel?.scenes && p.scheduledFor < (post.scheduledFor ?? "9"))
      .sort((a, b) => (a.scheduledFor < b.scheduledFor ? 1 : -1))
      .slice(0, 4)
      .map((p) => p.reel.scenes.join(" > "))
      .join(" | ");
  } catch {
    return "";
  }
}

const SPEC = `## Scene library (pick 4, or 5 at most; first is "place", last is "payoff")
- "place": the hook. Fields: line (a question or tension, 3-7 words), tag (UPPERCASE "CITY · CONTEXT",
  2-5 words), image.
- "problem-doc": a paper bill on the desk with the wrong ROOM RATE struck through and a stamp. ONLY for
  stories about a wrong rate, bill, invoice or overcharge. Fields: line, bad, stamp (ONE uppercase word
  in the post's language, e.g. IMEKATALIWA, IMEKOSEWA, REJECTED, QUERIED), image, and doc exactly:
  {"title": "ANKARA" (sw) or "INVOICE" (en), "rows": [[<Room label>, "{room}"], [<Nights label>, "{nights}"],
  [<Room rate per night label>, "{wrongRate}"], [<Total label>, "{wrongTotal}"]], "wrongRow": 2}
  Labels in the post's language (sw: "Chumba", "Usiku", "Bei ya chumba / usiku", "Jumla").
- "folio-fix": the Operra folio corrects the rate (computed by the studio). Use right after
  "problem-doc". Fields: line, good, chips (0-1 short fact), image.
- "pos-charge": a bar or restaurant order on the Operra POS posts straight to the guest's room. For
  bar, restaurant, room-service or unpaid-tab stories. Fields: line, chips (0-1), image.
- "ui-screen": a live Operra screen. "screen" is one of: "frontdesk" (arrivals, occupancy, check-in,
  bookings, returning guests), "reports" (owner away, revenue, month-end, audit trail, night audit),
  "kitchen" (orders on the kitchen display, tickets ageing), "menu" (a guest orders from the room QR
  menu, the front desk approves, it bills to the room), "housekeeping" (room board, a room turns clean),
  "events" (the day's events: venue, time, guests, deposit), "tables" (the restaurant floor: tables,
  a reservation, a no-show released), "booking" (a guest books a table on the restaurant's public link). Fields: line, screen, chips (0-1), image.
  Two ui-screens with different screens may follow each other.
- "checklist": 2-4 short items (2-5 words each) of things Operra does, ONLY from the approved facts.
  Fields: line, items, image.
- "payoff": the good outcome. Fields: line, good, chip (a short success label; it may contain
  {rightTotal} only after problem-doc/folio-fix, or {orderTotal} only after pos-charge), image.

Good shapes: place, problem-doc, folio-fix, payoff · place, pos-charge, checklist, payoff ·
place, ui-screen, checklist, payoff · place, problem-doc, folio-fix, checklist, payoff ·
place, ui-screen (menu), ui-screen (kitchen), payoff · place, ui-screen, pos-charge, payoff.
Use the shape that fits the subject; the recent reels list shows which shapes were just used.

## What each screen actually shows (a line may only claim what its screen shows)
frontdesk: occupancy %, rooms free, today's check-ins, arriving guests and their rooms ·
reports: today's revenue, a revenue trend, the report list (revenue, occupancy, audit, guests) ·
kitchen: order tickets by room and table, how long each has waited, a ready stamp, the front desk's
approval · menu: the stay PIN, the guest's order and total, the front desk's approval stamp ·
housekeeping: rooms by status, one turning from dirty to clean · events: today's events with time,
venue and guests, a deposit cleared · tables: tables seated or free, a no-show released ·
booking: a guest's table request and the restaurant's confirmation · pos-charge: an order posted
to a room · folio-fix: a wrong room rate corrected. Nothing else is on screen: no ADR, RevPAR,
charts beyond the trend, or figures you name yourself.

## Hard rules (the studio rejects a brief that breaks any)
- NO DIGITS ANYWHERE you write: not in lines, tags, chips, items, stamp, eyebrow, cta or labels.
  Numbers appear only through these tokens, which the studio computes so every sum is right:
  {room} {nights} {wrongRate} {rightRate} {wrongTotal} {rightTotal} {orderTotal}.
- Every "line" is 3-9 words in the post's language. Product screens are English; your words are not.
- "bad" and "good" are lists of words copied exactly from THAT scene's line (or omit them).
- Each "image" is ONE English description, 30-60 words, of a real-looking place in the post's city:
  the setting, the light, two or three objects, people only seen from behind or far away, ending
  "cinematic photograph". NEVER mention anything that carries writing: no paper, documents, invoices,
  receipts, books, folders, screens, laptops, phones, computers, signs, menus, labels, posters,
  bottles, cans, boxes, number plates, banners. Any bags, luggage, uniforms or vehicles are plain and
  unbranded. Never call a building a "hotel", "lodge" or "resort" when it is seen from outside: the
  image model letters that name across the front. Describe its architecture, or show it from inside.
  The studio draws every document and screen itself.
- Claims about Operra only from the approved facts. Never invent figures, percentages or clients.
- "narration": 30-45 words, natural spoken {LANG}, telling the same story as the scenes in order,
  naming Operra once. No figures.
- "eyebrow": the topic in 1-3 words. "cta": "{CTA}".`;

/**
 * Forgive form, never substance. A scene type under another key name, or a
 * marked phrase instead of single words, is cosmetic: fixed here instead of
 * costing a retry (both happened on the first real posts). Digits, writing
 * surfaces and scene order are left for the studio to reject.
 */
export function normalizeBrief(raw) {
  const bare = (w) => String(w).replace(/[?.,!:;"“”]/g, "").toLowerCase();
  const list = (x) => (Array.isArray(x) ? x : x ? [x] : []).map(String).map((s) => s.trim()).filter(Boolean);
  const scenes = (raw.scenes ?? []).map((s) => {
    const type = String(s.type ?? s.scene ?? s.kind ?? s.sceneType ?? s.name ?? "").trim().toLowerCase().replace(/[\s_]+/g, "-");
    const line = String(s.line ?? s.caption ?? s.text ?? "").trim();
    const inLine = new Set(line.split(/\s+/).map(bare));
    const marks = (x) => [...new Set(list(x).flatMap((p) => p.split(/\s+/)).map((w) => w.replace(/[?.,!:;"“”]/g, "")).filter((w) => inLine.has(w.toLowerCase())))];
    const out = { ...s, type, line, bad: marks(s.bad), good: marks(s.good) };
    if (out.chips !== undefined) out.chips = list(out.chips).slice(0, 1);
    if (out.items !== undefined) out.items = list(out.items).slice(0, 4);
    if (!out.bad.length) delete out.bad;
    if (!out.good.length) delete out.good;
    delete out.scene;
    delete out.kind;
    return out;
  });
  return { ...raw, scenes };
}

const INK_RULE = `- This reel is DRAWN, not photographed: hand-drawn line art with watercolour washes, set in the
  post's city. Do NOT write any "image" field; the studio draws every place, person, paper and screen.
- Every scene must SHOW its line; a viewer with the sound off must see the story. Choose the screen
  that depicts the claim: "tables" for table bookings and no-shows, "menu" for in-room QR orders and
  the stay PIN, "kitchen" for orders reaching the chef, "events" for venue bookings, "housekeeping"
  for room status, "reports" for an owner's numbers, "frontdesk" for arrivals and occupancy,
  "booking" for the public table-booking link. A "checklist" is words, not a picture: use it at most
  once, and only when no screen can show the point.
- On the "place" scene add "prop": the ONE object that makes the hook literal, drawn large in front
  of the city. One of: "whisky" (a drink order, a bar tab), "table" (a restaurant table: bookings,
  no-shows), "envelope" (emailed reports, statements, an owner away), "suitcase" (arrivals,
  check-out, groups), "bell" (the front desk, service), "cloche" (room service, food orders),
  "calendar" (dates, seasons, events), "keys" (rooms, housekeeping).
- On the "payoff" scene add "moment", the story's happy ending: "desk" (a calm front desk, a guest
  leaving happy), "dinner" (diners at a set table), "owner" (the owner away while the hotel runs),
  "toast" (two people celebrating), "farewell" (guests waving goodbye), "sunrise" (a calm morning).
`;

/** A fake voice good enough to compose against: catches scene-level errors without TTS. */
const DRY_VOICE = { duration: 23, speechStart: 0.3, speechEnd: 21.5, pauses: [] };

export function briefErrors(brief, brand) {
  try {
    if (brief.style === "ink") {
      validateBrief(brief);
      composeInk(brief, DRY_VOICE, brand, { tex: "", gsap: "", logo: "", fonts: () => "" });
      return [];
    }
    compose(brief, DRY_VOICE, brand);
    return [];
  } catch (e) {
    return String(e.message).split("\n").map((s) => s.replace(/^\s*-\s*/, "").trim()).filter((s) => s && !/^brief rejected/.test(s));
  }
}

/**
 * @returns {Promise<object>} a brief that composes cleanly
 * @throws when no valid brief could be written (the caller falls back)
 */
export async function writeReelBrief(post, brandId = "operra", { style = post.style ?? "photo" } = {}) {
  const ink = style === "ink";
  const brandDir = path.join(ROOT, "brands", brandId);
  const brand = { ...JSON.parse(await readFile(path.join(brandDir, "brand.json"), "utf8")), id: brandId };
  const topic = topicOf(post, brandId);
  const facts = factsFor(await readFile(path.join(brandDir, "facts.md"), "utf8"), topic);
  const language = post.language === "sw" ? "sw" : "en";
  const city = (brand.cities ?? []).find((c) => c.name === post.city) ?? null;
  const cta = language === "sw" ? "Ona inavyofanya kazi" : "See it work";
  // Ink reels are drawn by the studio in code, so there are no image prompts to
  // write and none of the rules that keep MOSS from lettering a photo.
  const spec = (ink ? SPEC.replace(/- Each "image" is ONE[\s\S]*?The studio draws every document and screen itself\.\n/, INK_RULE).replace(/,\s*image(?=[.,])/g, "") : SPEC).replace("{LANG}", language === "sw" ? "Tanzanian Kiswahili" : "English").replace("{CTA}", cta);

  const base = `You are planning a 20-25 second vertical video ad for ${brand.name}, hotel management software
in Tanzania, for hotel owners and managers. It retells this planned post as moving scenes.

## The post
Language: ${language === "sw" ? "Kiswahili" : "English"}
City: ${post.city ?? "Tanzania"}${city?.visual ? ` (local details you may use in images: ${city.visual})` : ""}
Headline: ${post.headline}
Body: ${post.body ?? ""}
Caption: ${(post.caption ?? "").slice(0, 400)}

## The only facts you may state about Operra
${facts}
${topicBlock(topic, brandId)}${topic?.feature.reel?.scenes ? `Scenes that show this feature best: ${topic.feature.reel.scenes.join(", ")} (type:screen).
` : ""}${recentShapes(post) ? `Scene shapes used by the last reels (pick a different one if the subject allows): ${recentShapes(post)}
` : ""}
${spec}

Return ONLY JSON: {"narration": "...", "eyebrow": "...", "cta": "${cta}", "scenes": [ ... ]}`;

  setUsageContext({ feature: "reel-brief", post: post.id });
  let errors = [];
  for (let attempt = 1; attempt <= 2; attempt++) {
    const prompt = errors.length
      ? `${base}\n\n## Your previous brief was rejected by the studio for these reasons. Fix every one:\n${errors.map((e) => `- ${e}`).join("\n")}`
      : base;
    let raw;
    try {
      raw = await completeJson(prompt, { feature: "reel-brief", post: post.id });
    } catch (e) {
      errors = [`model call failed: ${e.message}`];
      continue;
    }
    const brief = normalizeBrief({ ...raw, id: post.id, language, cta: raw.cta || cta, ...(ink ? { style: "ink", city: post.city ?? undefined } : {}) });
    if (ink) for (const sc of brief.scenes) delete sc.image;
    errors = briefErrors(brief, brand);
    if (!errors.length) return brief;
    console.warn(`  brief attempt ${attempt} rejected: ${errors.slice(0, 3).join(" | ")}`);
  }
  throw new Error(`no valid brief: ${errors.slice(0, 3).join(" | ")}`);
}
