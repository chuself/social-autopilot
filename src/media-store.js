/**
 * Public media outside git.
 *
 * Instagram and Facebook fetch a post's media from a public URL. That used to
 * be GitHub Pages, and every Pages deploy replaces the whole site, so every
 * file also had to be committed or the next deploy would delete it before it
 * was posted. The repo reached 707 MB, almost all of it media in history.
 *
 * Reels now go to an S3 bucket (public read, uploads only with a put-only key,
 * deleted automatically after 45 days, by which point the platforms hold their
 * own copies). Nothing goes into git.
 *
 * Off unless MEDIA_BUCKET is set; any failure returns null and the caller
 * keeps the old Pages path, so a storage problem can never cost a post.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

export function mediaStoreConfigured() {
  return Boolean(process.env.MEDIA_BUCKET && process.env.ALICE_MEDIA_KEY_ID && process.env.ALICE_MEDIA_SECRET);
}

export function mediaUrl(key) {
  const region = process.env.MEDIA_REGION ?? "eu-west-1";
  return `https://${process.env.MEDIA_BUCKET}.s3.${region}.amazonaws.com/${key}`;
}

/**
 * @returns {Promise<string|null>} the public URL, or null if it could not be
 *   uploaded and confirmed live
 */
export async function uploadMedia(file, key, contentType) {
  if (!mediaStoreConfigured()) return null;
  const env = {
    ...process.env,
    AWS_ACCESS_KEY_ID: process.env.ALICE_MEDIA_KEY_ID,
    AWS_SECRET_ACCESS_KEY: process.env.ALICE_MEDIA_SECRET,
    AWS_DEFAULT_REGION: process.env.MEDIA_REGION ?? "eu-west-1",
  };
  // Runners have the aws binary. Locally, AWS_CLI_PYTHON can point at a
  // python with awscli installed (Windows has no aws binary here).
  const [cmd, pre] = process.env.AWS_CLI_PYTHON ? [process.env.AWS_CLI_PYTHON, ["-m", "awscli"]] : ["aws", []];
  try {
    await run(
      cmd,
      [...pre, "s3", "cp", file, `s3://${process.env.MEDIA_BUCKET}/${key}`, "--content-type", contentType, "--cache-control", "public, max-age=604800", "--only-show-errors"],
      { env, timeout: 180_000 }
    );
    // Confirm it is actually public before anything relies on the URL.
    const url = mediaUrl(key);
    const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`HEAD ${res.status}`);
    if (!String(res.headers.get("content-type")).startsWith(contentType)) throw new Error(`served as ${res.headers.get("content-type")}`);
    return url;
  } catch (err) {
    // stderr carries AWS's actual reason; err.message alone was cut to the command line.
    const why = String(err.stderr || err.message).trim().split("\n").filter(Boolean).slice(-2).join(" | ").slice(0, 300);
    console.warn(`  media store: could not upload ${key} (${why}); keeping the Pages copy`);
    return null;
  }
}
