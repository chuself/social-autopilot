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
import { graphGet, graphPost, graphBatch } from "./graph.js";
import { completeJson } from "./llm.js";
import { notify, notifyOnce, clearAlert } from "./notify.js";
import { ctaLink } from "./brain.js";
import { isDryRun } from "./guards.js";

const ROOT = path.resolve(import.meta.dirname, "..");
const REPLIED = path.join(ROOT, "state", "replied.json");
// Without "from" we cannot tell our own comments apart, so we remember the ids
// of every reply we post and skip them.
const OURS = path.join(ROOT, "state", "our-comments.json");
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
const ours = new Set(existsSync(OURS) ? JSON.parse(await readFile(OURS, "utf8")) : []);

// How far back to look for comments.
//
// This used to be one Graph call PER POST, every 30 minutes: 34 posts, ~1,300
// calls a day, almost all returning nothing, from data-centre IPs. Meta
// flagged the developer account for unusual activity three days in.
//
// Comments come back nested inside the feed, so the whole account is two
// sub-requests in one HTTP call however many posts there are. Reading a
// two-week-old post every half hour buys nothing either: comments land within
// a day or they do not land.
const WINDOW_DAYS = Number(process.env.ENGAGE_WINDOW_DAYS ?? 7);
const PAGE_LIMIT = Number(process.env.ENGAGE_PAGE_LIMIT ?? 25);
const now = Date.now();
const cutoff = now - WINDOW_DAYS * 86400_000;

const comments = [];
const denied = new Set();
// One real error per platform. The alert used to assert a cause without ever
// looking at what Meta actually said.
const deniedWhy = new Map();

const fbFields = `id,created_time,comments.limit(50){id,message,created_time,permalink_url}`;
const igFields = `id,timestamp,comments.limit(50){id,text,username,timestamp}`;

const feeds = [
  {
    platform: "facebook",
    relative_url: `${process.env.FB_PAGE_ID}/feed?fields=${encodeURIComponent(fbFields)}&limit=${PAGE_LIMIT}`,
    stamp: (n) => n.created_time,
  },
];
if (process.env.IG_USER_ID) {
  feeds.push({
    platform: "instagram",
    relative_url: `${process.env.IG_USER_ID}/media?fields=${encodeURIComponent(igFields)}&limit=${PAGE_LIMIT}`,
    stamp: (n) => n.timestamp,
  });
}

let scanned = 0;
try {
  const results = await graphBatch(feeds.map((x) => ({ relative_url: x.relative_url })), token);
  results.forEach((r, i) => {
    const feed = feeds[i];
    if (!r.ok) {
      // A permissions failure reads exactly like "nobody commented" unless it
      // is called out — which is how this went unnoticed for a day.
      denied.add(feed.platform);
      if (!deniedWhy.has(feed.platform)) deniedWhy.set(feed.platform, r.error ?? "unknown");
      return;
    }
    for (const node of r.body?.data ?? []) {
      const when = new Date(feed.stamp(node) ?? 0).getTime();
      if (when && when < cutoff) continue;
      scanned++;
      comments.push(...shapeComments(feed.platform, node));
    }
  });
} catch (err) {
  // The batch itself failed: auth or a block, not one bad post.
  for (const feed of feeds) {
    denied.add(feed.platform);
    if (!deniedWhy.has(feed.platform)) deniedWhy.set(feed.platform, err.message);
  }
}

