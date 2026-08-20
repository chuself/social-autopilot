/**
 * Telegram notifications. Silently does nothing when unconfigured, so the
 * pipeline never fails just because notifications are not set up yet.
 */
const API = "https://api.telegram.org/bot";

export function notifyConfigured() {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

export async function notify(text, { silent = false } = {}) {
  if (!notifyConfigured()) {
    console.log(`[notify skipped — Telegram not configured]\n${text}`);
    return false;
  }
  const res = await fetch(`${API}${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: process.env.TELEGRAM_CHAT_ID,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      disable_notification: silent,
    }),
  });
  const json = await res.json();
  if (!json.ok) {
    console.error(`Telegram failed: ${json.description ?? res.status}`);
    return false;
  }
  return true;
}

/** Failures must be loud — this is how an unattended pipeline asks for help. */
export async function notifyFailure(what, err) {
  await notify(`⚠️ <b>Social Autopilot</b>\n${what}\n\n<code>${escapeHtml(String(err).slice(0, 500))}</code>`);
}

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
