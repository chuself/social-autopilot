#!/usr/bin/env node
/**
 * Brief in, finished reel out.
 *
 *   node studio/make.mjs <brief.json> --out reel.mp4 [--voice voice.mp3] [--work dir]
 *
 * - A scene's `image` is a file path if it exists, otherwise a MOSS prompt;
 *   every prompt in the reel goes to MOSS in ONE batch (one GPU start-up).
 * - No --voice: the brief's `narration` is spoken by Alice's own TTS
 *   (src/audio.js), unchanged. The voice is never edited; the picture and
 *   the effects follow it.
 * - Effects are synthesised from the cue list the page itself produced, and
 *   laid under the voice at unity.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { compose, validateBrief } from "./compose.mjs";
import { pauses } from "./timing.mjs";
import { renderSfx, VOCABULARY } from "./sfx.mjs";
import { renderPage } from "./render.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const SFX_BUS = 0.6; // effects bus, about -4.4 dB under unity

export async function makeReel(brief, { out, voice = null, work = null, fps = 30, brandId = "operra", reuse = false, pageOnly = false } = {}) {
  validateBrief(brief);
  const dir = work ?? path.join(ROOT, "state", "frames", "studio", brief.id ?? "reel");
  mkdirSync(dir, { recursive: true });
  const brand = { ...JSON.parse(readFileSync(path.join(ROOT, "brands", brandId, "brand.json"), "utf8")), id: brandId };

  // Images: existing files are used as they are; prompts go to MOSS together.
  const jobs = [];
  const scenes = brief.scenes.map((s, i) => {
    if (!s.image) return { ...s };
    if (existsSync(path.resolve(s.image))) return { ...s, image: path.resolve(s.image) };
    const file = path.join(dir, `s${i}.png`);
    // --reuse: an image already made for this scene is kept (iterating on layout costs nothing)
    if (reuse && existsSync(file)) return { ...s, image: file, imagePrompt: s.image };
    jobs.push({ i, prompt: s.image, outFile: file, aspect: "9:16", seed: s.seed });
    return { ...s, image: file, imagePrompt: s.image };
  });
  if (jobs.length) {
    const { generateBackgrounds } = await import("../src/background.js");
    const done = await generateBackgrounds(jobs);
    done.forEach((d, k) => {
      if (!d?.file) throw new Error(`scene ${jobs[k].i + 1}: no image could be made`);
      scenes[jobs[k].i].image = d.file;
      scenes[jobs[k].i].imageSeed = d.seed;
    });
  }
  for (const s of scenes) if (s.image) s.image = `file:///${s.image.replace(/\\/g, "/")}`;

  // Voice: given, or Alice's own TTS from the narration.
  let voiceFile = voice ?? (reuse && existsSync(path.join(dir, "voice.mp3")) ? path.join(dir, "voice.mp3") : null);
  if (!voiceFile) {
    if (!brief.narration) throw new Error("no --voice and no narration in the brief");
    const { speak } = await import("../src/audio.js");
    voiceFile = await speak(brief.narration, brief.language, path.join(dir, "voice.mp3"));
    if (!voiceFile) throw new Error("voiceover failed");
  }
  const v = await pauses(voiceFile);

  const reel = compose({ ...brief, scenes }, v, brand);
  const page = path.join(dir, "page.html");
  writeFileSync(page, reel.html);
  for (const c of reel.cues) if (!VOCABULARY[c.type]) throw new Error(`cue ${c.type} has no meaning`);

  if (pageOnly) return { id: brief.id, page, duration: reel.duration, cuts: reel.cuts, joins: reel.joins, ledger: reel.ledger, cues: reel.cues };
  const sfx = await renderSfx(reel.cues, reel.duration, path.join(dir, "sfx.wav"));
  const mix = path.join(dir, "mix.m4a");
  // A mono voice is copied to both channels at unity: amix's own upmix would
  // quietly lower it by 3 dB, and the voice is the one thing not to touch.
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", voiceFile, "-i", sfx,
    "-filter_complex", `[0:a]aresample=44100,pan=stereo|c0=c0|c1=c0,apad[v];[1:a]volume=${SFX_BUS}[s];[v][s]amix=inputs=2:normalize=0:duration=longest[a]`,
    "-map", "[a]", "-t", String(reel.duration), "-c:a", "aac", "-b:a", "192k", mix]);

  await renderPage(page, mix, out, { fps });
  const meta = { id: brief.id, out, duration: reel.duration, cuts: reel.cuts, joins: reel.joins, ledger: reel.ledger, cues: reel.cues, voice: voiceFile,
    images: scenes.map((s) => s.imagePrompt ? { prompt: s.imagePrompt, seed: s.imageSeed } : null) };
  writeFileSync(path.join(dir, "reel.json"), JSON.stringify(meta, null, 1));
  return meta;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const argv = process.argv.slice(2);
  const flag = (k) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : null);
  const brief = JSON.parse(readFileSync(argv[0], "utf8"));
  const meta = await makeReel(brief, { out: flag("--out") ?? "reel.mp4", voice: flag("--voice"), work: flag("--work"), reuse: argv.includes("--reuse"), pageOnly: argv.includes("--page-only") });
  console.log(`cuts ${meta.cuts.join(", ")} · joins ${meta.joins.join(", ")} · ${meta.cues.length} cues`);
  console.log(`ledger ${meta.ledger.nights} × ${meta.ledger.currency} ${meta.ledger.rightRate} = ${meta.ledger.rightTotal} (was ${meta.ledger.wrongTotal})`);
}
