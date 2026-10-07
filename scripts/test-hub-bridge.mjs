// The command-center bridge, offline: a fake Telegram and a fake hub record every call.
//   node scripts/test-hub-bridge.mjs
import http from "node:http";
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import path from "node:path";

const calls = [];
let hubUpdates = [];
const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const [, side, token, method] = /^\/(tg|hub)\/bot([^/]+)\/(\w+)/.exec(req.url.split("?")[0]) ?? [];
    calls.push({ side, token, method, body: body.slice(0, 400) });
    res.setHeader("content-type", "application/json");
    if (method === "getUpdates") {
      const out = side === "hub" ? hubUpdates : [];
      hubUpdates = [];
      return res.end(JSON.stringify({ ok: true, result: out }));
    }
    res.end(JSON.stringify({ ok: true, result: { message_id: 1 } }));
  });
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;
Object.assign(process.env, {
  TELEGRAM_API_BASE: `${base}/tg`, TELEGRAM_BOT_TOKEN: "TG", TELEGRAM_CHAT_ID: "555",
  HUB_TG_BASE: `${base}/hub`, HUB_BOT_TOKEN: "HUBKEY",
});
const OFF = path.resolve(import.meta.dirname, "..", "state", "hub-offset.json");
const saved = existsSync(OFF) ? readFileSync(OFF, "utf8") : null;

try {
  const { notify } = await import("../src/notify.js");
  const { pollHub } = await import("../src/inbox.js");

  // 1. Everything said on Telegram is copied to the hub.
  await notify("<b>Draft ready</b>", { mirror: false, buttons: [[{ text: "Approve", data: "a:1" }]] });
  assert.deepEqual(calls.map((c) => `${c.side}:${c.method}`), ["tg:sendMessage", "hub:sendMessage"]);
  assert.match(calls[1].body, /Draft ready/);
  assert.match(calls[1].body, /"chat_id":"555"/);
  assert.equal(calls[1].token, "HUBKEY");

  // 2. An instruction from the hub (Ellie): echoed to Telegram, answered on both.
  calls.length = 0;
  hubUpdates = [{ update_id: 7, message: { message_id: 3, date: 1, chat: { id: 1 }, text: "/status" } }];
  const r = await pollHub();
  assert.equal(r.handled, 1);
  const seen = calls.map((c) => `${c.side}:${c.method}`);
  assert.equal(seen[0], "hub:getUpdates");
  assert.ok(calls.some((c) => c.side === "tg" && /Via the command center/.test(c.body)), "the phone sees what was asked");
  assert.ok(seen.filter((s) => s === "tg:sendMessage").length >= 2 && seen.includes("hub:sendMessage"), `answered on both: ${seen}`);
  assert.equal(JSON.parse(readFileSync(OFF, "utf8")).offset, 8);

  // 3. A button pressed in the hub is answered in the hub — never on Telegram, where
  //    the same message id is an unrelated message.
  calls.length = 0;
  hubUpdates = [{ update_id: 8, callback_query: { id: "press1", data: "zz-unknown", message: { message_id: 41, chat: { id: 1 } } } }];
  await pollHub();
  const btn = calls.filter((c) => /answerCallbackQuery|editMessage/.test(c.method));
  assert.ok(btn.length >= 2, `button calls: ${JSON.stringify(calls.map((c) => c.method))}`);
  assert.ok(btn.every((c) => c.side === "hub" && c.token === "HUBKEY"), JSON.stringify(btn));

  // 4. With no hub configured nothing reaches it.
  calls.length = 0;
  delete process.env.HUB_BOT_TOKEN;
  await notify("plain", { mirror: false });
  assert.deepEqual(calls.map((c) => c.side), ["tg"]);
  assert.equal((await pollHub()).handled, 0);
  console.log("hub bridge: ok");
} finally {
  if (saved === null) { if (existsSync(OFF)) unlinkSync(OFF); } else writeFileSync(OFF, saved);
  server.close();
}
