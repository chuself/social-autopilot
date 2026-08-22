/**
 * How things look on a phone.
 *
 * Shared by the Telegram surfaces so /status and the daily digest cannot drift
 * apart — they were written separately and read like two different products,
 * one of them still telling the owner to go and edit state/queue.json by hand.
 */
export function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Trim to n characters on a word boundary where one is close by. */
export function clip(s, n) {
  const t = String(s).trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n - 1);
  const space = cut.lastIndexOf(" ");
  return `${space > n - 12 ? cut.slice(0, space) : cut}…`;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Everything the owner reads is East Africa Time; the runners are UTC. */
export function todayEat(now = new Date()) {
  return new Date(now.getTime() + 3 * 3600_000).toISOString().slice(0, 10);
}

/** "13:00" when it is today in EAT, "Sun 13:00" when it is not. */
export function shortWhen(iso, now = new Date()) {
  const d = new Date(new Date(iso).getTime() + 3 * 3600_000);
  const hhmm = d.toISOString().slice(11, 16);
  return d.toISOString().slice(0, 10) === todayEat(now) ? hhmm : `${DAYS[d.getUTCDay()]} ${hhmm}`;
}

/** "Sun 23 Aug", in EAT. */
export function longDay(iso) {
  const d = new Date(new Date(iso).getTime() + 3 * 3600_000);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${months[d.getUTCMonth()]}`;
}

export const formatIcon = (format) => ({ reel: "🎬", carousel: "🎠" }[format] ?? "🖼");

/**
 * One post, one line: when · what · a tag only when it tells you something a
 * time cannot. Overdue rows pass tag:false because the reason printed beneath
 * them already says it.
 */
export function slotLine(p, now = new Date(), { tag = true, time = true, withDay = true } = {}) {
  const suffix = !tag
    ? ""
    : p.status === "needs-review"
      ? " · held"
      : p.format === "reel"
        ? p.reel?.status === "ready"
          ? " · filmed"
          : " · not filmed"
        : "";
  // Under a day heading the weekday is already established, so repeating it on
  // every row ("Sun 08:00" beneath "Sun 23 Aug") is noise.
  const stamp = withDay
    ? shortWhen(p.scheduledFor, now)
    : new Date(new Date(p.scheduledFor).getTime() + 3 * 3600_000).toISOString().slice(11, 16);
  const when = time ? `<b>${stamp}</b> ` : "";
  return `${when}${formatIcon(p.format)} ${escapeHtml(clip(p.headline ?? p.id, 38))}${suffix}`;
}
