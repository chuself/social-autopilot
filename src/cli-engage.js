#!/usr/bin/env node
/**
 * Reads comments on recent Facebook and Instagram posts, replies to the easy
 * ones, and escalates anything that looks like a buying signal.
 *
 * Posting without reading the replies is a leaky bucket: the engagement is
 * already paid for, this is what converts it.
 *
 * Safety posture:
 *  - never replies twice to the same comment (state/replied.json)
 *  - never replies to the Page's own comments
 *  - anything classified as a lead is escalated to a human, not answered
 *  - DRY_RUN=1 classifies and logs, sends nothing
 */
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { graphGet, graphPost } from "./graph.js";
import { completeJson } from "./llm.js";
import { notify } from "./notify.js";
import { readHistory } from "./queue.js";
import { ctaLink } from "./brain.js";
import { isDryRun } from "./guards.js";

const ROOT = path.resolve(import.meta.dirname, "..");
const REPLIED = path.join(ROOT, "state", "replied.json");
const LEADS = path.join(ROOT, "state", "leads.json");
const MAX_REPLIES_PER_RUN = 10;

const token = process.env.FB_PAGE_ACCESS_TOKEN;
if (!token) throw new Error("Missing FB_PAGE_ACCESS_TOKEN");
const dryRun = isDryRun();

const brand = JSON.parse(
  await readFile(path.join(ROOT, "brands", "operra", "brand.json"), "utf8")
);
const facts = await readFile(path.join(ROOT, "brands", "operra", "facts.md"), "utf8");
const CTA = ctaLink(brand, null);

const replied = new Set(existsSync(REPLIED) ? JSON.parse(await readFile(REPLIED, "utf8")) : []);
const leads = existsSync(LEADS) ? JSON.parse(await readFile(LEADS, "utf8")) : [];

// Only look at the last 14 days — older threads are not worth waking up.
const cutoff = Date.now() - 14 * 86400_000;
const history = (await readHistory()).filter((h) => new Date(h.postedAt).getTime() > cutoff);

const comments = [];
for (const post of history) {
  try {
    comments.push(...(await fetchComments(post)));
  } catch (err) {
    console.warn(`${post.platform} ${post.postId}: ${err.message}`);
  }
}

console.log(`${comments.length} comment(s) on ${history.length} recent post(s)`);

let sent = 0;
for (const c of comments) {
  if (replied.has(c.id)) continue;
  if (c.fromPage) continue; // our own replies

  const verdict = await triage(c);
  console.log(`  [${verdict.kind}] ${c.from}: ${c.text.slice(0, 60)}`);

  if (verdict.kind === "lead") {
    leads.push({ ...c, note: verdict.reply, seenAt: new Date().toISOString() });
    await notify(
      [
        `🔥 <b>Lead on ${c.platform}</b>`,
        `<b>${escapeHtml(c.from)}</b>: ${escapeHtml(c.text)}`,
        verdict.reply ? `\n<i>${escapeHtml(verdict.reply)}</i>` : "",
        c.permalink ? `\n${c.permalink}` : "",
      ].join("\n")
    );
    // A buying signal gets a human, not a bot. Mark it so it is not re-alerted.
    replied.add(c.id);
    continue;
  }

  if (verdict.kind === "ignore" || !verdict.reply) {
    replied.add(c.id);
    continue;
  }

  const safe = sanitiseReply(verdict.reply, c);
  if (!safe) {
    console.log("  reply withheld (unsafe content) — escalated instead");
    await notify(
      `🤖 <b>Held a reply on ${c.platform}</b>
<b>${escapeHtml(c.from)}</b>: ${escapeHtml(c.text)}

The drafted reply invented a detail, so nothing was posted.`
    );
    replied.add(c.id);
    continue;
  }
  verdict.reply = safe;

  if (sent >= MAX_REPLIES_PER_RUN) {
    console.log("  reply cap reached for this run");
    break;
  }

  if (dryRun) {
    console.log(`  [dry-run] would reply: ${verdict.reply}`);
  } else {
    try {
      await graphPost(`${c.id}/comments`, { message: verdict.reply, access_token: token });
      console.log(`  replied`);
    } catch (err) {
      console.error(`  reply failed: ${err.message}`);
      continue;
    }
  }
  replied.add(c.id);
  sent++;
}

