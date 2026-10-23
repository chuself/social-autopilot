/**
 * What GitHub's copy of the state says RIGHT NOW, read just before posting.
 *
 * Each job works from the checkout it started with. On 2026-10-23 a publish
 * run queued behind the reel job's lock started from a copy taken before the
 * reel job posted, posted the same reel again, and its save erased the record:
 * the 13:00 and 16:00 reels each went out twice and the history showed once.
 * The receipt check used the job's own stale history, so it saw nothing.
 *
 * This reads origin/main's history at the moment of posting. Outside Actions,
 * or if git cannot be reached, it returns [] and the local check still applies.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const run = promisify(execFile);
const ROOT = path.resolve(import.meta.dirname, "..");

export async function upstreamHistory() {
  if (!process.env.GITHUB_ACTIONS) return [];
  try {
    await run("git", ["fetch", "-q", "origin", "main"], { cwd: ROOT, timeout: 30_000 });
    const { stdout } = await run("git", ["show", "origin/main:state/history.json"], { cwd: ROOT, maxBuffer: 1 << 26 });
    const rows = JSON.parse(stdout);
    return Array.isArray(rows) ? rows : [];
  } catch (err) {
    console.warn(`  upstream history unavailable (${String(err.message).slice(0, 80)}); using the local copy only`);
    return [];
  }
}
