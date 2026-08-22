/**
 * Preflight: prove every path still works, without posting anything.
 *
 * Written after three bugs in one day that all passed `node --check` — an
 * imported function never called, a block referencing variables that were never
 * added, and a use-before-declaration. None were visible without EXECUTING the
 * code, so this executes it.
 *
 *   node scripts/preflight.mjs            # everything
 *   node scripts/preflight.mjs --quick    # skip renders and network calls
 */
import { readFile, readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const QUICK = process.argv.includes("--quick");
const results = [];

async function check(name, fn, { optional = false } = {}) {
  const started = Date.now();
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail, ms: Date.now() - started });
  } catch (err) {
    results.push({
      name,
      ok: false,
      optional,
      detail: String(err.message ?? err).slice(0, 160),
      ms: Date.now() - started,
    });
  }
}

// ── 1. Every module must load. Catches syntax and top-level throws. ──────────
await check("modules load", async () => {
  const dirs = ["src", "src/publish"];
  let n = 0;
  for (const dir of dirs) {
    for (const f of await readdir(path.join(ROOT, dir))) {
      if (!f.endsWith(".js")) continue;
      // CLIs run work at import time; only load libraries here.
      if (f.startsWith("cli-")) continue;
      await import(`file://${path.join(ROOT, dir, f)}`);
      n++;
    }
  }
  return `${n} modules`;
});

// ── 2. Imported but never called. THE bug of the day. ───────────────────────
await check("no dead imports", async () => {
  const bad = [];
  for (const dir of ["src", "src/publish"]) {
    for (const f of await readdir(path.join(ROOT, dir))) {
      if (!f.endsWith(".js")) continue;
      const src = await readFile(path.join(ROOT, dir, f), "utf8");
      for (const m of src.matchAll(/^import\s*\{([^}]+)\}\s*from/gm)) {
        for (const raw of m[1].split(",")) {
          const name = raw.split(" as ").pop().trim();
          if (!name) continue;
          const uses = (src.match(new RegExp(`\\b${name}\\b`, "g")) ?? []).length;
          if (uses <= 1) bad.push(`${f}:${name}`);
        }
      }
    }
  }
  if (bad.length) throw new Error(`imported but never used — ${bad.join(", ")}`);
  return "all imports used";
});

// ── 3. Config is valid and describes a sane day. ────────────────────────────
await check("config", async () => {
  const { readConfig, describe } = await import("../src/config.js");
  const cfg = await readConfig();
  if (!cfg.slots?.length) throw new Error("no slots configured");
  return describe(cfg.slots);
});

// ── 4. Every queued post has the assets it will need. ───────────────────────
await check("queued assets present", async () => {
  const queue = JSON.parse(await readFile(path.join(ROOT, "state", "queue.json"), "utf8"));
  const open = queue.filter((p) => p.status !== "posted" && p.status !== "reject");
  const missing = [];
  for (const p of open) {
    const files =
      p.format === "carousel" && p.slideFiles?.length ? p.slideFiles : [`${p.id}.png`];
    for (const f of files) {
      if (!existsSync(path.join(ROOT, "public", f))) missing.push(f);
    }
  }
  if (missing.length) throw new Error(`${missing.length} missing: ${missing[0]}`);
  return `${open.length} queued, all rendered`;
});

// ── 5. The publish path, executed for real in dry run. ──────────────────────
await check("publish path executes", async () => {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const run = promisify(execFile);
  const { stdout } = await run("node", ["src/cli-publish.js"], {
    cwd: ROOT,
    env: { ...process.env, DRY_RUN: "1" },
  });
  if (/ReferenceError|TypeError|is not defined/.test(stdout)) throw new Error(stdout.slice(0, 120));
  return stdout.includes("Nothing due") ? "ran (nothing due)" : "ran";
});

