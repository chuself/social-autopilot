#!/usr/bin/env node
/**
 * Redo one post, because the owner asked for something different.
 *
 * The Rewrite button on a post captures a note ("too formal", "lead with the
 * price", "hii iwe kwa Kiswahili") and this rebuilds that ONE post with the
 * note in front of the writer. Nothing else in the queue is touched, and no
 * other slot is re-planned — a rewrite must never cost a day of content.
 *
 * The rewritten post comes back held at needs-review with the same buttons, so
 * a bad rewrite is one tap from being dropped rather than something that
 * publishes because nobody looked.
 */
import path from "node:path";
import { readQueue, writeQueue } from "./queue.js";
import { writePost, findUnapprovedFigures } from "./brain.js";
import { generateBackground } from "./background.js";
import { renderPoster } from "./render.js";
import { sendPhoto, notify } from "./notify.js";
import { registerAction } from "./actions.js";
import { escapeHtml, clip, shortWhen } from "./format.js";

const ROOT = path.resolve(import.meta.dirname, "..");
const queue = await readQueue();

const wanted = process.argv[2]?.trim() || null;
const targets = wanted
  ? queue.filter((p) => p.id === wanted)
  : queue.filter((p) => p.rewriteNote && p.status !== "posted" && p.status !== "reject");

if (!targets.length) {
  console.log("Nothing asked for a rewrite.");
  process.exit(0);
}

for (const post of targets) {
  const note = post.rewriteNote ?? "make it better";
  console.log(`rewriting ${post.id}: ${note}`);

  try {
    const fresh = await writePost({
      brandId: post.brand ?? "operra",
      pillar: post.pillar,
      language: post.language,
      // The owner's note is the whole point, so it goes to the writer verbatim.
      note,
      city: post.city ?? null,
    });

    // Keep everything that decides WHEN and WHERE; replace only what it says.
    Object.assign(post, {
      eyebrow: fresh.eyebrow,
      headline: fresh.headline,
      body: fresh.body,
      cta: fresh.cta,
      caption: fresh.caption,
      hashtags: fresh.hashtags,
      imagePrompt: fresh.imagePrompt,
      rewrittenAt: new Date().toISOString(),
    });

    // A new headline deserves a new picture — unless the owner supplied one,
    // in which case their photograph survives the rewrite.
    if (!post.photo) {
      const bg = path.join(ROOT, "state", "bg", `${post.id}.png`);
      try {
        await generateBackground(fresh.imagePrompt, bg, {
          aspect: post.format === "reel" ? "9:16" : "4:5",
        });
        post.backgroundPath = path.relative(ROOT, bg).replace(/\\/g, "/");
      } catch (err) {
        console.warn(`  background failed, keeping the old one: ${err.message}`);
      }
    }

    const held = await findUnapprovedFigures(post, post.brand ?? "operra");
    post.heldFigures = held?.length ? held : undefined;

    const out = path.join(ROOT, "public", `${post.id}.png`);
    await renderPoster(post, post.brand ?? "operra", out);

    // Held again on purpose: a rewrite the owner has not seen is not approved.
    post.status = "needs-review";
    delete post.rewriteNote;

    const decision = [
      [
        { text: "✅ Post it", data: await registerAction({ verb: "approve", postId: post.id }) },
        { text: "🚫 Drop it", data: await registerAction({ verb: "reject", postId: post.id }) },
      ],
      [{ text: "✏️ Again", data: await registerAction({ verb: "rewrite", postId: post.id }) }],
    ];

    await sendPhoto(
      out,
      `✏️ <b>Redone</b> — ${shortWhen(post.scheduledFor)}\n${escapeHtml(clip(post.headline, 60))}\n\n<i>${escapeHtml(clip(note, 60))}</i>`,
      { buttons: decision }
    );
  } catch (err) {
    console.error(`  failed: ${err.message}`);
    await notify(`✏️ I could not redo that one — ${escapeHtml(err.message.slice(0, 100))}`);
  }
}

await writeQueue(queue);
console.log("done.");
