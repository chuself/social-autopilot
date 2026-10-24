#!/usr/bin/env node
/**
 * Alice end to end, in ink, without touching the queue: her brief writer
 * (studio/brief.mjs), her TTS, the ink engine and the checker, for the posts
 * named. Briefs and voices are kept, so later runs can re-film the SAME reels
 * after an engine change (--reuse) and compare like with like.
 *
 *   node --env-file=.env studio/ink/alice-run.mjs <out-dir> <post-id> [...] [--reuse] [--rebrief]
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { writeReelBrief } from "../brief.mjs";
import { produceReel } from "../make.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const argv = process.argv.slice(2);
const out = path.resolve(argv[0]);
const ids = argv.slice(1).filter((a) => !a.startsWith("--"));
const reuse = argv.includes("--reuse");
const rebrief = argv.includes("--rebrief");
const queue = JSON.parse(readFileSync(path.join(ROOT, "state", "queue.json"), "utf8"));
mkdirSync(out, { recursive: true });

for (const id of ids) {
  const post = queue.find((p) => p.id === id);
  if (!post) throw new Error(`${id} is not in the queue`);
  const work = path.join(ROOT, "state", "frames", "studio", `alice-${id}`);
  mkdirSync(work, { recursive: true });
  const briefFile = path.join(work, "brief.json");
  let brief;
  if (existsSync(briefFile) && !rebrief) brief = JSON.parse(readFileSync(briefFile, "utf8"));
  else {
    brief = await writeReelBrief(post, post.brand ?? "operra", { style: "ink" });
    writeFileSync(briefFile, JSON.stringify(brief, null, 2));
  }
  const voice = reuse && existsSync(path.join(work, "voice.mp3")) ? path.join(work, "voice.mp3") : null;
  const r = await produceReel(brief, { out: path.join(out, `${id}.mp4`), work, voice, reuse });
  for (const p of r.report?.problems ?? []) console.log(`  ${p.warn ? "WARN" : "FAIL"} ${p.check} ${p.scene ?? ""} ${p.msg}`);
  console.log(`${id}: ${r.ok ? "PASS" : "FAIL"} · ${brief.scenes.map((s) => (s.screen ? `${s.type}:${s.screen}` : s.type)).join(" > ")} · ${JSON.stringify(r.meta?.look ?? {})}`);
  console.log(`  "${brief.narration}"`);
}