if (!QUICK) {
  // ── 6. The brain answers, through whichever provider is alive. ────────────
  await check("brain responds", async () => {
    const { completeJson } = await import("../src/llm.js");
    const r = await completeJson('Return ONLY JSON: {"ok":true}', { fast: true });
    if (!r?.ok) throw new Error("unexpected response");
    return "ok";
  });

  // ── 7. Renderer actually produces a file. ─────────────────────────────────
  await check("poster renders", async () => {
    const { renderPoster } = await import("../src/render.js");
    const queue = JSON.parse(await readFile(path.join(ROOT, "state", "queue.json"), "utf8"));
    const sample = queue[queue.length - 1];
    if (!sample) return "skipped (empty queue)";
    const out = path.join(ROOT, "state", "frames", "preflight.png");
    await renderPoster(sample, sample.brand ?? "operra", out);
    if (!existsSync(out)) throw new Error("no file produced");
    await rm(out, { force: true });
    return "ok";
  });

  // ── 8. Credentials still valid. Each is a silent-death risk. ─────────────
  await check("meta token", async () => {
    const t = process.env.FB_PAGE_ACCESS_TOKEN;
    const r = await fetch(
      `https://graph.facebook.com/v21.0/debug_token?input_token=${encodeURIComponent(t)}`,
      { headers: { authorization: `Bearer ${t}` } }
    );
    const { data } = await r.json();
    if (!data?.is_valid) throw new Error("token is not valid");
    return data.expires_at ? `expires ${new Date(data.expires_at * 1000).toISOString().slice(0, 10)}` : "never expires";
  });

  await check("meta can read comments", async () => {
    const t = process.env.FB_PAGE_ACCESS_TOKEN;
    const d = await (
      await fetch(`https://graph.facebook.com/v21.0/debug_token?input_token=${encodeURIComponent(t)}`, {
        headers: { authorization: `Bearer ${t}` },
      })
    ).json();
    const scopes = new Set(d.data?.scopes ?? []);
    const need = ["pages_read_user_content", "pages_manage_engagement", "instagram_manage_comments"];
    const missing = need.filter((s) => !scopes.has(s));
    if (missing.length) throw new Error(`missing scopes: ${missing.join(", ")}`);
    return "all comment scopes present";
  });

  await check("telegram reachable", async () => {
    const r = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getMe`);
    const j = await r.json();
    if (!j.ok) throw new Error(j.description ?? "getMe failed");
    return `@${j.result.username}`;
  });

  await check(
    "metricool / tiktok",
    async () => {
      const { tiktokConfigured, callTool } = await import("../src/publish/tiktok.js");
      if (!tiktokConfigured()) throw new Error("not configured");
      const out = await callTool("getBrandSettings", {});
      const j = JSON.parse(out);
      const b = (Array.isArray(j) ? j : j.data ?? [j])[0];
      const nets = Object.entries(b?.networksData ?? {})
        .filter(([, v]) => v)
        .map(([k]) => k.replace("Data", ""));
      return nets.join(", ") || "connected";
    },
    { optional: true }
  );
}

// ── Report ──────────────────────────────────────────────────────────────────
const failed = results.filter((r) => !r.ok && !r.optional);
const warned = results.filter((r) => !r.ok && r.optional);

console.log("");
for (const r of results) {
  const mark = r.ok ? "PASS" : r.optional ? "WARN" : "FAIL";
  console.log(`${mark}  ${r.name.padEnd(26)} ${r.detail ?? ""}`);
}
console.log(`\n${results.length - failed.length - warned.length} passed, ${warned.length} warned, ${failed.length} failed`);

if (process.env.PREFLIGHT_NOTIFY === "1" && (failed.length || warned.length)) {
  const { notify } = await import("../src/notify.js");
  const lines = [
    failed.length ? "🚨 <b>Preflight failed</b>" : "⚠️ <b>Preflight warning</b>",
    "",
    ...[...failed, ...warned].map((r) => `• <b>${r.name}</b>: ${r.detail}`),
  ];
  await notify(lines.join("\n"));
}

process.exitCode = failed.length ? 1 : 0;
