/**
 * Delete rendered assets nobody needs any more.
 *
 * Every poster PNG and reel MP4 is committed so that Pages keeps serving it,
 * because a Pages deploy uploads whatever `public/` holds in the checkout. That
 * is correct while a post is waiting to go out — Instagram fetches the file
 * server-side — and pointless for ever afterwards: both platforms keep their
 * own copy the moment they publish.
 *
 * Nothing had ever removed them, so the repository reached 173 MB with 105 MB
 * of `public/`. Every workflow clones it, so the weight is paid on every single
 * run, and fetches had started failing outright.
 *
 * Honest about what this does NOT do: git keeps deleted blobs in history, so
 * this stops the growth rather than reversing it. Shrinking what is already
 * there means rewriting history, which is a separate and far riskier decision.
 *
 *   node scripts/prune-assets.mjs              # show what would go
 *   node scripts/prune-assets.mjs --apply      # actually delete
 *   node scripts/prune-assets.mjs --days 14 --apply
 */
import { readFile, unlink, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APPLY = process.argv.includes("--apply");

// indexOf returns -1 when the flag is absent, and argv[0] is the node binary,
// so the obvious one-liner yields NaN — and `Date.now() - NaN` is NaN, which
// every comparison fails, which would have deleted yesterday's assets.
const flag = process.argv.indexOf("--days");
const raw = flag > -1 ? process.argv[flag + 1] : process.env.PRUNE_DAYS;
// Seven days is four times the longest window anything here operates on: the
// planner looks 36 hours ahead, a due post is closed after 6 hours and a held
// one after 14. Once a post is published both platforms hold their own copy, so
// the file is dead weight the moment its slot has passed.
const days = Number.isFinite(Number(raw)) && Number(raw) > 0 ? Number(raw) : 7;

const queue = JSON.parse(await readFile(path.join(ROOT, "state", "queue.json"), "utf8"));
const cutoff = Date.now() - days * 86_400_000;

/**
 * A post is finished when nothing will ever publish it again. `missed` and
 * `reject` count: they are closed, not pending.
 */
const FINISHED = new Set(["posted", "reject", "missed"]);

/** Every file a post owns, whatever format it is. */
function assetsOf(p) {
  const files = [];
  if (p.slideFiles?.length) files.push(...p.slideFiles.map((f) => path.join("public", f)));
  else files.push(path.join("public", `${p.id}.png`));
  if (p.reel?.file) files.push(path.join("public", p.reel.file));
  if (p.backgroundPath) files.push(p.backgroundPath);
  else files.push(path.join("state", "bg", `${p.id}.png`));
  return files.map((f) => f.replace(/\\/g, "/"));
}

// Anything an unfinished post might still need is untouchable, no matter how
// old it looks. A post held for review for a week still has to render.
const keep = new Set();
for (const p of queue) {
  if (!FINISHED.has(p.status)) assetsOf(p).forEach((f) => keep.add(f));
}

const doomed = [];
for (const p of queue) {
  if (!FINISHED.has(p.status)) continue;
  const when = new Date(p.postedAt ?? p.missedAt ?? p.scheduledFor ?? 0).getTime();
  if (!when || when > cutoff) continue;

  for (const f of assetsOf(p)) {
    if (keep.has(f)) continue;
    const abs = path.join(ROOT, f);
    if (!existsSync(abs)) continue;
    let size = 0;
    try {
      size = (await stat(abs)).size;
    } catch {
      continue;
    }
    doomed.push({ file: f, size, id: p.id, age: Math.round((Date.now() - when) / 86_400_000) });
  }
}

const total = doomed.reduce((a, b) => a + b.size, 0);
const mb = (n) => `${(n / 1e6).toFixed(1)} MB`;

if (!doomed.length) {
  console.log(`nothing older than ${days} days to prune`);
  process.exit(0);
}

for (const d of doomed) {
  console.log(`  ${APPLY ? "deleted" : "would delete"}  ${d.file.padEnd(58)} ${mb(d.size).padStart(9)}  ${d.age}d`);
  if (APPLY) await unlink(path.join(ROOT, d.file)).catch(() => {});
}

console.log(
  `\n${doomed.length} file(s), ${mb(total)} — from ${new Set(doomed.map((d) => d.id)).size} finished post(s) older than ${days} days`
);
console.log(`${keep.size} file(s) kept for posts still in flight`);
if (!APPLY) console.log("\nnothing was deleted. re-run with --apply");