console.log(
  `${feeds.length} feed read(s) in 1 batch call covered ${scanned} post(s) from the last ${WINDOW_DAYS}d`
);
if (denied.size) {
  const why = [...deniedWhy.values()].join(" ");
  const where = [...denied].join(" and ");

  // Two faults produce the identical symptom and need OPPOSITE actions, and
  // guessing wrong costs a day: this alert used to assert "the token is missing
  // scopes" every time and send the owner to the Graph Explorer to regenerate a
  // token that was perfectly fine, while Meta had blocked the whole app.
  //
  // Telling them apart takes one request. A missing COMMENT scope still leaves
  // the Page readable; a blocked app or a dead token fails on everything. So
  // ask for the most basic field on the Page and see whether even that is
  // refused. Uses nothing CI does not already have.
  let pageReadable = null;
  try {
    await graphGet(process.env.FB_PAGE_ID, { fields: "id", access_token: token });
    pageReadable = true;
  } catch (probe) {
    pageReadable = false;
    console.error(`page probe also failed: ${probe.message.slice(0, 120)}`);
  }

  const msg = pageReadable
    ? `🔒 <b>Comment replies are switched off</b>
` +
      `Reading comments on <b>${where}</b> is denied, but the Page itself still answers — so this is the ` +
      `comment permissions specifically.

` +
      `Grant <code>pages_read_user_content</code>, <code>pages_manage_engagement</code> and ` +
      `<code>instagram_manage_comments</code>, then re-run <code>scripts/exchange-token.js</code>.`
    : `🚫 <b>Facebook and Instagram are cut off</b>
` +
      `Not just comments — <b>nothing can post</b>. Even reading the Page id is refused, so the ` +
      `token is not the cause and regenerating it will not help.

` +
      `Check <b>developers.facebook.com</b> → your app → the alert banner. This is normally an ` +
      `overdue Data Use Checkup, a verification step, or the app being taken out of Live mode. ` +
      `Everything returns on its own once that is cleared.`;

  console.error(`DENIED on ${where} (page readable: ${pageReadable}): ${why.slice(0, 140)}`);
  // Every 30 minutes for days is how a bot teaches its owner to ignore it.
  await notifyOnce(pageReadable ? "comments-denied" : "meta-cut-off", msg, { hours: 12 });
} else {
  // Recovered — let the next failure speak up immediately.
  await clearAlert("comments-denied");
  await clearAlert("meta-cut-off");
}

console.log(`${comments.length} comment(s) found${denied.size ? " (some denied)" : ""}`);

let sent = 0;
// Our own CTA comment, recognised by CONTENT as well as by id.
// Ids are the real mechanism, but cli-publish was discarding the id of the
// link comment it posts, so Alice read her own call to action as an inbound
// buying signal and escalated it to the owner. Twice. Content matching costs
// nothing and means one missed id can never do that again.
const ctaNumber = String(process.env.WHATSAPP_CTA_NUMBER ?? "").replace(/D/g, "");
function isOurOwn(c) {
  if (c.fromPage) return true;
  const t = String(c.text ?? "");
  if (!t.trim()) return false;
  if (ctaNumber && t.replace(/D/g, "").includes(ctaNumber)) return true;
  if (t.includes("wa.me/")) return true;
  if (brand.site && t.includes(brand.site)) return true;
  return false;
}

for (const c of comments) {
  if (replied.has(c.id)) continue;
  if (isOurOwn(c)) {
    // Remember it so it is not re-examined every half hour.
    ours.add(c.id);
    replied.add(c.id);
    continue;
  }

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
      const posted = await graphPost(`${c.id}/comments`, { message: verdict.reply, access_token: token });
      if (posted?.id) ours.add(posted.id);
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
  await writeFile(OURS, JSON.stringify([...ours].slice(-2000), null, 2));
  await writeFile(LEADS, JSON.stringify(leads.slice(-500), null, 2));
}
console.log(`\n${sent} repl(ies) sent, ${leads.length} lead(s) on file`);

/** Pull our own shape out of one feed node, comments already nested inside. */
function shapeComments(platform, node) {
  const rows = node?.comments?.data ?? [];
  if (platform === "facebook") {
    return rows.map((c) => ({
      id: c.id,
      platform: "facebook",
      text: c.message ?? "",
      // No "from": Meta blocks the commenter s identity on Page posts, and
      // asking for it fails the WHOLE request.
      from: "someone",
      permalink: c.permalink_url,
      postId: node.id,
      fromPage: ours.has(c.id),
    }));
  }
  return rows.map((c) => ({
    id: c.id,
    platform: "instagram",
    text: c.text ?? "",
    from: c.username ?? "someone",
    permalink: null,
    postId: node.id,
    fromPage: ours.has(c.id),
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
