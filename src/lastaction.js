/**
 * The last thing Alice did that a person might immediately want undone.
 *
 * Alice had no idea what she had just done. A photo was applied to a post, the
 * owner replied "Cancel that use the original post", and because there was no
 * notion of a thing-in-flight the classifier read an imperative sentence and
 * filed it as a STANDING INSTRUCTION — a permanent rule handed to the writer
 * for every future post. The post it was meant to cancel stayed held until it
 * was closed as missed twenty hours later.
 *
 * So anything reversible is recorded here with what it would take to reverse
 * it, and "cancel that" is answered by undoing it rather than by writing it
 * down forever.
 */
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const FILE = path.join(ROOT, "state", "last-action.json");

/** Past this, "cancel that" almost certainly means something else. */
export const UNDO_WINDOW_MIN = Number(process.env.UNDO_WINDOW_MIN ?? 180);

export async function recordAction(action) {
  await writeFile(FILE, JSON.stringify({ ...action, at: new Date().toISOString() }, null, 2));
}

export async function readAction() {
  if (!existsSync(FILE)) return null;
  try {
    return JSON.parse(await readFile(FILE, "utf8"));
  } catch {
    return null;
  }
}

/** The last action, only if it is recent enough to be what they mean. */
export async function undoableAction(now = Date.now()) {
  const a = await readAction();
  if (!a || a.undone) return null;
  if (now - new Date(a.at).getTime() > UNDO_WINDOW_MIN * 60_000) return null;
  return a;
}

export async function markUndone() {
  const a = await readAction();
  if (!a) return;
  await writeFile(FILE, JSON.stringify({ ...a, undone: true, undoneAt: new Date().toISOString() }, null, 2));
}

/**
 * Is this "undo what you just did"?
 *
 * Deliberately narrow and in both languages. A false positive undoes something
 * the owner wanted; a false negative just falls through to the normal path.
 */
export function readsAsUndo(text) {
  const t = String(text).trim().toLowerCase();
  if (t.length > 90) return false;
  return /\b(cancel|undo|revert|scrap|discard|forget (that|it)|never ?mind|take (it|that) (back|off)|remove (it|that)|acha|ghairi|futa|sitaki|usitumie)\b/.test(t);
}

/**
 * Is this a passing remark rather than a durable rule?
 *
 * A standing instruction is handed to the writer for EVERY future post, so the
 * bar has to be high. "Post it now" and "Cancel that use the original post"
 * both ended up in the brief this way. Anything pointing at a specific thing
 * that is happening right now — that, this, it, hii, hiyo — is about a moment,
 * not about how the brand writes.
 */
export function readsAsTransient(text) {
  const t = String(text).trim().toLowerCase();
  if (readsAsUndo(t)) return true;
  // A bare command about timing or a specific item.
  if (/^(post|publish|send|do|run|try|use|make|change|fix|redo|repeat)\b.*\b(it|that|this|them|hii|hiyo|hilo)\b/.test(t)) return true;
  if (/\b(now|sasa|leo|immediately|right away|again|tena)\b/.test(t) && t.split(/\s+/).length <= 6) return true;
  // Pure deixis with no subject of its own: "that one", "the original post".
  if (/^(that|this|it|hiyo|hii)\b/.test(t)) return true;
  return false;
}
