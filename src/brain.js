import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { completeJson } from "./llm.js";
import { setUsageContext } from "./usage.js";
import { factsFor, topicBlock, topicOf } from "./topics.js";

const ROOT = path.resolve(import.meta.dirname, "..");

export const PILLARS = [
  "feature-spotlight",
  "pain-point",
  "number-that-lands",
  "client-proof",
  "swahili-tip",
  "industry-note",
];

/**
 * The audience is Tanzanian hoteliers, so the feed leans Kiswahili: 4 of every 6
 * posts. English is kept for the two pillars where it reads more naturally —
 * hard numbers and regional industry commentary.
 */
export const PILLAR_LANGUAGE = {
  "feature-spotlight": "sw",
  "pain-point": "sw",
  "number-that-lands": "en",
  "client-proof": "sw",
  "swahili-tip": "sw",
  "industry-note": "en",
};

/**
 * Which pillar comes next.
 *
 * Round-robin is the floor — every pillar still gets used, so the feed never
 * collapses into one note. On top of that, a pillar that consistently
 * outperforms gets an extra turn, and one that consistently flops loses one.
 * `scores` is the per-pillar average engagement written by cli-metrics.js.
 */
export function nextPillar(recent, scores = null) {
  const last = recent.find((r) => PILLARS.includes(r.pillar))?.pillar;
  const i = last ? PILLARS.indexOf(last) : -1;
  const next = PILLARS[(i + 1) % PILLARS.length];

  // state/pillar-scores.json now carries ONLY pillars cli-metrics is confident
  // about — enough posts, and a big enough gap to mean it. An empty or thin
  // file therefore means "no opinion", and round-robin is the right answer.
  //
  // This used to require all six before acting, which sounds cautious and was
  // not: the scores were averages of Alice's own CTA comment, so six entries
  // existed from day one and a pillar could be thinned on the strength of one
  // stray like.
  const known = scores ? Object.entries(scores) : [];
  if (known.length < 2) return next;

  // Compare against the pillars we actually have evidence for, not against a
  // field that includes pillars we know nothing about.
  const average = known.reduce((a, [, v]) => a + v, 0) / known.length;
  const score = scores[next];
  if (score === undefined) return next;

  // Thinned, never dropped: it must also have been used recently, so a weak
  // pillar loses a turn rather than disappearing from the rotation for good.
  const usedRecently = recent.slice(0, 3).some((r) => r.pillar === next);
  if (usedRecently && score < average * 0.5) {
    return PILLARS[(i + 2) % PILLARS.length];
  }
  return next;
}

/**
 * How the contact detail should read on each platform.
 *
 * Instagram does not linkify anything in a comment, so a long wa.me URL is
 * unclickable AND ugly — a plainly formatted number is more use. Facebook does
 * linkify comments, so it keeps the deep link with its per-post tag.
 */
export function ctaComment(brand, postId, platform) {
  const number = process.env.WHATSAPP_CTA_NUMBER;
  if (!number) return brand.site;

  if (platform === "instagram") {
    const digits = number.replace(/\D/g, "");
    const pretty = digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{3})$/, "+$1 $2 $3 $4");
    return `WhatsApp ${pretty}  ·  ${brand.site}`;
  }
  return ctaLink(brand, postId);
}

/**
 * A wa.me deep link carrying a per-post tag, so an incoming WhatsApp says which
 * post produced it — that is what lets the loop optimise for conversations.
 */
