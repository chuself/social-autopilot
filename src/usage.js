/**
 * Token meter. Every model call records what it cost, so the price of a post
 * and of its follow-ups is measured, not estimated.
 *
 * One file per workflow run (state/usage/<day>/<run>.jsonl): two jobs that run
 * at once each append to their own file, so the meter can never cause the kind
 * of push conflict the queue suffered from. A failed call is recorded too,
 * with zero tokens, so quota refusals show up in the numbers.
 *
 * Feature attribution: callers pass { feature, post }; anything that does not
 * says which script it ran in (plan, engage, listen-live…).
 */
import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

const runName = () =>
  process.env.GITHUB_RUN_ID
    ? `${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT ?? 1}`
    : `local-${process.pid}`;

let context = {};
/**
 * Label the calls that follow (sequential code): which feature, which post.
 * Merges, so a planner can name the post and the brain the feature.
 */
export function setUsageContext(c) {
  context = { ...context, ...c };
}

const script = () => path.basename(process.argv[1] ?? "unknown").replace(/^cli-|\.m?js$/g, "");

/**
 * @param {object} e
 *   provider  "gemini" | "groq"
 *   model, feature, post
 *   usage     Gemini usageMetadata or Groq usage
 *   ok        false for a refused / failed call
 */
export function recordUsage({ provider, model, feature, post, usage = {}, ok = true, error = null }) {
  try {
    const g = provider === "gemini";
    const line = {
      t: new Date().toISOString(),
      provider,
      model,
      feature: feature ?? context.feature ?? script(),
      post: post ?? context.post ?? null,
      in: (g ? usage.promptTokenCount : usage.prompt_tokens) ?? 0,
      out: (g ? usage.candidatesTokenCount : usage.completion_tokens) ?? 0,
      think: (g ? usage.thoughtsTokenCount : 0) ?? 0,
      // audio vs text matters: TTS output is priced per audio token
      outAudio: g ? (usage.candidatesTokensDetails ?? []).filter((d) => d.modality === "AUDIO").reduce((a, d) => a + (d.tokenCount ?? 0), 0) : 0,
      inImage: g ? (usage.promptTokensDetails ?? []).filter((d) => d.modality === "IMAGE").reduce((a, d) => a + (d.tokenCount ?? 0), 0) : 0,
      ok,
      ...(error ? { error: String(error).slice(0, 80) } : {}),
      wf: process.env.GITHUB_WORKFLOW ?? "local",
    };
    const day = line.t.slice(0, 10);
    const dir = path.join(ROOT, "state", "usage", day);
    mkdirSync(dir, { recursive: true });
    appendFileSync(path.join(dir, `${runName()}.jsonl`), JSON.stringify(line) + "\n");
  } catch {
    // The meter must never break the thing it measures.
  }
}
