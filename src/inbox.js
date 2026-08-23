/**
 * Telegram inbox logic, shared by the scheduled batch job (cli-listen.js) and
 * the long-lived watcher (cli-listen-live.js).
 *
 * One implementation on purpose: the watcher exists only to shorten the wait,
 * never to behave differently from the safety-net job.
 */
import { readFile, writeFile, appendFile, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { notify } from "./notify.js";
import { readQueue, writeQueue, whyWaiting } from "./queue.js";
import { escapeHtml, clip, slotLine, todayEat } from "./format.js";
import { completeJson } from "./llm.js";
import { updateConfig, readConfig, LIMITS } from "./config.js";

const ROOT = path.resolve(import.meta.dirname, "..");
export const STEER = path.join(ROOT, "state", "steer.md");
export const OFFSET = path.join(ROOT, "state", "telegram-offset.json");
export const PAUSED = path.join(ROOT, "state", "PAUSED");
export const REPLAN = path.join(ROOT, "state", "REPLAN");
export const PENDING_CHANGE = path.join(ROOT, "state", "pending-change.json");
export const PREVIEW_LOOKS = path.join(ROOT, "state", "PREVIEW_LOOKS");
/** Photos that have arrived but not yet been looked at by the photo job. */
export const PHOTO_QUEUE = path.join(ROOT, "state", "photo-queue.json");
/** A Rewrite button was tapped; the next message is the note explaining why. */
export const PENDING_REWRITE = path.join(ROOT, "state", "pending-rewrite.json");

export function botToken() {
  return process.env.TELEGRAM_BOT_TOKEN;
}

export async function readOffset() {
  if (!existsSync(OFFSET)) return 0;
  try {
    return JSON.parse(await readFile(OFFSET, "utf8")).offset ?? 0;
  } catch {
    return 0;
  }
}

export async function writeOffset(offset) {
  await writeFile(OFFSET, JSON.stringify({ offset }, null, 2));
}

/**
 * @param {number} offset
 * @param {number} timeoutSec  0 = return immediately; >0 = hold the connection
 *   open until something arrives. Long polling is what removes the wait.
 */
export async function fetchUpdates(offset, timeoutSec = 0) {
  const res = await fetch(
    `https://api.telegram.org/bot${botToken()}/getUpdates?offset=${offset}&timeout=${timeoutSec}`,
    { signal: AbortSignal.timeout((timeoutSec + 20) * 1000) }
  );
  const json = await res.json();
  if (!json.ok) throw new Error(`getUpdates failed: ${json.description}`);
  return json.result ?? [];
}

/**
 * Handle one message. Returns what changed so the caller can decide whether
 * state needs committing and whether a replan should be triggered.
 */
export async function handleMessage(text, chatId) {
  const owner = String(process.env.TELEGRAM_CHAT_ID ?? "");
  if (owner && String(chatId) !== owner) {
    return { kind: "ignored", changed: false, replan: false };
  }

  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  // They tapped Rewrite and this is the note. It must be caught BEFORE the
  // classifier, which would happily file "make it shorter" as a standing
  // instruction for every future post rather than a change to this one.
  if (existsSync(PENDING_REWRITE) && !lower.startsWith("/")) {
    const { postId } = JSON.parse(await readFile(PENDING_REWRITE, "utf8"));
    await unlink(PENDING_REWRITE);
    const queue = await readQueue();
    const post = queue.find((p) => p.id === postId);
    if (!post) {
      await notify("That post is gone now, so I have dropped the note.");
      return { kind: "command", changed: true, replan: false };
    }
    post.rewriteNote = trimmed;
    post.status = "needs-review";
    await writeQueue(queue);
    await notify(`✏️ Redoing <b>${escapeHtml(clip(post.headline ?? post.id, 45))}</b> — ${escapeHtml(trimmed)}`);
    return { kind: "instruction", changed: true, replan: false, dispatch: ["rewrite"] };
  }

  // A change that was held for confirmation is applied only on an explicit yes.
  if (existsSync(PENDING_CHANGE)) {
    const held = JSON.parse(await readFile(PENDING_CHANGE, "utf8"));
    const yes = /^(yes|y|ndio|ndiyo|sawa|confirm|do it|go ahead|proceed)/i.test(trimmed);
    const no = /^(no|hapana|cancel|stop|leave it|forget it)/i.test(trimmed);

    if (yes) {
      await unlink(PENDING_CHANGE);
      const { changes, rejected } = await updateConfig({ ...held.patch, confirmed: true });
      await notify(
        changes.length
          ? `✅ Confirmed.\n• ${changes.join("\n• ")}\n\nSend /replan to rebuild the schedule.`
          : `Nothing changed. ${rejected.join("; ")}`
      );
      return { kind: "setting", changed: changes.length > 0, replan: false };
    }
    if (no) {
      await unlink(PENDING_CHANGE);
      await notify("👍 Left as it was.");
      return { kind: "command", changed: true, replan: false };
    }
    // Anything else: the question still stands, so re-ask rather than losing it.
    await notify(
      `⏳ Still waiting on this one:\n${escapeHtml(held.why)}\n\nReply <b>yes</b> to go ahead, or <b>no</b> to leave it.`
    );
    return { kind: "chat", changed: false, replan: false };
  }

  if (lower === "/pause") {
    await writeFile(PAUSED, "paused from Telegram\n");
    await notify("⏸ Publishing paused. Send /resume to start again.");
    return { kind: "command", changed: true, replan: false };
  }
  if (lower === "/resume") {
    if (existsSync(PAUSED)) await unlink(PAUSED);
    await notify("▶️ Publishing resumed.");
    return { kind: "command", changed: true, replan: false };
  }
  if (lower === "/status") {
    await notify(await statusText());
    return { kind: "command", changed: false, replan: false };
  }
  if (lower === "/replan") {
    await writeFile(REPLAN, "requested from Telegram\n");
    await notify("🔁 Re-planning now — this takes a few minutes.");
    return { kind: "command", changed: true, replan: true };
  }
  if (lower === "/looks" || lower === "/preview") {
    await writeFile(PREVIEW_LOOKS, "requested from Telegram\n");
    await notify("🎨 Rendering every look — the sheet lands here in a couple of minutes.");
    return { kind: "command", changed: true, replan: false, preview: true };
  }
  if (lower === "/clear") {
    if (existsSync(STEER)) await unlink(STEER);
    await notify("🧹 Standing instructions cleared.");
    return { kind: "command", changed: true, replan: false };
  }
  if (lower === "/preflight" || lower === "/check" || lower === "/doctor") {
    await notify("\u{1F50E} Running preflight - the report lands here in a couple of minutes.");
    return { kind: "command", changed: false, replan: false, dispatch: ["preflight"] };
  }
  if (lower.startsWith("/start") || lower.startsWith("/help")) {
    await notify(helpText());
    return { kind: "command", changed: false, replan: false };
  }

  // An unrecognised slash command must never reach the classifier. `/preflight`
  // was read as a question and answered with a friendly paragraph, so the check
  // never ran and nothing said it hadn't. A command that does not exist should
  // say so.
  if (lower.startsWith("/")) {
    await notify(`I don't know <b>${escapeHtml(trimmed.split(/\s/)[0])}</b>.\n\n${helpText()}`);
    return { kind: "command", changed: false, replan: false };
  }

  // Not everything typed at a bot is an instruction. "Hey" and "what's planned?"
  // are conversation; storing them as standing rules would poison the brief.
  const intent = await classify(trimmed);

  if (intent.kind === "setting") {
    const { changes, rejected, needsConfirmation } = await updateConfig(intent.settings ?? {});

    // Held, not applied: some changes break something quietly a week later, and
    // the owner deserves to hear why before it happens rather than after.
    if (needsConfirmation) {
      await writeFile(
        PENDING_CHANGE,
        JSON.stringify({ patch: intent.settings, ...needsConfirmation, askedAt: new Date().toISOString() }, null, 2)
      );
      await notify(
        `⚠️ <b>Before I change that</b>\n${escapeHtml(needsConfirmation.why)}\n\n` +
          `Reply <b>yes</b> to do it anyway, or <b>no</b> to leave it as it is.`
      );
      return { kind: "setting", changed: true, replan: false };
    }
    const parts = [];
    if (changes.length) parts.push(`⚙️ <b>Routine updated</b>\n• ${changes.join("\n• ")}`);
    if (rejected.length) parts.push(`❌ Not applied: ${rejected.join("; ")}`);
    if (!changes.length && !rejected.length) parts.push("Nothing to change — already set that way.");
    parts.push("\nSend /replan to rebuild the schedule now.");
    await notify(parts.join("\n"));
    if (changes.length) await writeFile(REPLAN, "routine changed\n");
    return { kind: "setting", changed: changes.length > 0, replan: changes.length > 0 };
  }

  if (intent.kind === "instruction") {
    const stamp = new Date().toISOString().slice(0, 10);
    await appendFile(STEER, `- (${stamp}) ${trimmed}\n`, "utf8");
    await notify(`✅ Noted. From the next plan onward:\n<i>${escapeHtml(trimmed)}</i>`);
    return { kind: "instruction", changed: true, replan: false };
  }

  if (intent.kind === "preview") {
    await writeFile(PREVIEW_LOOKS, "requested from Telegram\n");
    await notify("🎨 Rendering every look — the sheet lands here in a couple of minutes.");
    return { kind: "preview", changed: true, replan: false, preview: true };
  }

  if (intent.kind === "question") {
    await notify(intent.reply ? escapeHtml(intent.reply) : await statusText());
    return { kind: "question", changed: false, replan: false };
  }

  await notify(escapeHtml(intent.reply ?? "👍"));
  return { kind: "chat", changed: false, replan: false };
}

/**
 * A photograph arrived.
 *
 * The listener stays deliberately light: it has no ffmpeg and no browser, and
 * its whole value is answering in seconds. So it takes the file off Telegram —
 * where the download URL expires within the hour — acknowledges, and hands the
 * probing, the vision pass and the render to a job that has the tools.
 */
export async function handlePhoto(msg, chatId) {
  const owner = String(process.env.TELEGRAM_CHAT_ID ?? "");
  if (owner && String(chatId) !== owner) return { kind: "ignored", changed: false };

  // `photo` is Telegram's own re-encode in several sizes, largest last, always
  // JPEG with orientation already applied. A `document` is the untouched
  // original, which may be HEIC, enormous, or not an image at all.
  const asPhoto = msg.photo?.[msg.photo.length - 1];
  const asDoc = msg.document?.mime_type?.startsWith("image/") ? msg.document : null;
  const file = asPhoto ?? asDoc;

  if (!file) {
    await notify("That is not something I can use as a picture. Send a photo and I will fit it to the post.");
    return { kind: "chat", changed: false };
  }

  const { downloadTelegramFile } = await import("./notify.js");
  const dest = path.join(ROOT, "state", "media", "incoming", `${file.file_unique_id}.bin`);

  try {
    await downloadTelegramFile(file.file_id, dest);
  } catch (err) {
    await notify(`I could not download that photo — ${escapeHtml(err.message.slice(0, 80))}`);
    return { kind: "chat", changed: false };
  }

  const pending = existsSync(PHOTO_QUEUE) ? JSON.parse(await readFile(PHOTO_QUEUE, "utf8")) : [];
  if (!pending.some((p) => p.uniqueId === file.file_unique_id)) {
    pending.push({
      uniqueId: file.file_unique_id,
      fileId: file.file_id,
      path: path.relative(ROOT, dest).replace(/\\/g, "/"),
      caption: (msg.caption ?? "").trim() || null,
      brand: process.env.BRAND_ID ?? "operra",
      receivedAt: new Date().toISOString(),
      status: "new",
    });
    await writeFile(PHOTO_QUEUE, JSON.stringify(pending, null, 2));
  }

  await notify("📷 Got it — working out where it fits.");
  return { kind: "photo", changed: true, replan: false, dispatch: ["photo"] };
}

/**
 * A button was tapped.
 *
 * Buttons outlive the shift that drew them, so the verb and its target come
 * from state/actions.json rather than from the 64 bytes Telegram allows.
 * Every branch answers the callback first: Telegram spins for a few seconds
 * and then reports the tap as failed, whatever we do afterwards.
 */
export async function handleCallback(cbq) {
  const { answerCallback, clearButtons } = await import("./notify.js");
  const owner = String(process.env.TELEGRAM_CHAT_ID ?? "");
  if (owner && String(cbq.message?.chat?.id) !== owner) {
    await answerCallback(cbq.id, "Not for you.");
    return { kind: "ignored", changed: false };
  }

  const { consumeAction } = await import("./actions.js");
  const action = await consumeAction(cbq.data);

  if (!action) {
    await answerCallback(cbq.id, "That button has expired.");
    await clearButtons(cbq.message.chat.id, cbq.message.message_id);
    return { kind: "command", changed: false };
  }
  if (action.alreadyUsed) {
    await answerCallback(cbq.id, "Already done.");
    await clearButtons(cbq.message.chat.id, cbq.message.message_id);
    return { kind: "command", changed: false };
  }

  const result = await applyDecision(action);
  await answerCallback(cbq.id, result.toast);
  await clearButtons(cbq.message.chat.id, cbq.message.message_id);
  if (result.say) await notify(result.say);
  return {
    kind: "command",
    changed: true,
    replan: false,
    dispatch: result.dispatch ?? [],
  };
}

/**
 * One place where every button verb is applied, so the two listeners cannot
 * drift and a new button cannot half-work.
 */
async function applyDecision(action) {
  const { readQueue, writeQueue } = await import("./queue.js");

  switch (action.verb) {
    // ── the approval flow, shared by photos and the nightly digest ──────────
    case "approve": {
      const queue = await readQueue();
      const post = queue.find((p) => p.id === action.postId);
      if (!post) return { toast: "That post is gone." };
      post.status = "pending";
      post.approvedAt = new Date().toISOString();
      delete post.heldFigures;
      await writeQueue(queue);
      return { toast: "Approved", say: `✅ Approved — <b>${escapeHtml(clip(post.headline ?? post.id, 45))}</b> goes out at ${shortWhenSafe(post)}.` };
    }
    case "reject": {
      const queue = await readQueue();
      const post = queue.find((p) => p.id === action.postId);
      if (!post) return { toast: "That post is gone." };
      post.status = "reject";
      post.rejectedAt = new Date().toISOString();
      await writeQueue(queue);
      return { toast: "Rejected", say: `🚫 Dropped — <b>${escapeHtml(clip(post.headline ?? post.id, 45))}</b> will not go out.` };
    }
    case "rewrite": {
      const queue = await readQueue();
      const post = queue.find((p) => p.id === action.postId);
      if (!post) return { toast: "That post is gone." };
      post.status = "needs-review";
      post.rewriteRequested = new Date().toISOString();
      await writeQueue(queue);
      // The next thing they type is the note, so remember what it is about.
      await writeFile(PENDING_REWRITE, JSON.stringify({ postId: post.id, askedAt: new Date().toISOString() }, null, 2));
      return {
        toast: "Tell me what to change",
        say: `✏️ What should change about <b>${escapeHtml(clip(post.headline ?? post.id, 45))}</b>?\nReply with the note and I will redo just this one.`,
      };
    }

    // Opt in to deciding each post by hand for one day, without changing the
    // routine. Holding them at needs-review means the hourly publisher will not
    // take them while they wait for an answer.
    case "review-each": {
      const queue = await readQueue();
      const held = [];
      for (const id of action.ids ?? []) {
        const post = queue.find((p) => p.id === id);
        if (!post || post.status === "posted" || post.status === "reject") continue;
        post.status = "needs-review";
        held.push(post);
      }
      if (!held.length) return { toast: "Nothing left to review." };
      await writeQueue(queue);

      const { registerAction } = await import("./actions.js");
      const { sendPhoto } = await import("./notify.js");
      for (const p of held) {
        const file = path.join(ROOT, "public", `${p.id}.png`);
        const decision = [
          [
            { text: "✅ Post it", data: await registerAction({ verb: "approve", postId: p.id }) },
            { text: "🚫 Drop it", data: await registerAction({ verb: "reject", postId: p.id }) },
          ],
          [{ text: "✏️ Rewrite", data: await registerAction({ verb: "rewrite", postId: p.id }) }],
        ];
        const caption = `<b>${shortWhenSafe(p)}</b> ${escapeHtml(clip(p.headline ?? p.id, 60))}`;
        if (existsSync(file)) await sendPhoto(file, caption, { buttons: decision });
        else await notify(caption, { buttons: decision, mirror: false });
      }
      return { toast: `${held.length} held for your decision`, say: null };
    }

    // ── photo placement, the first of the two confirmations ────────────────
    case "photo-use": {
      const queue = await readQueue();
      const post = queue.find((p) => p.id === action.postId);
      if (!post) return { toast: "That post is gone." };
      const pending = existsSync(PHOTO_QUEUE) ? JSON.parse(await readFile(PHOTO_QUEUE, "utf8")) : [];
      const row = pending.find((p) => p.uniqueId === action.uniqueId);
      if (row) {
        row.status = "apply";
        row.targetPostId = action.postId;
        await writeFile(PHOTO_QUEUE, JSON.stringify(pending, null, 2));
      }
      return {
        toast: "Putting it on that post",
        say: "🖼 Applying it — I will send the finished post for a last look.",
        dispatch: ["photo"],
      };
    }
    case "photo-save": {
      const pending = existsSync(PHOTO_QUEUE) ? JSON.parse(await readFile(PHOTO_QUEUE, "utf8")) : [];
      const row = pending.find((p) => p.uniqueId === action.uniqueId);
      if (row) {
        row.status = "saved";
        await writeFile(PHOTO_QUEUE, JSON.stringify(pending, null, 2));
      }
      return {
        toast: "Saved",
        say: "💾 Kept it in your pictures. Tell me which post to use it on whenever you like.",
      };
    }
    case "photo-other": {
      return {
        toast: "Which one?",
        say: await pickSlotMessage(action.uniqueId),
      };
    }
    default:
      return { toast: "I do not know that button." };
  }
}

/** Offer the upcoming slots as buttons so a photo can be moved to another one. */
async function pickSlotMessage(uniqueId) {
  const { readQueue } = await import("./queue.js");
  const { registerAction } = await import("./actions.js");
  const queue = await readQueue();
  const now = new Date();
  const open = queue
    .filter((p) => p.status !== "posted" && p.status !== "reject" && p.status !== "missed" && new Date(p.scheduledFor) >= now)
    .sort((a, b) => new Date(a.scheduledFor) - new Date(b.scheduledFor))
    .slice(0, 6);

  if (!open.length) return "Nothing is queued to put it on. I have kept the photo.";

  const buttons = [];
  for (const p of open) {
    const token = await registerAction({ verb: "photo-use", uniqueId, postId: p.id });
    buttons.push([{ text: `${shortWhenSafe(p)} ${clip(p.headline ?? p.id, 28)}`, data: token }]);
  }
  await notify("Which post should it go on?", { buttons, mirror: false });
  return null;
}

function shortWhenSafe(p) {
  try {
    return new Date(new Date(p.scheduledFor).getTime() + 3 * 3600_000).toISOString().slice(11, 16);
  } catch {
    return "its slot";
  }
}

function helpText() {
  return [
    "<b>Just talk to me.</b>",
    "<i>less formal, write like WhatsApp</i>",
    "<i>push the POS module this week</i>",
    "<i>3 posters and 1 reel at 8, 13, 16 and 20</i>",
    "",
    "/status — what is out, what is not, and why",
    "/preflight — check everything, report faults",
    "/looks — every visual look side by side",
    "/replan — rebuild the schedule now",
    "/pause · /resume — stop and start posting",
    "/clear — forget my standing instructions",
  ].join("\n");
}

export async function statusText() {
  const queue = await readQueue();
  const cfg = await readConfig();
  const now = new Date();
  const open = queue.filter(
    (p) => p.status !== "posted" && p.status !== "reject" && p.status !== "missed"
  );
  // Anything whose time has passed but which has not gone out is the FIRST
  // thing the owner wants to see — "what is the queue waiting for" was asked
  // over and over while the answer sat in an Actions log nobody could read.
  const overdue = open
    .filter((p) => new Date(p.scheduledFor) < now)
    .sort((a, b) => new Date(a.scheduledFor) - new Date(b.scheduledFor));
  const upcoming = open
    .filter((p) => new Date(p.scheduledFor) >= now)
    .sort((a, b) => new Date(a.scheduledFor) - new Date(b.scheduledFor));

  const postedToday = queue.filter(
    (p) => p.status === "posted" && String(p.postedAt ?? p.scheduledFor).slice(0, 10) === todayEat()
  ).length;

  const lines = [];
  lines.push(
    existsSync(PAUSED)
      ? "⏸ <b>Paused</b> — nothing will post until /resume"
      : `📊 <b>${postedToday} out today · ${open.length} to go</b>`
  );

  // Overdue first and in full: this is the only part anyone is anxious about.
  if (overdue.length) {
    lines.push("", "⚠️ <b>Not out yet</b>");
    for (const p of overdue.slice(0, 4)) {
      lines.push(`${slotLine(p, now, { tag: false })}\n<i>${escapeHtml(whyWaiting(p, now))}</i>`);
    }
    if (overdue.length > 4) lines.push(`<i>+${overdue.length - 4} more</i>`);
  }

  // Upcoming is one line each. The time already says when, so a "due in 3h"
  // under every row is noise; only a reel's filming state earns a tag.
  if (upcoming.length) {
    lines.push("", "<b>Next</b>");
    for (const p of upcoming.slice(0, 5)) lines.push(slotLine(p, now));
    if (upcoming.length > 5) lines.push(`<i>+${upcoming.length - 5} more</i>`);
  } else if (!overdue.length) {
    lines.push("", "<i>Nothing queued. The 21:00 planner writes tomorrow.</i>");
  }

  // Standing instructions shape every post, so their presence belongs here —
  // but as one line, not the whole file. /status is a glance, not an archive.
  if (existsSync(STEER)) {
    const all = (await readFile(STEER, "utf8")).split("\n").filter((l) => l.trim());
    const last = all[all.length - 1]?.replace(/^-\s*/, "") ?? "";
    lines.push(
      "",
      `✍️ <i>${escapeHtml(clip(last, 60))}</i>${all.length > 1 ? ` <i>(+${all.length - 1} more)</i>` : ""}`
    );
  }

  lines.push("", `<i>${escapeHtml(describeRoutine(cfg))}</i>`);
  return lines.join("\n");
}


export function describeRoutine(cfg) {
  if (Array.isArray(cfg.slots) && cfg.slots.length) {
    return cfg.slots.map((s) => `${s.hour}:00 ${s.format}`).join(" · ");
  }
  return `${cfg.postsPerDay}/day at ${(cfg.postHours ?? []).map((h) => `${h}:00`).join(", ")} · ${cfg.reelsPerWeek} reels/week`;
}

/** Render a stored UTC timestamp in East Africa Time. */
export function eat(iso) {
  const d = new Date(new Date(iso).getTime() + 3 * 3600_000);
  return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)}`;
}

// Re-exported so existing callers keep working; it lives in format.js now.
export { escapeHtml };

/**
 * Decide whether a message changes the routine, changes the writing, asks
 * something, or is just chat. On any failure it is treated as chat — a misread
 * must never silently rewrite the brief.
 */
async function classify(text) {
  const queue = await readQueue();
  const cfg = await readConfig();
  // Include WHY each one is still sitting there. Without it the model was
  // asked "what is the queue waiting for?" and could only guess from a list of
  // headlines, so it answered confidently and wrongly.
  const upcoming = queue
    .filter((p) => p.status !== "posted" && p.status !== "reject")
    .slice(0, 10)
    .map(
      (p) =>
        `- ${eat(p.scheduledFor)} EAT [${p.language ?? "--"}] ${p.format ?? "poster"}: ${p.headline}` +
        ` — ${whyWaiting(p)}`
    )
    .join("\n");

  try {
    return await completeJson(
      `You are the assistant behind an automated social media account for Operra, a hotel