export function ctaLink(brand, postId) {
  const number = process.env.WHATSAPP_CTA_NUMBER;
  if (!number) return brand.site;
  const tag = postId ? postId.replace(/^operra-/, "") : "";
  const text = `Habari, nimeona post yenu${tag ? ` [${tag}]` : ""}. Nataka kujua zaidi kuhusu Operra.`;
  return `https://wa.me/${number.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}

/**
 * Turn an approved post into a spoken reel script. Reuses the post's own angle
 * so the reel and the poster say the same thing — one idea, two formats.
 */
export async function writeReelScript(post, brandId = "operra") {
  const brandDir = path.join(ROOT, "brands", brandId);
  const brand = JSON.parse(await readFile(path.join(brandDir, "brand.json"), "utf8"));
  const topic = topicOf(post, brandId);
  const facts = factsFor(await readFile(path.join(brandDir, "facts.md"), "utf8"), topic) + topicBlock(topic, brandId);
  const sw = post.language === "sw";

  setUsageContext({ feature: "reel-script", post: post.id });
  const script = await completeJson(
    `Turn this into a short vertical video script for ${brand.name}, a hotel management
system in Tanzania. The audience is hotel owners and managers.

Headline: ${post.headline}
Body: ${post.body}

## The only facts you may state
${facts}
Never state a price, phone number or statistic that is not listed above.

Return ONLY JSON:
{
  "beats": ["3 to 4 on-screen lines"],
  "narration": "what the voice says, one flowing paragraph",
  "hook": "the first 3 words, must stop a thumb"
}

Rules:
- "beats" appear one at a time on screen. Each is at most 7 words. The first is the hook.
- The last beat names the payoff, not the product.
- "narration" is 30-45 words, spoken naturally, and must cover the same ground as the
  beats without reading them word for word.
- ${sw
      ? "Write EVERYTHING in natural Tanzanian Kiswahili, as a hotelier speaks."
      : "Write in English."}
- No URLs, no phone numbers, no emoji.`
  );
  return script;
}

/**
 * Write a carousel: several slides that only make sense read in order.
 *
 * Alice chooses the slide count herself — a two-point idea padded to five is
 * worse than a tight three. The first slide has to earn the swipe, the middle
 * ones carry one idea each, and the last asks for something.
 */
export async function writeCarousel({ brandId = "operra", pillar, recent = [], language, note, city = null, topic = null }) {
  language ??= PILLAR_LANGUAGE[pillar] ?? "en";
  const brandDir = path.join(ROOT, "brands", brandId);
  const brand = JSON.parse(await readFile(path.join(brandDir, "brand.json"), "utf8"));
  const look = lookForDate(brand);
  const pillars = await readFile(path.join(brandDir, "pillars.md"), "utf8");
  const facts = factsFor(await readFile(path.join(brandDir, "facts.md"), "utf8"), topic);

  const recentLines =
    recent.slice(0, 40).map((r) => `- ${r.headline}`).join("\n") || "- (nothing yet)";

  // Same trick as the headline list, applied to what was PHOTOGRAPHED.
  const subjectLines =
    [...new Set(recent.slice(0, 14).map((r) => subjectOf(r.imagePrompt)).filter(Boolean))]
      .map((x) => `- ${x}`)
      .join("\n") || "- (nothing yet)";

  setUsageContext({ feature: "plan-carousel" });
  const post = await completeJson(
    `You write social carousels for ${brand.name} — ${brand.tagline} (${brand.site}).
The audience is hotel owners and managers in Tanzania and East Africa.

${pillars}

## Approved facts
You may ONLY state figures or claims that appear here verbatim.
${facts}
${topicBlock(topic, brandId)}
## Already posted — do not repeat these angles
${recentLines}

## Backgrounds already used — pick something GENUINELY different
${subjectLines}

Do not reuse any subject above. Do NOT default to keys, keycards, a reception
desk or a front counter unless this post is specifically about checking in —
that is the rut this account falls into. The subject must come from what THIS
post is actually about: a restaurant order shows a plated dish or a set table; a billing mix-up
shows a printed folio or a calculator; group arrivals show luggage tags or a
coach; long stays show laundry or a kettle; corporate guests show a lanyard or
a meeting room; seasons show a wall calendar or weather.

## Your task
Write ONE carousel for the pillar: **${pillar}**.
${city ? (topic ? `Set it in ${city.name}; the city is only the setting, the subject above decides the story.` : `Speak to hoteliers in ${city.name} — ${city.note}.`) : ""}
${note ? `Direction for this run: ${note}` : ""}

Decide how many slides it needs: **3, 4 or 5**. Choose the smallest number that
tells it properly. A thin idea stretched over five slides is worse than a tight three.

Return ONLY JSON:
{
  "slides": [ { "eyebrow": "1-2 words", "headline": "max 7 words", "body": "max 18 words" } ],
  "caption": "40-90 words, the post caption",
  "hashtags": ["3-5"],
  "imagePrompt": "one background description used across every slide",
  "cta": "2-4 words for the last slide"
}

Rules:
- Slide 1 is the hook: a problem the reader recognises. No product name.
- Middle slides carry ONE idea each and must build, not restate.
- The last slide names the payoff and carries the call to action.
${sceneBrief(look, city, "carousel")}
  One picture sits behind every slide, so make it about the carousel's whole idea.
- ${language === "sw"
      ? "Write EVERY field in natural Tanzanian Kiswahili, as a hotelier speaks."
      : "Write in English."}
- No URLs, no phone numbers.`
  );

  const slides = (post.slides ?? []).slice(0, 5);
  return { ...post, slides, pillar, language, brand: brandId, look: look?.name ?? null, city: city?.name ?? null, feature: topic?.feature.id ?? null, angle: topic?.angle ?? null };
}

/**
 * Which visual look today belongs to.
 *
 * A feed that always looks identical goes stale fast — but changing it randomly
 * looks broken. So the look rotates on a fixed clock: every brand.lookRotationDays
 * the palette accent and the background style move on together, and the logo,
 * type and layout stay put. Deterministic, so every post in a block matches.
 */
export function lookForDate(brand, date = new Date()) {
  const looks = brand.looks ?? [];
  if (!looks.length) return null;
  // Preview override: lets a look be sampled before its block comes round.
  if (process.env.FORCE_LOOK) {
    const forced = looks.find((l) => l.name === process.env.FORCE_LOOK);
    if (forced) return forced;
  }
  const days = Math.floor(date.getTime() / 86400_000);
  const block = Math.floor(days / (brand.lookRotationDays ?? 3));
  return looks[block % looks.length];
}

/**
 * Which city this post speaks to. Rotates one per post so the feed keeps naming
 * real places rather than addressing a generic "hotel" — a Zanzibar resort and
 * an Arusha safari lodge have very different problems.
 */
/**
 * How to write the background, for a model that can hold a whole scene.
 *
 * The old instruction asked for "one concrete object" because the old
 * generator could manage nothing more: everything else came out as mush, so
 * the feed was keys and luggage tags on plain fields. MOSS composes a full
 * scene — place, moment, props, people at a distance, light, lens — and a rich
 * prompt is what it is good at (it takes up to ~4K tokens). So the writer now
 * builds a scene in a fixed order, grounded in the city the post speaks to.
 *
 * People are allowed only at a distance. A face turned to camera is the thing
 * an image model gets most visibly wrong, and it would also read as a real
 * member of some hotel's staff.
 */
export function sceneBrief(look, city, format = "poster") {
  // Where the words sit, so the picture leaves room for them.
  // Measured off the rendered templates, not guessed: the poster's text column
  // runs across the left ~58% from the middle of the frame down, so "left third"
  // put binoculars and a mug directly under the body copy.
  const zone =
    format === "reel"
      ? "the centre band of the frame, where the captions run"
      : "the left half of the frame, from the middle down to the bottom, where the headline and body text sit";
  return `- "imagePrompt": the background, written as ONE rich scene description of 70-130 words,
  in plain descriptive English sentences. Build it in this order:
  1. Place — a believable setting in ${city?.name ?? "Tanzania"}${
    city?.visual ? `: ${city.visual}` : ""
  }. Name real local materials and architecture, never just "a hotel".
  2. Moment — the hotel at work in a way that shows THIS post's problem or payoff. A post
     about corporate invoices shows a back office at month-end; one about trekking groups
     shows duffels and boots piled by a lodge door at dawn; never a beach for a mountain story.
  3. Hero detail — one sharp, specific object that carries the idea, right of centre.
     NEVER name a document, book, folder or sign by its purpose ("departure folios",
     "guest ledger", "invoice", "menu") — the image model will letter that name onto
     it. Describe it only by material and colour, and say it is plain and untitled:
     "a stack of plain, untitled olive-green clothbound folders". Tested on the same
     seed: the first wording printed gibberish titles, the second printed nothing.
  4. Story props — three to five smaller details that make the scene believable.
  5. People — only as soft-focus figures in the background, seen from behind, or hands at
     work. Never a face turned to the camera, never a posed portrait.
  6. Look — obey THIS BLOCK'S style exactly:
       Composition : ${look?.composition ?? "wide shot with depth"}
       Light/tone  : ${look?.tone ?? "natural light"}
       Treatment   : ${look?.treatment ?? "editorial photography"}
     Do not darken a bright look or brighten a dark one.
  7. Calm zone — keep ${zone} visually quiet: plain wall, sky, shadow or soft blur.
  Screens, papers and signs are turned away, blank or blurred, so nothing is legible.
  Never say where the picture will be used — no "post", "poster", "Instagram" or "ad".`;
}

export function cityForIndex(brand, i) {
  const cities = brand.cities ?? [];
  if (!cities.length) return null;
  return cities[Math.abs(i) % cities.length];
}

export async function writePost({ brandId = "operra", pillar, recent = [], language, note, city = null, series = null, format = "poster", topic = null }) {
  language ??= PILLAR_LANGUAGE[pillar] ?? "en";
  const brandDir = path.join(ROOT, "brands", brandId);
  const brand = JSON.parse(await readFile(path.join(brandDir, "brand.json"), "utf8"));
  const look = lookForDate(brand);
  const pillars = await readFile(path.join(brandDir, "pillars.md"), "utf8");
  const facts = factsFor(await readFile(path.join(brandDir, "facts.md"), "utf8"), topic);

  // What has actually worked here beats any style rule we could write.
  const topPath = path.join(ROOT, "state", "top-performers.json");
  let topLines = "";
  if (existsSync(topPath)) {
    const top = JSON.parse(await readFile(topPath, "utf8"));
    if (top.length) {
      topLines = [
        "",
        "## What performs best with this audience",
        "Study the angle of these, do not copy the wording:",
        ...top.map((t) => `- [${t.pillar}] ${t.headline}`),
        "",
      ].join("\n");
    }
  }

  // Whatever the owner told the bot in Telegram outranks the pillar defaults.
  const steerPath = path.join(ROOT, "state", "steer.md");
  let steerLines = "";
  if (existsSync(steerPath)) {
    const steer = (await readFile(steerPath, "utf8")).trim();
    if (steer) {
      steerLines = [
        "",
        "## Standing instructions from the owner",
        "These override the style guidance above. The most recent ones win.",
        steer,
        "",
      ].join("\n");
    }
  }

  const recentLines = recent
    .slice(0, 60)
    .map((r) => `- [${r.pillar}] ${r.headline}`)
    .join("\n") || "- (nothing yet)";

  // Same trick as the headline list, applied to what was PHOTOGRAPHED.
  const subjectLines =
    [...new Set(recent.slice(0, 14).map((r) => subjectOf(r.imagePrompt)).filter(Boolean))]
      .map((x) => `- ${x}`)
      .join("\n") || "- (nothing yet)";

  const prompt = `You write social posts for ${brand.name} — ${brand.tagline} (${brand.site}).
The audience is hotel owners and managers in Tanzania and East Africa.

${pillars}
${steerLines}${topLines}
## Approved facts
You may ONLY state figures, statistics or client claims that appear here verbatim.
If you want a number that is not listed, write the post with no number at all.

${facts}
${topicBlock(topic, brandId)}
## Already posted — do not repeat these angles
${recentLines}

## Backgrounds already used — pick something GENUINELY different
${subjectLines}

Do not reuse any subject above. Do NOT default to keys, keycards, a reception
desk or a front counter unless this post is specifically about checking in —
that is the rut this account falls into. The subject must come from what THIS
post is actually about: a restaurant order shows a plated dish or a set table; a billing mix-up
shows a printed folio or a calculator; group arrivals show luggage tags or a
coach; long stays show laundry or a kettle; corporate guests show a lanyard or
a meeting room; seasons show a wall calendar or weather.

## Your task
Write ONE post for the pillar: **${pillar}**.
${city ? `
Speak to hoteliers in **${city.name}**${topic ? "" : ` specifically — ${city.note}`}. Name the place
naturally once; do not force it into every line.${topic ? " The city is only the setting: the subject above decides the story, not the city." : ""}
` : ""}${series ? `
This is part ${series.part} of ${series.total} in a series called "${series.title}".
Open by signalling which part it is, and end by pointing at the next one.
` : ""}
${note ? `
**Direction for this run — this overrides the usual angle:**
${note}
` : ""}

Return ONLY a JSON object with these keys:
- "eyebrow": 1-2 words, the module or theme (e.g. "Front desk", "Housekeeping"). Title case.
- "headline": max 60 characters. One concrete idea. No colons, no hype words.
- "body": 15-30 words expanding the headline. Plain, specific.
- "cta": 2-4 words (e.g. "See it work", "Book a demo").
- "caption": 40-90 words for the post itself. Opens with a hook a hotelier would recognise.
  Do NOT include any URL or phone number — the link is appended automatically.
  Line breaks allowed. At most one emoji, only if it genuinely helps.
- "hashtags": array of 3-5 hashtags, relevant, no spam.
${sceneBrief(look, city, format)}
- "template": "spotlight"

${language === "sw"
  ? `Write EVERY field — eyebrow, headline, body, cta, caption — in natural Tanzanian Kiswahili.
Write it as a Tanzanian hotelier speaks, not as translated English. Avoid stiff textbook
Kiswahili and avoid direct word-for-word renderings of English marketing phrases.
Hashtags may stay in English where that is what people actually search.`
  : "Write in English."}`;

  setUsageContext({ feature: `plan-${format}` });
  const post = await completeJson(prompt);
  return {
    ...post,
    pillar,
    language,
    brand: brandId,
    look: look?.name ?? null,
    city: city?.name ?? null,
    series: series ?? null,
    feature: topic?.feature.id ?? null,
    angle: topic?.angle ?? null,
  };
}

/**
 * The invented-statistic guard. An unattended LLM will eventually make up a number;
 * anything numeric that is not in facts.md gets the post held for review.
 */
/**
 * Time words in both languages. A number sitting next to one of these is
 * describing WHEN, not claiming anything: "masaa 24 kabla", "within 48 hours",
 * "siku 3", "24/7". Holding those cost a real post — a Kiswahili carousel sat
 * unpublished for a day and a half over the 24 in "masaa 24 kabla".
 */
const TIME_WORDS =
  "hours?|hrs?|minutes?|mins?|seconds?|secs?|days?|weeks?|months?|years?|" +
  "saa|masaa|dakika|sekunde|siku|wiki|mwezi|miezi|mwaka|miaka";

/**
 * The SUBJECT of an image prompt: the opening clause, before all the styling.
 *
 * Used to show the writer what it has already photographed. Without this it
 * only ever saw previous headlines, so it avoided repeating an angle while
 * drawing a key on a reception desk six posts in a row.
 */
export function subjectOf(imagePrompt) {
  if (!imagePrompt) return null;
  let t = String(imagePrompt).trim();

  // Strip the photographic lead-in. Composition and tone come from the LOOK and
  // are identical across every post in a rotation block, so leaving them in
  // shows the writer fourteen near-identical lines and hides the one thing that
  // matters — the object.
  t = t.replace(
    /^(an?|the)?\s*(dramatic|moody|bright|soft|clean|high-key|low-key)?\s*(extreme\s+|tight\s+|super\s+)?(close-?up|macro|flat-?lay|overhead(\s+flat-?lay)?|wide(\s+shot)?|aerial|top-down)\b[^a-z0-9]*((looking\s+)?(straight\s+)?(down\s+)?(onto|of|on|at)\b)?\s*/i,
    ""
  );
  t = t.replace(/^filling the frame(\s+of)?\s*/i, "");
  t = t.replace(/^(an?|the)\s+/i, "");

  // Keep the object, not the lighting essay that follows it.
  const out = t.split(/\s+/).filter(Boolean).slice(0, 9).join(" ").replace(/[,;:.]+$/, "").trim();
  return out || null;
}
export async function findUnapprovedFigures(post, brandId = "operra") {
  const factsPath = path.join(ROOT, "brands", brandId, "facts.md");
  const facts = existsSync(factsPath) ? await readFile(factsPath, "utf8") : "";
  // A post written about a feature may also use that feature's site figures.
  const claims = (topicOf(post, brandId)?.feature.claims ?? []).join(" ");
  const approved = new Set(`${facts} ${claims}`.match(/\d[\d.,]*/g) ?? []);

  const text = [post.headline, post.body, post.caption].filter(Boolean).join(" ");
  const found = text.match(/\d[\d.,]*\s*%?/g) ?? [];

  return [...new Set(found.map((f) => f.trim()))].filter((f) => {
    const bare = f.replace(/%$/, "").trim();

    // These are the reasons the guard exists — an invented price, percentage or
    // statistic. Never exempt them, whatever surrounds them: in "20% off for 3
    // days" the 20% is still a claim and the 3 is not.
    // The one exception: a percentage written as such in the approved facts
    // (Tanzania's 18% VAT), which is the law, not a claim.
    const isPercent = f.includes("%") && !`${facts} ${claims}`.includes(`${bare}%`);
    const money = new RegExp(`(TZS|TSH|KSH|USD|\\$|shilingi|elfu|milioni)\\s*${escapeRe(bare)}|${escapeRe(bare)}\\s*(TZS|TSH|KSH|USD|/=|shilingi|elfu|milioni)`, "i");
    if (isPercent || money.test(text)) return true;

    if (approved.has(bare)) return false;
    // A bare year or a small count reads as prose, not a claim.
    if (/^(19|20)\d{2}$/.test(bare)) return false;
    if (/^\d$/.test(bare)) return false;
    // "24/7" is an idiom, not a measurement.
    if (new RegExp(`${escapeRe(bare)}\\s*/\\s*7\\b`).test(text)) return false;
    // A number touching a time word is saying WHEN, not how much.
    if (new RegExp(`(${TIME_WORDS})\\s*${escapeRe(bare)}\\b|\\b${escapeRe(bare)}\\s*(${TIME_WORDS})\\b`, "i").test(text)) {
      return false;
    }
    return true;
  });
}

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
