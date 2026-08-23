/**
 * Photographs the owner sends on Telegram.
 *
 * A generated background is capped around 0.6MP and always looks like stock;
 * a real photograph of the actual place beats it every time. But you never know
 * what you are sent — a screenshot of a WhatsApp thread, a blurry receipt, a
 * logo on white, a portrait selfie, a 12MP panorama — so nothing here trusts
 * the input:
 *
 *   1. ffprobe says whether it is really an image and how big it is
 *   2. a vision model says WHAT it is and whether it can carry text over it
 *   3. ffmpeg crops it to the canvas the post actually needs
 *
 * Each step can fail without losing the photo: the file is kept either way and
 * the owner is told what could not be determined.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { downloadTelegramFile } from "./notify.js";
import { describeImage } from "./llm.js";

const run = promisify(execFile);
const ROOT = path.resolve(import.meta.dirname, "..");
const LIBRARY = path.join(ROOT, "state", "media");
const INDEX = path.join(LIBRARY, "index.json");

/** Below this the photo cannot fill a 1080-wide canvas without looking soft. */
const MIN_WIDTH = 700;
const MIN_HEIGHT = 700;

export const CANVAS = {
  poster: { w: 1080, h: 1350 },
  carousel: { w: 1080, h: 1350 },
  reel: { w: 1080, h: 1920 },
};

export async function readIndex() {
  if (!existsSync(INDEX)) return [];
  try {
    return JSON.parse(await readFile(INDEX, "utf8"));
  } catch {
    return [];
  }
}

async function writeIndex(rows) {
  await mkdir(LIBRARY, { recursive: true });
  await writeFile(INDEX, JSON.stringify(rows, null, 2));
}

/** Dimensions and format, or null when the file is not decodable as an image. */
export async function probeImage(file) {
  try {
    const { stdout } = await run("ffprobe", [
      "-v", "error",
      "-select_streams", "v:0",
      "-show_entries", "stream=width,height,codec_name",
      "-of", "json",
      file,
    ]);
    const s = JSON.parse(stdout).streams?.[0];
    if (!s?.width) return null;
    return { width: s.width, height: s.height, codec: s.codec_name };
  } catch {
    return null;
  }
}

/**
 * Fit a photo to a canvas: scale until it covers, then centre-crop. Never
 * letterboxed and never squashed — a stretched hotel room is worse than none.
 */
export async function fitTo(src, format, outFile) {
  const { w, h } = CANVAS[format] ?? CANVAS.poster;
  await mkdir(path.dirname(outFile), { recursive: true });
  await run("ffmpeg", [
    "-y",
    "-i", src,
    "-vf", `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`,
    "-frames:v", "1",
    outFile,
  ]);
  return outFile;
}

/**
 * What is this a photograph of, and can a headline sit on top of it?
 *
 * Returns null when vision is unavailable — callers must treat "we do not know"
 * as a reason to ask the owner, never as a reason to reject the photo.
 */
export async function assessPhoto(file) {
  const bytes = await readFile(file);
  const mime = file.endsWith(".png") ? "image/png" : "image/jpeg";
  return await describeImage(
    bytes,
    mime,
    `You are checking a photograph an owner sent for use as the background of a
social media post for a hotel management company in Tanzania. Text will be laid
over it with a dark scrim.

Return ONLY JSON:
{
  "subject": "under 8 words, what is actually pictured",
  "usable": true | false,
  "why": "under 15 words, only if usable is false",
  "busy": true | false,
  "hasText": true | false,
  "people": true | false,
  "bestFor": "poster" | "reel" | "either"
}

- usable=false ONLY for: a screenshot, a document or receipt, something too dark
  or too blurry to read, or an image that is mostly existing text or a logo.
  A plain photograph of a room, building, food, landscape or person is usable.
- busy=true if the image is cluttered enough that a headline over it would be
  hard to read.
- bestFor: "reel" if it is clearly portrait/tall, "poster" if clearly landscape,
  otherwise "either".`
  );
}

/**
 * Take a photo from Telegram into the library.
 *
 * @param {object} opts
 *   fileId      Telegram file_id
 *   uniqueId    Telegram file_unique_id — stable across re-sends, so the same
 *               photo sent twice is recognised rather than duplicated
 *   brand       brand id
 *   caption     whatever the owner typed with it, if anything
 */
export async function ingestPhoto({ fileId, uniqueId, brand = "operra", caption = "" }) {
  const rows = await readIndex();
  const already = rows.find((r) => r.uniqueId === uniqueId);
  if (already) return { ...already, duplicate: true };

  const mediaId = `${brand}-${Date.now().toString(36)}-${randomBytes(2).toString("hex")}`;
  const tmp = path.join(LIBRARY, brand, `${mediaId}.download`);
  const { size } = await downloadTelegramFile(fileId, tmp);

  const probe = await probeImage(tmp);
  if (!probe) {
    return { mediaId, rejected: "that file is not an image I can read", path: tmp, size };
  }
  if (probe.width < MIN_WIDTH || probe.height < MIN_HEIGHT) {
    return {
      mediaId,
      rejected: `too small (${probe.width}x${probe.height}) — I need at least ${MIN_WIDTH}px`,
      path: tmp,
      size,
      ...probe,
    };
  }

  // Normalise to PNG once, here, so nothing downstream has to care what arrived.
  const stored = path.join(LIBRARY, brand, `${mediaId}.png`);
  await run("ffmpeg", ["-y", "-i", tmp, "-frames:v", "1", stored]);
  await rename(tmp, path.join(LIBRARY, brand, `${mediaId}.original`)).catch(() => {});

  const seen = await assessPhoto(stored);

  const row = {
    mediaId,
    uniqueId,
    brand,
    path: path.relative(ROOT, stored).replace(/\\/g, "/"),
    width: probe.width,
    height: probe.height,
    size,
    caption: caption || null,
    subject: seen?.subject ?? null,
    usable: seen?.usable ?? null,
    busy: seen?.busy ?? null,
    hasText: seen?.hasText ?? null,
    people: seen?.people ?? null,
    bestFor: seen?.bestFor ?? "either",
    why: seen?.why ?? null,
    addedAt: new Date().toISOString(),
    usedIn: [],
  };
  rows.push(row);
  await writeIndex(rows);
  return row;
}

/** Record that a photo was used, so the library can avoid repeating itself. */
export async function markUsed(mediaId, postId) {
  const rows = await readIndex();
  const row = rows.find((r) => r.mediaId === mediaId);
  if (!row) return false;
  row.usedIn = [...new Set([...(row.usedIn ?? []), postId])];
  await writeIndex(rows);
  return true;
}
