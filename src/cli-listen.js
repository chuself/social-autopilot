#!/usr/bin/env node
/**
 * Telegram inbox. Reads what you sent the bot and turns it into standing
 * instructions the brain obeys — so you steer the feed by chatting, not by
 * editing code.
 *
 * Plain message  -> appended to state/steer.md, used on every future plan
 * /pause         -> stops all publishing (creates state/PAUSED)
 * /resume        -> clears it
 * /status        -> replies with what is queued
 * /clear         -> wipes the standing instructions
 *
 * Runs on a schedule; Telegram holds messages for 24h so nothing is missed.
 */
import { readFile, writeFile, appendFile, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { notify } from "./notify.js";
import { readQueue } from "./queue.js";
import { completeJson } from "./llm.js";

const ROOT = path.resolve(import.meta.dirname, "..");
const STEER = path.join(ROOT, "state", "steer.md");
const OFFSET = path.join(ROOT, "state", "telegram-offset.json");
const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  console.log("TELEGRAM_BOT_TOKEN not set — nothing to listen to.");
  process.exit(0);
}

const offset = existsSync(OFFSET) ? JSON.parse(await readFile(OFFSET, "utf8")).offset : 0;
const res = await fetch(
  `https://api.telegram.org/bot${token}/getUpdates?offset=${offset}&timeout=0`
);
const json = await res.json();
if (!json.ok) throw new Error(`getUpdates failed: ${json.description}`);

const updates = json.result ?? [];
if (!updates.length) {
  console.log("no new messages");
  process.exit(0);
}

// Only the configured owner can steer the feed.
const owner = String(process.env.TELEGRAM_CHAT_ID ?? "");
let lastUpdateId = offset;
let added = 0;

for (const u of updates) {
  lastUpdateId = Math.max(lastUpdateId, u.update_id + 1);
  const msg = u.message;
  if (!msg?.text) continue;
  if (owner && String(msg.chat.id) !== owner) {
    console.log(`ignoring message from ${msg.chat.id} (not the owner)`);
    continue;
  }

  const text = msg.text.trim();
  const lower = text.toLowerCase();

  if (lower === "/pause") {
    await writeFile(path.join(ROOT, "state", "PAUSED"), "paused from Telegram\n");
    await notify("⏸ Publishing paused. Send /resume to start again.");
  } else if (lower === "/resume") {
    const p = path.join(ROOT, "state", "PAUSED");
    if (existsSync(p)) await unlink(p);
    await notify("▶️ Publishing resumed.");
  } else if (lower === "/status") {
    await notify(await statusText());
  } else if (lower === "/clear") {
    if (existsSync(STEER)) await unlink(STEER);
    await notify("🧹 Standing instructions cleared.");
  } else if (lower.startsWith("/start") || lower.startsWith("/help")) {
    await notify(
      [
        "Send me plain text and I will write in that style from now on.",
        "",
        "Examples:",
        "• <i>less formal, write like WhatsApp</i>",
        "• <i>push the POS module this week</i>",
        "• <i>stop using the word \"seamless\"</i>",
        "",
        "/status — what is queued",
        "/pause — stop posting   /resume — start again",
        "/clear — forget my instructions",
      ].join("\n")
    );
  } else {
    // Not everything typed at a bot is an instruction. "Hey" and "what's planned?"
    // are conversation; storing them as standing rules would slowly poison the brief.
    const intent = await classify(text);

    if (intent.kind === "instruction") {
      const stamp = new Date().toISOString().slice(0, 10);
      await appendFile(STEER, `- (${stamp}) ${text}\n`, "utf8");
      added++;
      await notify(`✅ Noted. From the next plan onward:\n<i>${escapeHtml(text)}</i>`);
    } else if (intent.kind === "question") {
      await notify(intent.reply ? escapeHtml(intent.reply) : await statusText());
    } else {
      await notify(escapeHtml(intent.reply ?? "👍"));
    }
  }
}

await writeFile(OFFSET, JSON.stringify({ offset: lastUpdateId }, null, 2));
console.log(`processed ${updates.length} update(s), ${added} new instruction(s)`);

async function statusText() {
  const queue = await readQueue();
  const now = new Date();
  const upcoming = queue
    .filter((p) => p.status !== "posted" && p.status !== "reject" && new Date(p.scheduledFor) >= now)
    .sort((a, b) => new Date(a.scheduledFor) - new Date(b.scheduledFor));
  const paused = existsSync(path.join(ROOT, "state", "PAUSED"));
  const lines = [
    `📊 <b>Status</b>${paused ? " — ⏸ PAUSED" : ""}`,
    `${upcoming.length} queued · ${queue.filter((p) => p.status === "posted").length} posted all time`,
    "",
  ];
  for (const p of upcoming.slice(0, 8)) {
    lines.push(`• ${p.scheduledFor.slice(0, 10)} [${p.language ?? "--"}] ${p.headline}`);
  }
  if (existsSync(STEER)) {
    lines.push("", "<b>Your standing instructions:</b>", escapeHtml(await readFile(STEER, "utf8")).trim());
  }
  return lines.join("\n");
}

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Decide whether a message changes how posts are written, asks something, or is
 * just chat. On any failure it is treated as chat — a misread must never
 * silently rewrite the brief.
 */
async function classify(text) {
  const queue = await readQueue();
  const upcoming = queue
    .filter((p) => p.status !== "posted" && p.status !== "reject")
    .slice(0, 10)
    .map((p) => `- ${p.scheduledFor?.slice(0, 10)} [${p.language ?? "--"}] ${p.headline}`)
    .join("\n");

  try {
    return await completeJson(
      `You are the assistant behind an automated social media poster for Operra, a hotel
management system in Tanzania. The owner sent you this on Telegram:

"""${text}"""

Currently queued to post:
${upcoming || "(nothing queued)"}

Classify the message and reply. Return ONLY JSON:
{ "kind": "instruction" | "question" | "chat", "reply": "under 60 words, plain text" }

- "instruction" = it changes how future posts are written or what they cover (tone,
  wording, language, topics to push or avoid). Reply confirming what changed.
- "question" = they are asking something. Answer it using the queue above.
- "chat" = greeting or small talk. Reply briefly and naturally.

Reply in the same language they wrote in.`
    );
  } catch (err) {
    console.warn(`classify failed: ${err.message}`);
    return { kind: "chat", reply: null };
  }
}