management system in Tanzania. The owner sent you this on Telegram:

"""${text}"""

Currently queued:
${upcoming || "(nothing queued)"}

Current routine: ${describeRoutine(cfg)}
Looks preview: ${existsSync(PREVIEW_LOOKS) ? "one is being rendered right now" : "none in progress; the last one was already sent"}

Classify the message and reply. Return ONLY JSON:
{
  "kind": "setting" | "instruction" | "preview" | "question" | "chat",
  "settings": { "slots": [ { "hour": number, "format": "poster" | "reel" } ], "tiktokPerDay": number },
  "reply": "under 35 words, plain text"
}

## How your reply should read
It is read on a phone, usually one-handed, usually while busy.
- Lead with the answer. No "Sure!", no "Great question", no restating the question.
- One or two short sentences. Break to a new line rather than writing a long one.
- Concrete over vague: times, counts and names, not "shortly" or "a few".
- No markdown, no asterisks, no bullet characters — plain sentences only.
- If the answer is a time, give it in EAT.

- "setting" = it changes HOW OFTEN, WHEN, or IN WHAT FORMAT to post. Return the FULL
  desired day as "slots" — one entry per post, each with its hour and its format.
  Example: "3 posters and 1 reel a day at 8, 13, 16 and 20" becomes
  [{"hour":8,"format":"poster"},{"hour":13,"format":"poster"},
   {"hour":16,"format":"reel"},{"hour":20,"format":"poster"}].
  Hours are 24h local, between ${LIMITS.minHour} and ${LIMITS.maxHour}.
  At most ${LIMITS.maxSlotsPerDay ?? 6} slots per day. If they name fewer hours than
  posts, spread the extras sensibly. Reply confirming the new day.
  * tiktokPerDay = how many reels go to TikTok per day. Default and recommended
    is 1, because the free Metricool allowance is 20 a month. Set it only if the
    owner explicitly asks about TikTok frequency.
- "instruction" = it changes how posts are WRITTEN or what they cover (tone, wording,
  language, topics to push or avoid). Reply confirming what changed.
- "preview" = they are ASKING YOU TO MAKE one now ("show me the looks",
  "nionyeshe designs", "send the looks"). It must be a REQUEST.
  Asking about one already under way — "is it done?", "did you send it?",
  "imefika?" — is a "question", NOT a preview. Re-rendering because someone asked
  whether it finished is a loop; answer them instead.
- "question" = they are asking something else. Answer it using the queue above.
- "chat" = greeting or small talk. Reply briefly and naturally.

## Language of YOUR reply
Reply in the SAME language the owner wrote in, above.
The queued posts below are mostly Kiswahili — that is the CONTENT language and
has nothing to do with how you answer. If the owner writes English, answer in
English. Judge only from their message.`,
      { fast: true }
    );
  } catch (err) {
    console.warn(`  classify failed, treating as chat: ${err.message}`);
    return { kind: "chat", reply: null };
  }
}
