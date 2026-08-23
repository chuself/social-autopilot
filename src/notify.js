/**
 * Outbound alerts. Telegram is the control channel (it can receive replies);
 * WhatsApp is an optional mirror for whoever lives in WhatsApp all day.
 *
 * Everything no-ops silently when unconfigured, so the pipeline never fails
 * just because notifications are not set up yet.
 */
const API = "https://api.telegram.org/bot";

export function notifyConfigured() {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

export function whatsappConfigured() {
  return Boolean(
    (process.env.CALLMEBOT_PHONE && process.env.CALLMEBOT_APIKEY) ||
      (process.env.WA_PHONE_NUMBER_ID && process.env.WA_TOKEN && process.env.WA_TO)
  );
}

/**
 * @param {string} text  HTML for Telegram; tags are stripped for WhatsApp.
 * @param {object} opts
 *   silent   — no push sound on Telegram
 *   mirror   — also send to WhatsApp (default true; noisy internals pass false)
 */
export async function notify(text, { silent = false, mirror = true, buttons = null } = {}) {
  let ok = false;

  if (notifyConfigured()) {
    ok = await sendTelegram(text, silent, buttons);
  } else {
    console.log(`[notify skipped — Telegram not configured]\n${text}`);
  }

  // A WhatsApp failure must never mask a delivered Telegram alert.
  if (mirror && whatsappConfigured()) {
    try {
      await sendWhatsApp(stripHtml(text));
    } catch (err) {
      console.error(`WhatsApp mirror failed: ${err.message}`);
    }
  }
  return ok;
}

/**
 * @param {Array<Array<{text: string, data: string}>>|null} buttons
 *   Rows of inline buttons. `data` must be <= 64 bytes — Telegram silently
 *   rejects the whole message otherwise — so callers pass a short token and
 *   look the real action up in state/actions.json.
 */
function keyboard(buttons) {
  if (!buttons?.length) return undefined;
  return {
    inline_keyboard: buttons.map((row) =>
      row.map((b) => ({ text: b.text, callback_data: b.data.slice(0, 64) }))
    ),
  };
}

async function sendTelegram(text, silent, buttons) {
  const res = await fetch(`${API}${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: process.env.TELEGRAM_CHAT_ID,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      disable_notification: silent,
      reply_markup: keyboard(buttons),
    }),
  });
  const json = await res.json();
  if (!json.ok) {
    console.error(`Telegram failed: ${json.description ?? res.status}`);
    return false;
  }
  return true;
}

/**
 * Stop the spinner on a tapped button. Telegram shows one for a few seconds and
 * then marks the tap as failed, so this has to happen before any slow work.
 */
export async function answerCallback(callbackId, text = "") {
  if (!process.env.TELEGRAM_BOT_TOKEN) return false;
  const res = await fetch(`${API}${process.env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackId, text: text.slice(0, 200) }),
  });
  return (await res.json()).ok === true;
}

/** Take the buttons off a message once its decision has been made. */
export async function clearButtons(chatId, messageId, newText = null) {
  if (!process.env.TELEGRAM_BOT_TOKEN) return false;
  const base = `${API}${process.env.TELEGRAM_BOT_TOKEN}`;
  const body = { chat_id: chatId, message_id: messageId };
  const endpoint = newText ? "editMessageText" : "editMessageReplyMarkup";
  if (newText) {
    body.text = newText;
    body.parse_mode = "HTML";
    body.disable_web_page_preview = true;
  }
  body.reply_markup = { inline_keyboard: [] };
  const res = await fetch(`${base}/${endpoint}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  // "message is not modified" is a success for our purposes, not a failure.
  if (!json.ok && !/not modified/i.test(json.description ?? "")) {
    console.error(`clearButtons failed: ${json.description ?? res.status}`);
    return false;
  }
  return true;
}

/**
 * Download a file the owner sent. Telegram hands back a path, not the bytes,
 * and the path expires within the hour — so fetch it now, not later.
 */
export async function downloadTelegramFile(fileId, destPath) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");

  const meta = await (await fetch(`${API}${token}/getFile?file_id=${encodeURIComponent(fileId)}`)).json();
  if (!meta.ok) throw new Error(`getFile failed: ${meta.description}`);

  const res = await fetch(`https://api.telegram.org/file/bot${token}/${meta.result.file_path}`);
  if (!res.ok) throw new Error(`file download returned ${res.status}`);

  const { writeFile, mkdir } = await import("node:fs/promises");
  const path = await import("node:path");
  await mkdir(path.dirname(destPath), { recursive: true });
  await writeFile(destPath, Buffer.from(await res.arrayBuffer()));
  return { path: destPath, size: meta.result.file_size ?? 0, remote: meta.result.file_path };
}

/**
 * Two WhatsApp routes:
 *  - CallMeBot: free, one-way, third-party relay. Good enough for alerts.
 *  - Meta Cloud API: official and reliable, but a message sent more than 24h
 *    after your last inbound needs a paid template, so it is opt-in.
 */
async function sendWhatsApp(text) {
  const body = text.slice(0, 900);

  if (process.env.WA_PHONE_NUMBER_ID && process.env.WA_TOKEN && process.env.WA_TO) {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${process.env.WA_PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${process.env.WA_TOKEN}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: process.env.WA_TO,
          type: "text",
          text: { body },
        }),
      }
    );
    const json = await res.json();
    if (json.error) throw new Error(json.error.message);
    return true;
  }

  const url =
    `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(process.env.CALLMEBOT_PHONE)}` +
    `&text=${encodeURIComponent(body)}&apikey=${encodeURIComponent(process.env.CALLMEBOT_APIKEY)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`CallMeBot HTTP ${res.status}`);
  return true;
}

/**
 * Deliver a finished video to Telegram so it can be posted by hand where no
 * automatic route exists (TikTok, until an audited path is in place).
 * Telegram fetches the file itself, so the URL must be public and under ~20MB.
 */
export async function sendVideo(videoUrl, caption) {
  if (!notifyConfigured()) {
    console.log(`[video not sent — Telegram not configured] ${videoUrl}`);
    return false;
  }
  const res = await fetch(`${API}${process.env.TELEGRAM_BOT_TOKEN}/sendVideo`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: process.env.TELEGRAM_CHAT_ID,
      video: videoUrl,
      caption: caption.slice(0, 1000),
      parse_mode: "HTML",
      supports_streaming: true,
    }),
  });
  const json = await res.json();
  if (!json.ok) {
    console.error(`sendVideo failed: ${json.description ?? res.status}`);
    // Fall back to a plain link — better a link than nothing.
    await notify(`${caption}