if (!dryRun) {
  await writeFile(REPLIED, JSON.stringify([...replied].slice(-2000), null, 2));
  await writeFile(LEADS, JSON.stringify(leads.slice(-500), null, 2));
}
console.log(`\n${sent} repl(ies) sent, ${leads.length} lead(s) on file`);

async function fetchComments(post) {
  if (post.platform === "facebook") {
    const j = await graphGet(`${post.postId}/comments`, {
      fields: "id,message,from{name},created_time,permalink_url",
      limit: "50",
      access_token: token,
    });
    return (j.data ?? []).map((c) => ({
      id: c.id,
      platform: "facebook",
      text: c.message ?? "",
      from: c.from?.name ?? "someone",
      permalink: c.permalink_url,
      fromPage: c.from?.id === process.env.FB_PAGE_ID,
    }));
  }
  const j = await graphGet(`${post.postId}/comments`, {
    fields: "id,text,username,timestamp",
    limit: "50",
    access_token: token,
  });
  return (j.data ?? []).map((c) => ({
    id: c.id,
    platform: "instagram",
    text: c.text ?? "",
    from: c.username ?? "someone",
    permalink: null,
    fromPage: false,
  }));
}

/**
 * Decide what a comment is. Errs towards silence: on any failure the comment is
 * left alone rather than answered wrongly in public.
 */
async function triage(c) {
  if (!c.text.trim()) return { kind: "ignore" };
  try {
    return await completeJson(
      `You handle the public comments for Operra, a hotel management system in Tanzania.

## The only things you may state as fact
${facts}

NEVER state a price, a phone number, a statistic, or a feature that is not listed above.
NEVER invent contact details — a contact link is appended to your reply automatically.
If you do not know, say you will follow up.

A ${c.platform} user "${c.from}" commented:
"""${c.text}"""

Return ONLY JSON:
{ "kind": "lead" | "question" | "praise" | "ignore", "reply": "under 40 words" }

- "lead" = they want pricing, a demo, to buy, or say they run a hotel and are interested.
  Put a short note to the owner in "reply" instead of a public answer.
- "question" = a genuine question about what Operra does. Answer it helpfully and invite
  them to WhatsApp. Never invent features, prices or numbers — if you do not know, say
  you will follow up.
- "praise" = a compliment or emoji. Reply warmly in one short line.
- "ignore" = spam, abuse, or unrelated.

Reply in the same language they wrote in — most will be Kiswahili.`
    );
  } catch (err) {
    console.warn(`  triage failed, leaving it alone: ${err.message}`);
    return { kind: "ignore" };
  }
}

/**
 * A public reply is the one place a hallucination is expensive and permanent.
 * Anything that looks like a phone number or a price gets the whole reply
 * withheld rather than patched — a wrong number is worse than no reply.
 */
function sanitiseReply(reply, c) {
  const text = String(reply).trim();
  if (!text) return null;

  const phoneish = /(\+?\d[\d\s().-]{6,})/;           // 7+ digits in a run
  const priceish = /(tsh|tzs|usd|\$|shilingi)\s*[\d,.]+/i;
  const approved = new Set(facts.match(/\d[\d.,]*/g) ?? []);

  if (phoneish.test(text) || priceish.test(text)) return null;

  // Any other figure must be one facts.md actually approves.
  for (const n of text.match(/\d[\d.,]*/g) ?? []) {
    if (!approved.has(n) && !/^\d$/.test(n)) return null;
  }

  // The real contact route is appended here, never written by the model.
  const withCta = c && CTA && !text.includes("wa.me") ? `${text}
${CTA}` : text;
  return withCta.slice(0, 600);
}

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
