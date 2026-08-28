#!/usr/bin/env node
/**
 * Turn photographs the owner sent into finished posts.
 *
 * Two passes over state/photo-queue.json, because placing someone's photograph
 * on their brand's feed is confirmed TWICE and the confirmations happen in
 * different jobs:
 *
 *   status "new"    → probe it, look at it, guess which post it belongs to,
 *                     render a preview and ask "use it here?"      (confirm 1)
 *   status "apply"  → render it for real into public/, hold the post at
 *                     needs-review and ask "post it?"              (confirm 2)
 *
 * Only the post that received a photo is gated like this. Everything else in
 * the queue carries on automatically, exactly as before.
 */
import path from "node:path";
import { readFile, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { readQueue, writeQueue } from "./queue.js";
import { ingestPhoto, fitTo, markUsed, CANVAS } from "./media.js";
import { renderPoster } from "./render.js";
import { notify, sendPhoto } from "./notify.js";
import { registerAction } from "./actions.js";
import { recordAction } from "./lastaction.js";
import { completeJson } from "./llm.js";
import { escapeHtml, clip, shortWhen } from "./format.js";

const ROOT = path.resolve(import.meta.dirname, "..");
const QUEUE_FILE = path.join(ROOT, "state", "photo-queue.json");

if (!existsSync(QUEUE_FILE)) {
  console.log("No photos waiting.");
  process.exit(0);
}

const pending = JSON.parse(await readFile(QUEUE_FILE, "utf8"));
const work = pending.filter((p) => p.status === "new" || p.status === "apply");
if (!work.length) {
  console.log("No photos waiting.");
  process.exit(0);
}

const queue = await readQueue();
let touchedQueue = false;

for (const row of work) {
  try {
    if (row.status === "new") await introduce(row);
    else await apply(row);
  } catch (err) {
    console.error(`  ${row.uniqueId}: ${err.message}`);
    row.status = "failed";
    row.error = err.message.slice(0, 200);
    await notify(`📷 I could not use that photo — ${escapeHtml(err.message.slice(0, 100))}`);
  }
}

await writeFile(QUEUE_FILE, JSON.stringify(pending, null, 2));
if (touchedQueue) await writeQueue(queue);
console.log("done.");

// ── pass one: what is this, and where does it go? ────────────────────────────

async function introduce(row) {
  const media = await ingestPhoto({
    fileId: row.fileId,
    uniqueId: row.uniqueId,
    brand: row.brand ?? "operra",
    caption: row.caption ?? "",
  });

  if (media.rejected) {
    row.status = "rejected";
    await notify(`📷 I cannot use that one — ${escapeHtml(media.rejected)}.`);
    return;
  }

  row.mediaId = media.mediaId;
  row.mediaPath = media.path;
  row.subject = media.subject;

  // The vision pass can say a photo is unusable. That is advice, not a verdict:
  // it is the owner's photograph and the owner may know better, so it is
  // offered with the reason rather than thrown away.
  const doubt = media.usable === false ? `\n<i>Heads up: ${escapeHtml(media.why ?? "this may not work as a background")}.</i>` : "";

  const target = await chooseSlot(row, media);
  if (!target) {
    row.status = "saved";
    await notify(
      `📷 <b>${escapeHtml(media.subject ?? "Saved")}</b>\nNothing is queued to put it on, so I have kept it in your pictures.${doubt}`
    );
    return;
  }

  const preview = await renderWith(target, media, path.join(ROOT, "state", "frames", `photo-${row.uniqueId}.png`));

  const use = await registerAction({ verb: "photo-use", uniqueId: row.uniqueId, postId: target.id });
  const other = await registerAction({ verb: "photo-other", uniqueId: row.uniqueId });
  const save = await registerAction({ verb: "photo-save", uniqueId: row.uniqueId });

  await sendPhoto(
    preview,
    `📷 <b>${escapeHtml(media.subject ?? "Your photo")}</b>\nI would put it on <b>${shortWhen(target.scheduledFor)}</b> — ${escapeHtml(clip(target.headline ?? target.id, 45))}${doubt}`,
    {
      buttons: [
        [{ text: "✅ Use it here", data: use }],
        [{ text: "🔀 Another slot", data: other }, { text: "💾 Just save it", data: save }],
      ],
    }
  );

  row.status = "offered";
  row.offeredPostId = target.id;
  await rm(preview, { force: true });
}

/**
 * Which queued post should carry this photo?
 *
 * The owner's caption is the strongest signal and beats everything else — if
 * they said "for tomorrow's 8am one", that is the answer. Otherwise the subject
 * of the photograph is matched against what each post is about.
 */
async function chooseSlot(row, media) {
  const now = new Date();
  const open = queue
    .filter(
      (p) =>
        p.status !== "posted" &&
        p.status !== "reject" &&
        p.status !== "missed" &&
        new Date(p.scheduledFor) >= now
    )
    .sort((a, b) => new Date(a.scheduledFor) - new Date(b.scheduledFor))
    .slice(0, 8);

  if (!open.length) return null;
  if (open.length === 1) return open[0];

  const list = open
    .map((p, i) => `${i}. ${shortWhen(p.scheduledFor)} [${p.format}] ${p.headline}`)
    .join("\n");

  try {
    const pick = await completeJson(
      `An owner sent a photograph to their social media assistant.

The photograph shows: ${media.subject ?? "unknown"}
It suits: ${media.bestFor ?? "either"} format
They said: ${row.caption ? `"${row.caption}"` : "(nothing)"}

Their queued posts:
${list}

Which post should the photograph go on? Return ONLY JSON:
{"index": <number>, "confidence": "high" | "low", "why": "under 10 words"}

- What they SAID outranks everything. "for the 8am one", "kwa post ya kesho",
  "use this for the pool post" — follow it exactly.
- Otherwise match the subject of the photograph to what the post is about.
- A tall photograph suits a reel, a wide one suits a poster, but subject matters
  more than shape.
- If nothing matches well, pick the soonest post and say confidence low.`,
      { fast: true }
    );
    const chosen = open[Number(pick?.index)];
    if (chosen) {
      row.why = pick?.why ?? null;
      return chosen;
    }
  } catch (err) {
    console.warn(`  slot choice failed, defaulting to the soonest: ${err.message}`);
  }
  return open[0];
}

// ── pass two: apply it for real ──────────────────────────────────────────────

async function apply(row) {
  const post = queue.find((p) => p.id === row.targetPostId);
  if (!post) {
    row.status = "failed";
    await notify("📷 That post is no longer in the queue, so I left the photo alone.");
    return;
  }

  // Remember what we are about to replace. Without this, "cancel that" has
  // nothing to put back and the post stays held until it is closed as missed.
  await recordAction({
    kind: "photo-applied",
    postId: post.id,
    previousBackground: post.backgroundPath ?? null,
    previousStatus: post.status ?? "pending",
    mediaId: row.mediaId,
  });

  const media = { path: row.mediaPath, mediaId: row.mediaId, subject: row.subject };
  const outFile =
    post.format === "carousel" && post.slideFiles?.length
      ? path.join(ROOT, "public", post.slideFiles[0])
      : path.join(ROOT, "public", `${post.id}.png`);

  await renderWith(post, media, outFile);

  // needs-review is the existing gate that never auto-publishes. Reusing it
  // means the second confirmation cannot be bypassed by the hourly publisher
  // even if every button in this conversation is ignored.
  post.status = "needs-review";
  post.photo = { mediaId: media.mediaId, appliedAt: new Date().toISOString() };
  touchedQueue = true;
  await markUsed(media.mediaId, post.id);

  const approve = await registerAction({ verb: "approve", postId: post.id });
  const reject = await registerAction({ verb: "reject", postId: post.id });

  await sendPhoto(outFile, `🖼 <b>Ready</b> — ${shortWhen(post.scheduledFor)}\n${escapeHtml(clip(post.headline ?? post.id, 60))}\n\nPost it like this?`, {
    buttons: [[{ text: "✅ Post it", data: approve }, { text: "🚫 Drop it", data: reject }]],
  });

  row.status = "done";
}

/** Crop the photo to the post's canvas and render the post over it. */
async function renderWith(post, media, outFile) {
  const format = CANVAS[post.format] ? post.format : "poster";
  const bg = path.join(ROOT, "state", "bg", `${post.id}.png`);
  await fitTo(path.resolve(ROOT, media.path), format, bg);

  await renderPoster(
    { ...post, backgroundPath: path.relative(ROOT, bg).replace(/\\/g, "/") },
    post.brand ?? "operra",
    outFile
  );

  // Recorded on the post so a re-render weeks later still uses the photograph
  // rather than falling back to a generated background.
  post.backgroundPath = path.relative(ROOT, bg).replace(/\\/g, "/");
  touchedQueue = true;
  return outFile;
}
