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
import path from "node:path";
import { completeJson } from "../src/llm.js";
import { setUsageContext } from "../src/usage.js";
import { compose } from "./compose.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");

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
- "ui-screen": a live Operra screen. "screen": "frontdesk" (rooms, arrivals, check-in, housekeeping,
  slow internet) or "reports" (owner away, revenue, month-end, audit trail). Fields: line, screen,
  chips (0-1), image.
- "checklist": 2-4 short items (2-5 words each) of things Operra does, ONLY from the approved facts.
  Fields: line, items, image.
- "payoff": the good outcome. Fields: line, good, chip (a short success label; it may contain
  {rightTotal} only after problem-doc/folio-fix, or {orderTotal} only after pos-charge), image.

Good shapes: place, problem-doc, folio-fix, payoff · place, pos-charge, checklist, payoff ·
place, ui-screen, checklist, payoff · place, problem-doc, folio-fix, checklist, payoff.

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

/** A fake voice good enough to compose against: catches scene-level errors without TTS. */
const DRY_VOICE = { duration: 23, speechStart: 0.3, speechEnd: 21.5, pauses: [] };

export function briefErrors(brief, brand) {
  try {
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
export async function writeReelBrief(post, brandId = "operra") {
  const brandDir = path.join(ROOT, "brands", brandId);
  const brand = { ...JSON.parse(await readFile(path.join(brandDir, "brand.json"), "utf8")), id: brandId };
  const facts = await readFile(path.join(brandDir, "facts.md"), "utf8");
  const language = post.language === "sw" ? "sw" : "en";
  const city = (brand.cities ?? []).find((c) => c.name === post.city) ?? null;
  const cta = language === "sw" ? "Ona inavyofanya kazi" : "See it work";
  const spec = SPEC.replace("{LANG}", language === "sw" ? "Tanzanian Kiswahili" : "English").replace("{CTA}", cta);

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
    const brief = normalizeBrief({ ...raw, id: post.id, language, cta: raw.cta || cta });
    errors = briefErrors(brief, brand);
    if (!errors.length) return brief;
    console.warn(`  brief attempt ${attempt} rejected: ${errors.slice(0, 3).join(" | ")}`);
  }
  throw new Error(`no valid brief: ${errors.slice(0, 3).join(" | ")}`);
}
