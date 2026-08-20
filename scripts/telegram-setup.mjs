/**
 * Finds your chat id after you have messaged the bot once.
 *   TELEGRAM_BOT_TOKEN=... node scripts/telegram-setup.mjs
 */
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error("Set TELEGRAM_BOT_TOKEN");

const me = await (await fetch(`https://api.telegram.org/bot${token}/getMe`)).json();
if (!me.ok) throw new Error(`Bad token: ${me.description}`);
console.log(`bot: @${me.result.username} (${me.result.first_name})`);

const updates = await (await fetch(`https://api.telegram.org/bot${token}/getUpdates`)).json();
const chats = new Map();
for (const u of updates.result ?? []) {
  const m = u.message ?? u.channel_post;
  if (m?.chat) chats.set(m.chat.id, m.chat);
}
if (!chats.size) {
  console.log("\nNo messages yet. Open Telegram, send your bot any message, then re-run this.");
} else {
  for (const [id, chat] of chats) {
    console.log(`TELEGRAM_CHAT_ID: ${id}  (${chat.type}: ${chat.title ?? chat.first_name ?? ""})`);
  }
}