${videoUrl}`, { mirror: false });
    return false;
  }
  return true;
}

/**
 * Send a local image straight to Telegram as an upload.
 *
 * Uploading beats hosting it first: no Pages deploy, no waiting for a CDN, and
 * a preview nobody keeps does not belong in the public asset folder.
 */
export async function sendPhoto(filePath, caption, { buttons = null } = {}) {
  if (!notifyConfigured()) {
    console.log(`[photo not sent — Telegram not configured] ${filePath}`);
    return false;
  }
  const { readFile } = await import("node:fs/promises");
  const path = await import("node:path");
  const bytes = await readFile(filePath);

  const form = new FormData();
  form.append("chat_id", process.env.TELEGRAM_CHAT_ID);
  form.append("caption", (caption ?? "").slice(0, 1000));
  form.append("parse_mode", "HTML");
  const markup = keyboard(buttons);
  if (markup) form.append("reply_markup", JSON.stringify(markup));
  form.append("photo", new Blob([bytes], { type: "image/png" }), path.basename(filePath));

  const res = await fetch(`${API}${process.env.TELEGRAM_BOT_TOKEN}/sendPhoto`, {
    method: "POST",
    body: form,
  });
  const json = await res.json();
  if (!json.ok) {
    console.error(`sendPhoto failed: ${json.description ?? res.status}`);
    return false;
  }
  return true;
}

/**
 * Say it once, not every half hour.
 *
 * A job that runs every 30 minutes and alerts on a condition that lasts days
 * sends dozens of identical messages, and the owner learns to ignore the bot.
 * Re-sends only when the message CHANGES or the window lapses, so a genuine
 * change of state still gets through immediately.
 *
 * @param {string} key    what this alert is about, e.g. "comments-denied"
 * @param {number} hours  how long to stay quiet about an unchanged message
 */
export async function notifyOnce(key, text, { hours = 12, ...opts } = {}) {
  const { readFile, writeFile, mkdir } = await import("node:fs/promises");
  const { existsSync } = await import("node:fs");
  const pathMod = await import("node:path");
  const { createHash } = await import("node:crypto");

  const root = pathMod.resolve(import.meta.dirname, "..");
  const file = pathMod.join(root, "state", "alerts.json");

  let seen = {};
  if (existsSync(file)) {
    try {
      seen = JSON.parse(await readFile(file, "utf8"));
    } catch {
      seen = {};
    }
  }

  const fingerprint = createHash("sha1").update(text).digest("hex").slice(0, 12);
  const prev = seen[key];
  const fresh = prev && Date.now() - new Date(prev.at).getTime() < hours * 3600_000;
  if (prev && prev.fingerprint === fingerprint && fresh) {
    console.log(`[alert "${key}" suppressed — unchanged, last sent ${prev.at}]`);
    return false;
  }

  const ok = await notify(text, opts);
  seen[key] = { fingerprint, at: new Date().toISOString() };
  await mkdir(pathMod.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(seen, null, 2));
  return ok;
}

/** Clear the memory of an alert so the next occurrence speaks up again. */
export async function clearAlert(key) {
  const { readFile, writeFile } = await import("node:fs/promises");
  const { existsSync } = await import("node:fs");
  const pathMod = await import("node:path");
  const file = pathMod.resolve(import.meta.dirname, "..", "state", "alerts.json");
  if (!existsSync(file)) return;
  try {
    const seen = JSON.parse(await readFile(file, "utf8"));
    if (seen[key]) {
      delete seen[key];
      await writeFile(file, JSON.stringify(seen, null, 2));
    }
  } catch {
    /* a corrupt alert log must never break a job */
  }
}

/** Failures must be loud — this is how an unattended pipeline asks for help. */
export async function notifyFailure(what, err) {
  // 500 characters of stack trace on a phone is unreadable and tells the owner
  // nothing they can act on. One line of cause, and the log has the rest.
  const cause = String(err).split("\n")[0].slice(0, 140);
  await notify(`⚠️ <b>${escapeHtml(what)}</b>\n<code>${escapeHtml(cause)}</code>`);
}

function stripHtml(s) {
  return s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
