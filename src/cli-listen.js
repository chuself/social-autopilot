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
import { updateConfig, readConfig, LIMITS } from "./config.js";

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
let settingsChanged = false;

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
  } else if (lower === "/replan") {
    await writeFile(path.join(ROOT, "state", "REPLAN"), "requested from Telegram\n");
    await notify("🔁 Re-planning the schedule now — this takes a few minutes.");
    settingsChanged = true;
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
        "Or change the routine:",
        "• <i>post 3 times a day</i>   • <i>post at 8, 13 and 19</i>",
        "• <i>3 reels a week</i>      • <i>2 posters a day and 1 reel a day</i>",
        "",
        "/status — what is queued",
        "/replan — redo the schedule now",
        "/pause — stop posting   /resume — start again",
        "/clear — forget my instructions",
      ].join("\n")
    );
  } else {
    // Not everything typed at a bot is an instruction. "Hey" and "what's planned?"
    // are conversation; storing them as standing rules would slowly poison the brief.
    const intent = await classify(text);

    if (intent.kind === "setting") {
      const { changes, rejected } = await updateConfig(intent.settings ?? {});
      const parts = [];
      if (changes.length) parts.push(`⚙️ <b>Routine updated</b>\n• ${changes.join("\n• ")}`);
      if (rejected.length) parts.push(`❌ Not applied: ${rejected.join("; ")}`);
      if (!changes.length && !rejected.length) parts.push("Nothing to change — already set that way.");
      parts.push("\nTakes effect on the next plan. Send /replan to redo the schedule now.");
      await notify(parts.join("\n"));
      if (changes.length) {
        settingsChanged = true;
        await writeFile(path.join(ROOT, "state", "REPLAN"), "routine changed\n");
      }
    } else if (intent.kind === "instruction") {
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
if (settingsChanged) console.log("SETTINGS_CHANGED");

async function statusText() {
  const queue = await readQueue();
  const cfgNow = await readConfig();
  const now = new Date();
  const upcoming = queue
    .filter((p) => p.status !== "posted" && p.status !== "reject" && new Date(p.scheduledFor) >= now)
    .sort((a, b) => new Date(a.scheduledFor) - new Date(b.scheduledFor));
  const paused = existsSync(path.join(ROOT, "state", "PAUSED"));
  const lines = [
    `📊 <b>Status</b>${paused ? " — ⏸ PAUSED" : ""}`,
    `${upcoming.length} queued · ${queue.filter((p) => p.status === "posted").length} posted all time`,
    `Routine: ${cfgNow.postsPerDay}/day at ${cfgNow.postHours.map((h) => `${h}:00`).join(", ")} · ${cfgNow.reelsPerWeek} reels/week`,
    "",
  ];
  for (const p of upcoming.slice(0, 8)) {
    lines.push(`• ${eat(p.scheduledFor)} [${p.language ?? "--"}] ${p.headline}`);
  }
  if (existsSync(STEER)) {
    lines.push("", "<b>Your standing instructions:</b>", escapeHtml(await readFile(STEER, "utf8")).trim());
  }
  return lines.join("\n");
}

/** Render a stored UTC timestamp in East Africa Time. */
function eat(iso) {
  const d = new Date(new Date(iso).getTime() + 3 * 3600_000);
  return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)}`;
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
  const cfg = await readConfig();
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

Current routine: ${cfg.postsPerDay} poster(s) per day at ${cfg.postHours.map((h) => `${h}:00`).join(", ")} EAT,
and ${cfg.reelsPerWeek} reel(s) per week.

Classify the message and reply. Return ONLY JSON:
{
  "kind": "setting" | "instruction" | "question" | "chat",
  "settings": { "postsPerDay": number, "postHours": [numbers], "reelsPerWeek": number },
  "reply": "under 60 words, plain text"
}

- "setting" = it changes HOW OFTEN or WHEN to post. Fill "settings" with the new values.
  * postsPerDay = still IMAGE posters, max ${LIMITS.maxPostsPerDay} per day.
  * reelsPerWeek = VIDEO reels, counted per WEEK, max ${LIMITS.maxReelsPerWeek}.
    If they say "2 reels a day", convert to per week (2 x 7 = 14).
  * postHours are 24h local, between ${LIMITS.minHour} and ${LIMITS.maxHour}.
  If they say "3 a day" with no times, spread them sensibly across the day.
  Omit any field they did not ask to change.

- "instruction" = it changes how future posts are WRITTEN or what they cover (tone,
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
