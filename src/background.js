/**
 * Free AI background generation. Gemini image on the AI Studio free tier;
 * Cloudflare Workers AI (Flux schnell) as a second free option.
 *
 * Returns the written file path, or null — the renderer falls back to the
 * branded gradient, so a post never dies because an image model was down.
 */
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

const GEMINI_IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL ?? "gemini-3.1-flash-image";

/**
 * @param {string} prompt
 * @param {string} outFile
 * @param {object} opts
 *   aspect — "4:5" for posters, "9:16" for reels. The generator caps output at
 *   about 0.6 megapixels whatever size we request, but it DOES honour aspect —
 *   so asking in the right shape avoids stretching a 4:5 image into 9:16.
 */
export async function generateBackground(prompt, outFile, { aspect = "4:5" } = {}) {
  if (process.env.SKIP_IMAGE === "1") return null;

  for (const provider of [geminiImage, cloudflareFlux, pollinations]) {
    if (!provider.available()) continue;
    try {
      const bytes = await provider.run(prompt, aspect);
      await mkdir(path.dirname(outFile), { recursive: true });
      await writeFile(outFile, bytes);
      await sharpen(outFile, aspect);
      console.log(`background via ${provider.name} -> ${path.basename(outFile)}`);
      return outFile;
    } catch (err) {
      console.warn(`background via ${provider.name} failed: ${err.message}`);
    }
  }
  console.warn("no background generated — falling back to the branded gradient");
  return null;
}

const geminiImage = {
  name: "gemini",
  // Off by default: Gemini image models are paid-only (free-tier quota is 0),
  // so calling them just burns a round-trip. Set GEMINI_IMAGE=1 if that changes.
  available: () => process.env.GEMINI_IMAGE === "1" && Boolean(process.env.GEMINI_API_KEY),
  async run(prompt) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": process.env.GEMINI_API_KEY,
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: `${prompt}. Vertical 4:5 composition.` }] }],
        }),
      }
    );
    const json = await res.json();
    if (!res.ok) throw new Error(json.error?.message ?? `HTTP ${res.status}`);
    const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
    if (!part) throw new Error("no image in response");
    return Buffer.from(part.inlineData.data, "base64");
  },
};

const cloudflareFlux = {
  name: "cloudflare-flux",
  available: () =>
    Boolean(process.env.CF_ACCOUNT_ID && process.env.CF_API_TOKEN),
  async run(prompt) {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID}/ai/run/@cf/black-forest-labs/flux-1-schnell`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${process.env.CF_API_TOKEN}`,
        },
        body: JSON.stringify({ prompt, steps: 4 }),
      }
    );
    const json = await res.json();
    if (!res.ok || json.success === false) {
      throw new Error(json.errors?.[0]?.message ?? `HTTP ${res.status}`);
    }
    const b64 = json.result?.image;
    if (!b64) throw new Error("no image in response");
    return Buffer.from(b64, "base64");
  },
};

/** Keyless and free. The default background provider. */
const pollinations = {
  name: "pollinations-flux",
  available: () => process.env.NO_POLLINATIONS !== "1",
  async run(prompt, aspect = "4:5") {
    const [w, h] = aspect === "9:16" ? [1080, 1920] : [1080, 1350];
    const url =
      `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}` +
      `?width=${w}&height=${h}&nologo=true&model=flux`;
    const res = await fetch(url, { signal: AbortSignal.timeout(90_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const type = res.headers.get("content-type") ?? "";
    if (!type.startsWith("image/")) throw new Error(`not an image (${type})`);
    return Buffer.from(await res.arrayBuffer());
  },
};

/**
 * The generator returns roughly 686x858 whatever we ask for, and the browser
 * then stretches that across a 1080-wide canvas — which is what made posters
 * look soft. Upscaling here with lanczos plus a light unsharp pass is sharper
 * than letting the browser do it, and a touch of grain makes the remaining
 * softness read as film rather than as a low-resolution image.
 */
async function sharpen(file, aspect) {
  const [w, h] = aspect === "9:16" ? [1080, 1920] : [1080, 1350];
  const tmp = `${file}.up.png`;
  try {
    await run("ffmpeg", [
      "-y", "-v", "error",
      "-i", file,
      "-vf",
      `scale=${w}:${h}:flags=lanczos+accurate_rnd:force_original_aspect_ratio=increase,` +
        `crop=${w}:${h},unsharp=5:5:0.7:5:5:0.0,noise=alls=6:allf=t+u`,
      tmp,
    ]);
    const { rename } = await import("node:fs/promises");
    await rename(tmp, file);
  } catch (err) {
    // Not fatal — a soft background still beats no background.
    console.warn(`  could not sharpen: ${String(err.message).slice(0, 80)}`);
  }
}
