/** Read-only: shows pending updates without confirming them (no offset sent). */
const t = process.env.TELEGRAM_BOT_TOKEN;
const r = await fetch(`https://api.telegram.org/bot${t}/getUpdates?timeout=0`);
const j = await r.json();
const ups = j.result ?? [];
console.log(`pending updates: ${ups.length}`);
for (const u of ups) {
  const m = u.message ?? u.channel_post;
  if (!m) continue;
  console.log(`  #${u.update_id} ${new Date(m.date * 1000).toISOString()} from ${m.chat.id}: ${(m.text ?? "(non-text)").slice(0, 80)}`);
}
