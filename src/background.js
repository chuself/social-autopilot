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
export async function generateBackground(prompt, outFile, { aspect = "4:5", skipMoss = false } = {}) {
  if (process.env.SKIP_IMAGE === "1") return null;

  const chain = [moss, geminiImage, cloudflareFlux, pollinations].filter((p) => !(skipMoss && p === moss));
  for (const provider of chain) {
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

/**
 * MOSS-Image on a shared Modal GPU. The best picture available here by a wide
 * margin, and the first thing tried.
 *
 * Everything before it capped out around 0.6 megapixels however large a canvas
 * was asked for, so a 1080-wide poster was always an upscale of something
 * smaller — which is why backgrounds read as soft. MOSS renders the real
 * 1024x1280 or 768x1344 and the only resize left is the last few per cent.
 *
 * It is a JOB api, not a request: POST returns an id, GET answers 202 until the
 * image exists. Roughly 40 s of GPU, plus about 45 s more when the GPU is cold.
 *
 * Costs a few cents an image against a shared monthly cap, so it is OFF unless
 * MOSS_URL and MOSS_API_KEY are both set — and when the cap is reached or the
 * service is switched off, the chain simply falls through to the free
 * providers below and the day's posts still get a picture.
 */
const moss = {
  name: "moss",
  available: () => Boolean(process.env.MOSS_URL && process.env.MOSS_API_KEY),
  async run(prompt, aspect = "4:5") {
    const id = await mossSubmit(prompt, aspect);
    return (await mossCollect(id)).png;
  },
};

/**
 * Fast or quality.
 *
 * Fast is a DMD distillation of the same model: 8 network evaluations and no
 * CFG, against 50 steps with CFG's second pass — 100 evaluations. Measured on
 * the live service with the same prompt and seed: 6.8 s against 61.3 s of GPU,
 * nine times cheaper, and the picture is the same scene with marginally less
 * micro-texture — invisible under a scrim with a headline over it. So fast is
 * the default; MOSS_MODE=quality buys back the last few per cent.
 */
const FAST = (process.env.MOSS_MODE ?? "fast") !== "quality";

/**
 * Said in the prompt for fast mode, and as a negative prompt for quality mode.
 * Fast runs without CFG, so it has no negative pass to put a negative prompt in.
 * MOSS lettered "Invoice" across a clipboard when "no text" was only asked once.
 */
const NEGATIVE =
  "text, letters, words, numbers, writing, signage, labels, watermark, logo, " +
  "face looking at camera, distorted hands, extra fingers, deformed face, worst quality, jpeg artifact";

function mossConfig() {
  const base = process.env.MOSS_URL.replace(/\/$/, "");
  const headers = { authorization: `Bearer ${process.env.MOSS_API_KEY}`, "content-type": "application/json" };
  return { base, headers };
}

/** Queue one image and return its job id at once. */
async function mossSubmit(prompt, aspect, seed) {
  const { base, headers } = mossConfig();
  // Multiples of 16 (the model's requirement) and at or above the canvas in
  // BOTH directions, so the fit afterwards is a scale and nothing more.
  // 1024x1280 looks big enough and is not: 1024 < 1080, so it tripped the
  // upscale rescue and put film grain over an already sharp picture.
  const [width, height] = aspect === "9:16" ? [1088, 1936] : [1088, 1360];
  const job = FAST
    ? { prompt: withoutWriting(prompt), width, height, fast: true }
    : { prompt: withoutWriting(prompt), width, height, steps: 50, negative_prompt: NEGATIVE };
  if (Number.isInteger(seed)) job.seed = seed;

  const res = await fetch(`${base}/jobs`, {
    method: "POST",
    headers,
    body: JSON.stringify(job),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`submit HTTP ${res.status}: ${(await res.text()).slice(0, 120)}`);
  return (await res.json()).id;
}

/** Wait for a queued image. Returns { png, seed, mode }. */
async function mossCollect(id) {
  const { base, headers } = mossConfig();
  // A cold GPU plus a queue ahead of us is the slow case; past this it is
  // better to fall through to a free provider than to hold up the plan.
  const deadline = Date.now() + Number(process.env.MOSS_MAX_WAIT_MS ?? 8 * 60_000);
  while (Date.now() < deadline) {
    const res = await fetch(`${base}/jobs/${id}`, { headers, signal: AbortSignal.timeout(60_000) });
    if (res.status === 200) {
      return {
        png: Buffer.from(await res.arrayBuffer()),
        seed: Number(res.headers.get("x-moss-seed")) || null,
        mode: res.headers.get("x-moss-mode") ?? (FAST ? "fast" : "normal"),
      };
    }
    if (res.status !== 202) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 120)}`);
    await new Promise((r) => setTimeout(r, 4_000));
  }
  throw new Error("still running after the wait window");
}

/**
 * Generate many backgrounds in ONE burst.
 *
 * MOSS is billed by container wall time, and the cheap part is the image: in
 * fast mode a poster is about 7 s of GPU. The expensive parts are fixed — boot
 * and model load, then a 120 s idle tail before the container shuts down — and
 * the GPU idling while Gemini writes the next post. Planning used to alternate
 * write, draw, write, draw, so the GPU sat billed through every write. Submitting
 * the whole plan at once pays the fixed costs once and nothing in between.
 *
 * @param {Array<{prompt: string, outFile: string, aspect?: string, seed?: number}>} jobs
 *   `seed` redraws a recorded background identically (post.bgSeed).
 * @returns {Promise<Array<{file: string|null, provider: string|null, seed: number|null}>>}
 *   same order as `jobs`; an item MOSS could not draw falls back to the free
 *   providers one at a time, so a failure costs that item quality, not the run.
 */
export async function generateBackgrounds(jobs) {
  if (process.env.SKIP_IMAGE === "1") return jobs.map(() => ({ file: null, provider: null, seed: null }));

  const results = jobs.map(() => null);

  if (moss.available()) {
    const ids = await Promise.all(
      jobs.map((j) => mossSubmit(j.prompt, j.aspect ?? "4:5", j.seed).catch((err) => {
        console.warn(`background via moss could not queue: ${err.message}`);
        return null;
      }))
    );
    console.log(`queued ${ids.filter(Boolean).length}/${jobs.length} background(s) on MOSS in one burst`);
    await Promise.all(
      ids.map(async (id, i) => {
        if (!id) return;
        try {
          const { png, seed, mode } = await mossCollect(id);
          const { outFile, aspect = "4:5" } = jobs[i];
          await mkdir(path.dirname(outFile), { recursive: true });
          await writeFile(outFile, png);
          await sharpen(outFile, aspect);
          console.log(`background via moss (${mode}) -> ${path.basename(outFile)}`);
          results[i] = { file: outFile, provider: `moss-${mode}`, seed };
        } catch (err) {
          console.warn(`background via moss failed for ${path.basename(jobs[i].outFile)}: ${err.message}`);
        }
      })
    );
  }

  // Whatever MOSS did not deliver gets the old chain, minus MOSS.
  for (let i = 0; i < jobs.length; i++) {
    if (results[i]) continue;
    const file = await generateBackground(jobs[i].prompt, jobs[i].outFile, {
      aspect: jobs[i].aspect ?? "4:5",
      skipMoss: true,
    });
    results[i] = { file, provider: file ? "fallback" : null, seed: null };
  }
  return results;
}

/**
 * The writers already end every prompt with "no text, no people, no logos" and
 * MOSS still lettered "Invoice" across a clipboard. It sits under a scrim with
 * a headline over it, so stray lettering is a distraction rather than a
 * disaster — but it is worth asking twice, and more plainly.
 */
function withoutWriting(prompt) {
  // MOSS is unusually GOOD at text, which is the problem: name a ledger and it
  // titles the spine ("DEPARTURE FOLURS"); show a device and it prints a model
  // name on it. Fast mode has no negative pass, so the only lever is to make
  // every object that would naturally carry words explicitly blank.
  return (
    `${prompt} The image contains absolutely no writing, letters, numbers, labels, signage, ` +
    `watermarks or logos of any kind. Every book cover and spine, ledger, folder, sign, ` +
    `screen, keypad and device is plain, untitled and unmarked.`
  );
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
 * Fit the image to the canvas.
 *
 * The free generators return roughly 686x858 whatever is asked for, and the
 * browser then stretches that across a 1080-wide canvas — which is what made
 * posters look soft. For those, lanczos plus a light unsharp pass beats letting
 * the browser do it, and a touch of grain makes the remaining softness read as
 * film rather than as a low-resolution image.
 *
 * None of that applies to an image that was already big enough. Sharpening a
 * sharp picture crunches its edges and the grain throws away real detail, so an
 * image that arrives at or above the canvas is only ever scaled.
 */
async function sharpen(file, aspect) {
  const [w, h] = aspect === "9:16" ? [1080, 1920] : [1080, 1350];
  const tmp = `${file}.up.png`;
  try {
    const upscaled = await isSmallerThan(file, w, h);
    const rescue = upscaled ? ",unsharp=5:5:0.7:5:5:0.0,noise=alls=6:allf=t+u" : "";
    await run("ffmpeg", [
      "-y", "-v", "error",
      "-i", file,
      "-vf",
      `scale=${w}:${h}:flags=lanczos+accurate_rnd:force_original_aspect_ratio=increase,` +
        `crop=${w}:${h}${rescue}`,
      tmp,
    ]);
    const { rename } = await import("node:fs/promises");
    await rename(tmp, file);
    if (!upscaled) console.log("  source was already full size — scaled without the rescue pass");
  } catch (err) {
    // Not fatal — a soft background still beats no background.
    console.warn(`  could not sharpen: ${String(err.message).slice(0, 80)}`);
  }
}

/** True when the source is smaller than the canvas in either direction. */
async function isSmallerThan(file, w, h) {
  try {
    const { stdout } = await run("ffprobe", [
      "-v", "error",
      "-select_streams", "v:0",
      "-show_entries", "stream=width,height",
      "-of", "json",
      file,
    ]);
    const s = JSON.parse(stdout).streams?.[0];
    if (!s?.width) return true;
    return s.width < w || s.height < h;
  } catch {
    // Unknown size: assume it needs the rescue, which is what every provider
    // before MOSS did need.
    return true;
  }
}
