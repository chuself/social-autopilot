import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { completeJson } from "./llm.js";

const ROOT = path.resolve(import.meta.dirname, "..");

export const PILLARS = [
  "feature-spotlight",
  "pain-point",
  "number-that-lands",
  "client-proof",
  "swahili-tip",
  "industry-note",
];

/** Round-robin, continuing from wherever the last plan stopped. */
export function nextPillar(recent) {
  const last = recent.find((r) => PILLARS.includes(r.pillar))?.pillar;
  const i = last ? PILLARS.indexOf(last) : -1;
  return PILLARS[(i + 1) % PILLARS.length];
}

export async function writePost({ brandId = "operra", pillar, recent = [] }) {
  const brandDir = path.join(ROOT, "brands", brandId);
  const brand = JSON.parse(await readFile(path.join(brandDir, "brand.json"), "utf8"));
  const pillars = await readFile(path.join(brandDir, "pillars.md"), "utf8");
  const facts = await readFile(path.join(brandDir, "facts.md"), "utf8");

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

  const recentLines = recent
    .slice(0, 60)
    .map((r) => `- [${r.pillar}] ${r.headline}`)
    .join("\n") || "- (nothing yet)";

  const prompt = `You write social posts for ${brand.name} — ${brand.tagline} (${brand.site}).
The audience is hotel owners and managers in Tanzania and East Africa.

${pillars}
${topLines}
## Approved facts
You may ONLY state figures, statistics or client claims that appear here verbatim.
If you want a number that is not listed, write the post with no number at all.

${facts}

## Already posted — do not repeat these angles
${recentLines}

## Your task
Write ONE post for the pillar: **${pillar}**.

Return ONLY a JSON object with these keys:
- "eyebrow": 1-2 words, the module or theme (e.g. "Front desk", "Housekeeping"). Title case.
- "headline": max 60 characters. One concrete idea. No colons, no hype words.
- "body": 15-30 words expanding the headline. Plain, specific.
- "cta": 2-4 words (e.g. "See it work", "Book a demo").
- "caption": 40-90 words for the post itself. Opens with a hook a hotelier would recognise.
  Ends with ${brand.site}. Line breaks allowed. At most one emoji, only if it genuinely helps.
- "hashtags": array of 3-5 hashtags, relevant, no spam.
- "imagePrompt": a photographic or abstract background description. MUST specify
  "no text, no people, no logos" and a dark ${brand.colors.primary}/${brand.colors.teal} colour grade.
  The headline is laid over the left side, so keep the subject right-of-centre and low contrast.
- "template": "spotlight"

${pillar === "swahili-tip" ? "Write the headline, body and caption in natural Tanzanian Kiswahili — not translated English. Keep the eyebrow and cta in Kiswahili too." : ""}`;

  const post = await completeJson(prompt);
  return { ...post, pillar, brand: brandId };
}

/**
 * The invented-statistic guard. An unattended LLM will eventually make up a number;
 * anything numeric that is not in facts.md gets the post held for review.
 */
export async function findUnapprovedFigures(post, brandId = "operra") {
  const factsPath = path.join(ROOT, "brands", brandId, "facts.md");
  const facts = existsSync(factsPath) ? await readFile(factsPath, "utf8") : "";
  const approved = new Set(facts.match(/\d[\d.,]*/g) ?? []);

  const text = [post.headline, post.body, post.caption].filter(Boolean).join(" ");
  const found = text.match(/\d[\d.,]*\s*%?/g) ?? [];

  return [...new Set(found.map((f) => f.trim()))].filter((f) => {
    const bare = f.replace(/%$/, "").trim();
    if (approved.has(bare)) return false;
    // A bare year or a small count reads as prose, not a claim.
    if (/^(19|20)\d{2}$/.test(bare)) return false;
    if (/^\d$/.test(bare) && !f.includes("%")) return false;
    return true;
  });
}
