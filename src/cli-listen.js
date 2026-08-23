#!/usr/bin/env node
/**
 * Safety-net inbox check: process whatever is waiting, once, then exit.
 *
 * The fast path is cli-listen-live.js, which long-polls and answers in seconds.
 * This runs on a schedule so a message still lands if that chain ever breaks.
 */
import {
  botToken, readOffset, writeOffset, fetchUpdates, handleMessage, handlePhoto, handleCallback,
} from "./inbox.js";

if (!botToken()) {
  console.log("TELEGRAM_BOT_TOKEN not set — nothing to listen to.");
  process.exit(0);
}

const offset = await readOffset();
const updates = await fetchUpdates(offset, 0);

if (!updates.length) {
  console.log("no new messages");
  process.exit(0);
}

let newOffset = offset;
let replan = false;
let handled = 0;
const toDispatch = new Set();

for (const u of updates) {
  newOffset = Math.max(newOffset, u.update_id + 1);

  // Same three kinds as the live listener. The recovery path must handle a
  // button tap and a photo too, or a message sent while the chain is down is
  // acknowledged by nobody.
  const cbq = u.callback_query;
  const msg = u.message;
  const isPhoto = Boolean(msg?.photo?.length || msg?.document);
  if (!cbq && !isPhoto && !msg?.text) continue;

  const r = cbq
    ? await handleCallback(cbq)
    : isPhoto
      ? await handlePhoto(msg, msg.chat.id)
      : await handleMessage(msg.text, msg.chat.id);
  replan ||= r.replan;
  for (const w of r.dispatch ?? []) toDispatch.add(w);
  handled++;
  console.log(`[${r.kind}] ${cbq ? "button" : isPhoto ? "photo" : msg.text.slice(0, 60)}`);
}

await writeOffset(newOffset);
console.log(`processed ${updates.length} update(s), ${handled} message(s)`);
if (replan) console.log("REPLAN_REQUESTED");

// The safety-net path must honour the same commands as the live listener, or a
// /preflight sent while the chain is down is answered and then quietly dropped.
for (const w of toDispatch) {
  if (!process.env.GITHUB_ACTIONS) {
    console.log(`(would dispatch ${w})`);
    continue;
  }
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  await promisify(execFile)("gh", ["workflow", "run", w])
    .then(() => console.log(`dispatched ${w}`))
    .catch((e) => console.warn(`${w} dispatch failed: ${e.message}`));
}
