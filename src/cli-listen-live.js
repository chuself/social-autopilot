#!/usr/bin/env node
/**
 * The fast listener. Holds an open connection to Telegram and answers the
 * moment a message arrives, instead of waking on a schedule.
 *
 * GitHub only throttles `schedule:` triggers, not `workflow_dispatch`, so this
 * job runs for most of an hour and then dispatches its own successor. The
 * hourly cron stays purely as a resurrection path if that chain ever breaks.
 *
 *   LIVE_MINUTES=55 node src/cli-listen-live.js
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  botToken, readOffset, writeOffset, fetchUpdates, handleMessage, handlePhoto, handleCallback, REPLAN,
} from "./inbox.js";
import { heartbeat, lastRunTimes } from "./heartbeat.js";

const run = promisify(execFile);
const ROOT = path.resolve(import.meta.dirname, "..");

if (!botToken()) {
  console.log("TELEGRAM_BOT_TOKEN not set — nothing to listen to.");
  process.exit(0);
}

const minutes = Number(process.env.LIVE_MINUTES ?? 55);
const deadline = Date.now() + minutes * 60_000;
const POLL_SECONDS = Number(process.env.POLL_SECONDS ?? 45);

console.log(`listening for ${minutes} minutes (long poll ${POLL_SECONDS}s)…`);
let handled = 0;

// This job is the only clock that reliably ticks: GitHub throttles `schedule:`
// and on 27 August stopped firing it almost entirely — publish ran twice
// instead of twenty-four times and reel not at all, so Alice posted nothing all
// day. `workflow_dispatch` is not throttled, and this process is already alive
// around the clock, so it drives the rest. The crons stay as the resurrection
// path. Seeded from GitHub so a cron that DID fire is never duplicated.
const seen = process.env.GITHUB_ACTIONS ? await lastRunTimes() : {};
if (process.env.GITHUB_ACTIONS) {
  console.log(
    `heartbeat seeded: ${Object.entries(seen)
      .map(([k, v]) => `${k} ${v ? Math.round((Date.now() - v) / 60_000) + "m ago" : "never"}`)
      .join(", ")}`
  );
}

while (Date.now() < deadline) {
  // Before the long poll, not after: a poll that blocks for 45 seconds must
  // never be what delays a due post.
  await tick();

  let updates = [];
  try {
    updates = await fetchUpdates(await readOffset(), POLL_SECONDS);
  } catch (err) {
    // A dropped long poll is normal; wait a beat rather than spinning.
    console.warn(`poll: ${err.message}`);
    await sleep(3000);
    continue;
  }

  if (!updates.length) continue;

  const started = Date.now();
  let changed = false;
  let replan = false;
  let preview = false;
  const toDispatch = new Set();
  let newOffset = await readOffset();

  for (const u of updates) {
    newOffset = Math.max(newOffset, u.update_id + 1);

    // Three kinds of update now, not one. A button tap is a callback_query and
    // carries no `message.text`, so the old `if (!msg?.text) continue` silently
    // dropped every one of them.
    const cbq = u.callback_query;
    const msg = u.message;
    const isPhoto = Boolean(msg?.photo?.length || msg?.document);
    if (!cbq && !isPhoto && !msg?.text) continue;

    const sentAt = (cbq?.message?.date ?? msg?.date ?? Date.now() / 1000) * 1000;
    const label = cbq ? "button" : isPhoto ? "photo" : `"${msg.text.slice(0, 50)}"`;

    try {
      const r = cbq
        ? await handleCallback(cbq)
        : isPhoto
          ? await handlePhoto(msg, msg.chat.id)
          : await handleMessage(msg.text, msg.chat.id);
      changed ||= r.changed;
      replan ||= r.replan;
      preview ||= r.preview;
      for (const w of r.dispatch ?? []) toDispatch.add(w);
      handled++;
      console.log(`[${r.kind}] ${label} — answered in ${((Date.now() - sentAt) / 1000).toFixed(1)}s`);
    } catch (err) {
      console.error(`handling failed: ${err.message}`);
    }
  }

  await writeOffset(newOffset);

  // Persist immediately: a watcher that dies must not lose an instruction.
  if (changed || newOffset) await commitState();
  if (replan) await triggerReplan();
  if (preview) await dispatch("looks-preview");
  // Commands that just want a workflow run, with no state to carry.
  for (const w of toDispatch) await dispatch(w);

  console.log(`  batch done in ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

console.log(`\nshift over — handled ${handled} message(s)`);
await relaunch();

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Fire anything the schedule owes. Never throws: a heartbeat that crashes the
 * listener would take the control channel down with it, which is far worse than
 * a late post.
 */
