/**
 * Short tokens for inline buttons.
 *
 * Telegram allows 64 bytes of callback_data and rejects the ENTIRE message if
 * you exceed it — no error at send time that points at the cause, the message
 * simply never arrives. Post ids here are already 40 characters before you add
 * a verb, so the button carries an 8-character token and the real action lives
 * in state, where a later job can still resolve it.
 *
 * The listener that renders the buttons is not the job that handles the tap:
 * one shift ends, another starts, and the owner may press Approve an hour
 * later. So this is a file, not a Map.
 */
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const FILE = path.join(ROOT, "state", "actions.json");

// Long enough that nothing collides, short enough to leave room for the verb.
const TOKEN_BYTES = 4;
const MAX_AGE_DAYS = 14;

async function readAll() {
  if (!existsSync(FILE)) return {};
  try {
    return JSON.parse(await readFile(FILE, "utf8"));
  } catch {
    return {};
  }
}

async function writeAll(all) {
  // Old buttons stop working eventually; keeping every one forever would grow
  // a state file nobody prunes.
  const cutoff = Date.now() - MAX_AGE_DAYS * 86_400_000;
  const kept = Object.fromEntries(
    Object.entries(all).filter(([, v]) => new Date(v.createdAt).getTime() > cutoff)
  );
  await writeFile(FILE, JSON.stringify(kept, null, 2));
}

/**
 * Register an action and get the token to put in callback_data.
 * Identical payloads reuse the same token, so re-sending a digest does not
 * grow the file without bound.
 */
export async function registerAction(payload) {
  const all = await readAll();
  const fingerprint = createHash("sha1").update(JSON.stringify(payload)).digest("hex");
  const existing = Object.entries(all).find(([, v]) => v.fingerprint === fingerprint);
  if (existing) return existing[0];

  const token = randomBytes(TOKEN_BYTES).toString("hex");
  all[token] = { ...payload, fingerprint, createdAt: new Date().toISOString() };
  await writeAll(all);
  return token;
}

export async function resolveAction(token) {
  const all = await readAll();
  return all[token] ?? null;
}

/** Mark it used so a double-tap cannot apply the same decision twice. */
export async function consumeAction(token) {
  const all = await readAll();
  const found = all[token];
  if (!found) return null;
  if (found.usedAt) return { ...found, alreadyUsed: true };
  all[token] = { ...found, usedAt: new Date().toISOString() };
  await writeAll(all);
  return found;
}