async function tick() {
  if (!process.env.GITHUB_ACTIONS) return;
  try {
    const fired = await heartbeat(seen, { dispatch });
    if (fired.length) console.log(`  heartbeat dispatched: ${fired.join(", ")}`);
  } catch (err) {
    console.warn(`heartbeat: ${err.message.slice(0, 100)}`);
  }
}

async function git(args) {
  try {
    await run("git", args, { cwd: ROOT });
    return true;
  } catch (err) {
    console.warn(`git ${args[0]}: ${String(err.stderr ?? err.message).slice(0, 160)}`);
    return false;
  }
}

async function commitState() {
  if (!process.env.GITHUB_ACTIONS) return;
  await git(["config", "user.name", "social-autopilot"]);
  await git(["config", "user.email", "actions@users.noreply.github.com"]);
  await git(["add", "-A", "state"]);
  try {
    await run("git", ["diff", "--staged", "--quiet"], { cwd: ROOT });
    return; // nothing staged
  } catch {
    // there are staged changes — carry on
  }
  await git(["commit", "-m", "chore: from Telegram [skip ci]"]);
  await git(["pull", "--rebase", "--autostash"]);
  await git(["push"]);
}

/** Fire a workflow by name; dispatch is not throttled the way schedules are. */
async function dispatch(workflow, ...fields) {
  if (!process.env.GITHUB_ACTIONS) {
    console.log(`(would dispatch ${workflow})`);
    return false;
  }
  // Returns whether it was ACCEPTED, so the heartbeat retries next tick rather
  // than recording a run that never started.
  try {
    await run("gh", ["workflow", "run", workflow, ...fields], { cwd: ROOT });
    console.log(`  dispatched ${workflow}`);
    return true;
  } catch (e) {
    console.warn(`  ${workflow} dispatch failed: ${e.message.slice(0, 90)}`);
    return false;
  }
}

/** A routine change is only real once the schedule is rebuilt. */
async function triggerReplan() {
  if (!process.env.GITHUB_ACTIONS) {
    console.log("(replan requested — would dispatch plan-week)");
    return;
  }
  if (existsSync(path.join(ROOT, "state", "REPLAN"))) {
    await git(["rm", "-f", "--quiet", "state/REPLAN"]).catch(() => {});
    await commitState();
  }
  await run("gh", ["workflow", "run", "plan-week", "--field", "replace=1"], { cwd: ROOT })
    .then(() => console.log("  dispatched plan-week"))
    .catch((e) => console.warn(`  replan dispatch failed: ${e.message}`));
}

/**
 * Hand off to a fresh run. workflow_dispatch is not throttled, so the chain has
 * no gap — unlike the schedule that created the 45-minute wait in the first place.
 */
async function relaunch() {
  if (!process.env.GITHUB_ACTIONS || process.env.NO_RELAUNCH === "1") return;
  try {
    await run("gh", ["workflow", "run", "listen-live"], { cwd: ROOT });
    console.log("handed off to the next shift");
  } catch (err) {
    console.warn(`relaunch failed (the hourly cron will recover): ${err.message}`);
  }
}
