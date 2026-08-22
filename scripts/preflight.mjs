/**
 * Preflight: prove every path still works, without posting anything.
 *
 * Written after three bugs in one day that all passed `node --check` - an
 * imported function never called, a block referencing variables that were never
 * added, and a use-before-declaration. None were visible without EXECUTING the
 * code, so this executes it.
 *
 * The dominant failure mode in this project is the SILENT NO-OP: a denied
 * permission that reads as "no comments", a cap that resolved to NaN, a reel
 * slot that quietly never got filmed. Nothing throws. Everything looks fine.
 * So every check here answers a question the owner would otherwise have to ask
 * on Telegram, and says the boring answer out loud.
 *
 *   node scripts/preflight.mjs                # everything
 *   node scripts/preflight.mjs --quick        # local only: no network, no render
 *   node scripts/preflight.mjs --only=meta    # just the checks whose name matches
 *   node scripts/preflight.mjs --json         # machine-readable
 *
 *   --skip=metricool   Leave a check out. Worth knowing: every Metricool call
 *                      rotates the refresh token, so running that check from a
 *                      laptop desyncs the copy CI holds. Skip it locally.
 *
 * Reporting:
 *   PREFLIGHT_NOTIFY=1        Telegram only when something is wrong
 *   PREFLIGHT_NOTIFY=always   Telegram always, full report (what /preflight uses)
 */
import { readFile, readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const run = promisify(execFile);

// Running this from a laptop should need no ceremony. In Actions the env is
// already populated and there is no .env, so this is a no-op there.
if (existsSync(path.join(ROOT, ".env"))) {
  try {
    process.loadEnvFile(path.join(ROOT, ".env"));
  } catch (err) {
    console.warn(`could not read .env: ${err.message}`);
  }
}

const QUICK = process.argv.includes("--quick");
const JSON_OUT = process.argv.includes("--json");
const ONLY = (process.argv.find((a) => a.startsWith("--only=")) ?? "").slice(7).toLowerCase();
const SKIP = (process.argv.find((a) => a.startsWith("--skip=")) ?? "")
  .slice(7)
  .toLowerCase()
  .split(",")
  .filter(Boolean);

const results = [];

/**
 * @param {string} group   one of: code, config, content, publish, brain, creds, media
 * @param {object} opts
 *   level "fail" - posting is broken or will break
 *         "warn" - degraded; something still works but not as designed
 *   net   true if it touches the network (skipped by --quick)
 */
async function check(name, fn, { group = "code", level = "fail", net = false } = {}) {
  if (ONLY && !name.toLowerCase().includes(ONLY) && !group.includes(ONLY)) return;
  if (SKIP.some((s) => name.toLowerCase().includes(s) || group.includes(s))) {
    results.push({ group, name, state: "skip", detail: "skipped (--skip)", ms: 0 });
    return;
  }
  if (QUICK && net) {
    results.push({ group, name, state: "skip", detail: "skipped (--quick)", ms: 0 });
    return;
  }
  const started = Date.now();
  try {
    const detail = await fn();
    // A check may downgrade itself by returning { warn: "..." }.
    if (detail && typeof detail === "object" && detail.warn) {
      results.push({ group, name, state: "warn", detail: detail.warn, ms: Date.now() - started });
    } else {
      results.push({ group, name, state: "pass", detail: detail ?? "", ms: Date.now() - started });
    }
  } catch (err) {
    results.push({
      group,
      name,
      state: level === "warn" ? "warn" : "fail",
      detail: String(err.message ?? err).slice(0, 200),
      ms: Date.now() - started,
    });
  }
}

const readState = async (file, fallback) => {
  const p = path.join(ROOT, "state", file);
  if (!existsSync(p)) return fallback;
  try {
    return JSON.parse(await readFile(p, "utf8"));
  } catch {
    return fallback;
  }
};

/** Stored timestamps are UTC; the owner thinks in East Africa Time. */
const eat = (iso) => new Date(new Date(iso).getTime() + 3 * 3600_000).toISOString().slice(11, 16);

// == code =====================================================================

await check(
  "modules load",
  async () => {
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
  },
  { group: "code" }
);

// Every CLI is an entry point nothing else imports, so a syntax error in one is
// invisible until its workflow fires at 21:00 and does nothing.
await check(
  "CLIs parse",
  async () => {
    const clis = (await readdir(path.join(ROOT, "src"))).filter(
      (f) => f.startsWith("cli-") && f.endsWith(".js")
    );
    for (const f of clis) {
      await run(process.execPath, ["--check", path.join(ROOT, "src", f)]);
    }
    return `${clis.length} entry points`;
  },
  { group: "code" }
);

await check(
  "no dead imports",
  async () => {
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
    if (bad.length) throw new Error(`imported but never used - ${bad.join(", ")}`);
    return "all imports used";
  },
  { group: "code" }
);

// == config ===================================================================

await check(
  "config valid",
  async () => {
    const { readConfig, describe } = await import("../src/config.js");
    const cfg = await readConfig();
    if (!cfg.slots?.length) throw new Error("no slots configured");
    return `${describe(cfg.slots)} - ${cfg.tiktokPerDay}/day to TikTok`;
  },
  { group: "config" }
);

await check(
  "daily cap is a number",
  async () => {
    const { maxPostsPerDay } = await import("../src/guards.js");
    const cap = await maxPostsPerDay();
    if (!Number.isFinite(cap)) throw new Error(`cap is ${cap} - the guard is off`);
    return `${cap} per platform per day`;
  },
  { group: "config" }
);

// Paused is a legitimate state, not a fault - but silence with no explanation is
// exactly what sends the owner to Telegram asking why nothing posted.
await check(
  "kill switch",
  async () => {
    const { isPaused } = await import("../src/guards.js");
    if (isPaused()) return { warn: "PAUSED - nothing will publish until /resume" };
    return "off, publishing allowed";
  },
  { group: "config", level: "warn" }
);

await check(
  "standing instructions",
  async () => {
    const f = path.join(ROOT, "state", "steer.md");
    if (!existsSync(f)) return "none set";
    const lines = (await readFile(f, "utf8")).split("\n").filter((l) => l.trim());
    return `${lines.length} in force: ${lines[lines.length - 1]?.slice(0, 60) ?? ""}`;
  },
  { group: "config", level: "warn" }
);

// == content ==================================================================

await check(
  "queued assets present",
  async () => {
    const queue = await readState("queue.json", []);
    const open = queue.filter((p) => p.status !== "posted" && p.status !== "reject");
    const missing = [];
    for (const p of open) {
      // A reel slot is filmed at publish time; it has no poster to look for.
      if (p.format === "reel") continue;
      const files =
        p.format === "carousel" && p.slideFiles?.length ? p.slideFiles : [`${p.id}.png`];
      for (const f of files) {
        if (!existsSync(path.join(ROOT, "public", f))) missing.push(f);
      }
    }
    if (missing.length) throw new Error(`${missing.length} missing, e.g. ${missing[0]}`);
    return `${open.length} open, all rendered`;
  },
  { group: "content" }
);

// THE check this file was missing. Every "is the 13:00 posted?" message the
// owner has ever sent is this question. A slot whose time has passed and whose
// status is still pending is a silent no-op - the exact failure class that
// throws nothing and logs nothing.
await check(
  "nothing overdue",
  async () => {
    const queue = await readState("queue.json", []);
    const now = Date.now();
    const GRACE_MIN = 90; // publish is hourly and reel runs twice a day
    const late = queue
      .filter(
        (p) =>
          p.status !== "posted" &&
          p.status !== "reject" &&
          p.scheduledFor &&
          now - new Date(p.scheduledFor).getTime() > GRACE_MIN * 60_000
      )
      .sort((a, b) => new Date(a.scheduledFor) - new Date(b.scheduledFor));

    if (late.length) {
      const worst = late[0];
      const mins = Math.round((now - new Date(worst.scheduledFor).getTime()) / 60_000);
      throw new Error(
        `${late.length} past due - ${eat(worst.scheduledFor)} EAT ${worst.format} ` +
          `"${worst.headline?.slice(0, 40) ?? worst.id}" is ${Math.floor(mins / 60)}h${mins % 60}m late (${worst.status})`
      );
    }
    return "every slot on time";
  },
  { group: "content" }
);

// A post held for an unapproved figure never publishes and never complains.
await check(
  "nothing stuck in review",
  async () => {
    const queue = await readState("queue.json", []);
    const held = queue.filter((p) => p.status === "needs-review");
    if (held.length) {
      return { warn: `${held.length} held: "${held[0].headline?.slice(0, 50)}" - a figure is not in facts.md` };
    }
    return "none held";
  },
  { group: "content", level: "warn" }
);

// The planner runs at 21:00 for tomorrow. If it failed, the queue is empty and
// nobody finds out until 08:00 the next morning.
await check(
  "tomorrow is planned",
  async () => {
    const { readConfig } = await import("../src/config.js");
    const cfg = await readConfig();
    const queue = await readState("queue.json", []);
    const now = new Date();
    const ahead = queue.filter(
      (p) =>
        p.status !== "posted" &&
        p.status !== "reject" &&
        new Date(p.scheduledFor) > now &&
        new Date(p.scheduledFor) - now < 36 * 3600_000
    );
    // Before the 21:00 planner has run, having only the rest of today is normal.
    if (!ahead.length) throw new Error("nothing at all queued for the next 36 hours");
    if (ahead.length < cfg.slots.length) {
      return {
        warn: `only ${ahead.length} queued for the next 36h against ${cfg.slots.length} slots a day - fine before 21:00 EAT, a planner failure after`,
      };
    }
    return `${ahead.length} queued: ${ahead.map((p) => `${eat(p.scheduledFor)} ${p.format}`).join(", ")}`;
  },
  { group: "content" }
);

// Buying signals are escalated to a human on purpose. A human who never answers
// is worse than a bot that did.
await check(
  "leads answered",
  async () => {
    const leads = await readState("leads.json", []);
    const open = leads.filter((l) => !l.answeredAt);
    if (!open.length) return `${leads.length} seen, none waiting`;
    const oldest = open.reduce((a, b) => (a.seenAt < b.seenAt ? a : b));
    const days = Math.floor((Date.now() - new Date(oldest.seenAt)) / 86_400_000);
    return {
      warn: `${open.length} waiting on a human, oldest ${days}d: "${oldest.text?.slice(0, 40)}" (${oldest.platform})`,
    };
  },
  { group: "content", level: "warn" }
);

// == publish ==================================================================

await check(
  "publish path executes",
  async () => {
    const { stdout } = await run(process.execPath, ["src/cli-publish.js"], {
      cwd: ROOT,
      env: { ...process.env, DRY_RUN: "1" },
    });
    if (/ReferenceError|TypeError|is not defined/.test(stdout)) throw new Error(stdout.slice(0, 160));
    return stdout.includes("Nothing due") ? "ran (nothing due)" : "ran";
  },
  { group: "publish" }
);

// Comment handling is the path that failed most silently: a denied permission
// reads as "no comments" and the job exits 0 either way.
await check(
  "engage path executes",
  async () => {
    const { stdout, stderr } = await run(process.execPath, ["src/cli-engage.js"], {
      cwd: ROOT,
      env: { ...process.env, DRY_RUN: "1" },
    });
    const out = `${stdout}\n${stderr}`;
    if (/ReferenceError|TypeError|is not defined/.test(out)) throw new Error(out.slice(0, 160));
    return "ran";
  },
  { group: "publish", net: true }
);

// Instagram fetches media server-side. If Pages has not deployed the file yet,
// publishing builds a container against a 404 and fails at the last step.
await check(
  "assets publicly reachable",
  async () => {
    const base = process.env.PUBLIC_ASSET_BASE;
    if (!base) throw new Error("PUBLIC_ASSET_BASE is not set");
    const { assertAssetReachable } = await import("../src/guards.js");
    const queue = await readState("queue.json", []);
    const next = queue.find(
      (p) => p.status !== "posted" && p.status !== "reject" && p.format !== "reel"
    );
    if (!next) return "no poster queued to test";
    const file =
      next.format === "carousel" && next.slideFiles?.length ? next.slideFiles[0] : `${next.id}.png`;
    await assertAssetReachable(`${base.replace(/\/$/, "")}/${file}`);
    return `Pages is serving ${file}`;
  },
  { group: "publish", net: true }
);

// == brain ====================================================================

// Report WHICH provider answered. The chain is designed to survive an exhausted
// quota, so "gemini is down but groq answered" is a warning, not a pass.
await check(
  "brain responds",
  async () => {
    const { completeJson } = await import("../src/llm.js");
    const warnings = [];
    const orig = console.warn;
    console.warn = (...a) => warnings.push(a.join(" "));
    try {
      const r = await completeJson('Return ONLY JSON: {"ok":true}', { fast: true });
      if (!r?.ok) throw new Error("answered, but not with what was asked for");
    } finally {
      console.warn = orig;
    }
    if (warnings.length) {
      return { warn: `answered, but ${warnings.length} model(s) failed first: ${warnings[0].slice(0, 90)}` };
    }
    return "first model answered";
  },
  { group: "brain", net: true }
);

await check(
  "poster renders",
  async () => {
    const { renderPoster } = await import("../src/render.js");
    const queue = await readState("queue.json", []);
    // Render something that is actually a poster; a reel entry has no template.
    const sample = [...queue].reverse().find((p) => p.format !== "reel") ?? queue[queue.length - 1];
    if (!sample) return { warn: "skipped - the queue is empty" };
    const out = path.join(ROOT, "state", "frames", "preflight.png");
    await renderPoster(sample, sample.brand ?? "operra", out);
    if (!existsSync(out)) throw new Error("renderPoster returned without writing a file");
    await rm(out, { force: true });
    return "ok";
  },
  { group: "brain", net: true }
);

// == credentials ==============================================================

const debugToken = async () => {
  const t = process.env.FB_PAGE_ACCESS_TOKEN;
  if (!t) throw new Error("FB_PAGE_ACCESS_TOKEN is not set");
  const r = await fetch(
    `https://graph.facebook.com/v21.0/debug_token?input_token=${encodeURIComponent(t)}`,
    { headers: { authorization: `Bearer ${t}` } }
  );
  const j = await r.json();
  if (j.error) throw new Error(j.error.message);
  return j.data ?? {};
};

await check(
  "meta token",
  async () => {
    const data = await debugToken();
    if (!data.is_valid) throw new Error("token is not valid");
    if (!data.expires_at) return "never expires";
    const days = Math.round((data.expires_at * 1000 - Date.now()) / 86_400_000);
    if (days < 14) return { warn: `expires in ${days} days - re-run scripts/exchange-token.js` };
    return `expires in ${days} days`;
  },
  { group: "creds", net: true }
);

await check(
  "meta comment scopes",
  async () => {
    const data = await debugToken();
    const scopes = new Set(data.scopes ?? []);
    const need = ["pages_read_user_content", "pages_manage_engagement", "instagram_manage_comments"];
    const missing = need.filter((s) => !scopes.has(s));
    if (missing.length) throw new Error(`missing: ${missing.join(", ")}`);
    return "all present";
  },
  { group: "creds", net: true }
);

await check(
  "facebook page",
  async () => {
    const { graphGet } = await import("../src/graph.js");
    const id = process.env.FB_PAGE_ID;
    if (!id) throw new Error("FB_PAGE_ID is not set");
    const p = await graphGet(id, {
      fields: "name,username,fan_count",
      access_token: process.env.FB_PAGE_ACCESS_TOKEN,
    });
    // Findability was flagged as the cheapest available win and never done.
    const named = p.username ? `/${p.username}` : "no username set";
    return `${p.name} - ${p.fan_count ?? "?"} followers, ${named}`;
  },
  { group: "creds", net: true }
);

await check(
  "instagram account",
  async () => {
    const { graphGet } = await import("../src/graph.js");
    const id = process.env.IG_USER_ID;
    if (!id) throw new Error("IG_USER_ID is not set");
    const p = await graphGet(id, {
      fields: "username,followers_count,media_count",
      access_token: process.env.FB_PAGE_ACCESS_TOKEN,
    });
    return `@${p.username} - ${p.followers_count ?? "?"} followers, ${p.media_count ?? "?"} posts`;
  },
  { group: "creds", net: true }
);

await check(
  "telegram reachable",
  async () => {
    if (!process.env.TELEGRAM_BOT_TOKEN) throw new Error("TELEGRAM_BOT_TOKEN is not set");
    const r = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getMe`);
    const j = await r.json();
    if (!j.ok) throw new Error(j.description ?? "getMe failed");
    if (!process.env.TELEGRAM_CHAT_ID) return { warn: `@${j.result.username}, but TELEGRAM_CHAT_ID is not set` };
    return `@${j.result.username}`;
  },
  { group: "creds", net: true }
);

await check(
  "whatsapp mirror",
  async () => {
    const { whatsappConfigured } = await import("../src/notify.js");
    if (!whatsappConfigured()) return { warn: "not configured - alerts are Telegram only" };
    return "configured";
  },
  { group: "creds", level: "warn" }
);

// Reading the sealed token proves METRICOOL_KEY still matches the ciphertext.
// If a rotation half-committed, this is where it shows.
await check(
  "metricool token decrypts",
  async () => {
    const { unseal, sealedPath } = await import("../src/secretstore.js");
    if (!existsSync(sealedPath("metricool"))) throw new Error("state/metricool.enc is missing");
    const tok = await unseal("metricool");
    if (!tok) throw new Error("unsealed to nothing");
    const saved = JSON.parse(await readFile(sealedPath("metricool"), "utf8")).updated;
    return `sealed token reads back, last rotated ${saved?.slice(0, 16) ?? "?"}`;
  },
  { group: "creds" }
);

// Every Metricool call rotates the refresh token, so this check must run in a
// job with contents: write or it destroys the credential just by looking.
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
    if (!nets.includes("tiktok")) {
      return { warn: `connected, but TikTok is not among them: ${nets.join(", ") || "none"}` };
    }
    return nets.join(", ");
  },
  { group: "creds", level: "warn", net: true }
);

await check(
  "google sheet",
  async () => {
    if (!process.env.SHEET_ID || !process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
      return { warn: "not configured - no human review surface" };
    }
    const sheet = await import("../src/sheet.js");
    if (typeof sheet.sheetConfigured === "function" && !sheet.sheetConfigured()) {
      return { warn: "credentials present but the module reports it unconfigured" };
    }
    return "configured";
  },
  { group: "creds", level: "warn" }
);

// == media ====================================================================

// The reel pipeline is the only path with binary dependencies, and both of its
// failure modes are quiet: no ffmpeg means no video, and a bad edge-tts flag
// falls through to the synthesised pad without ever saying so.
await check(
  "ffmpeg present",
  async () => {
    const { stdout } = await run("ffmpeg", ["-version"]);
    return stdout.split("\n")[0].slice(0, 60);
  },
  { group: "media", level: "warn" }
);

await check(
  "edge-tts present",
  async () => {
    // The flag form matters: `--rate -4%` is parsed as another flag and every
    // voiceover silently uses the fallback voice instead.
    const { stdout, stderr } = await run("edge-tts", ["--list-voices"], {
      maxBuffer: 1024 * 1024 * 8,
    });
    const out = stdout || stderr;
    if (!/sw-TZ/.test(out)) return { warn: "installed, but no sw-TZ voice is offered" };
    return "installed, sw-TZ available";
  },
  { group: "media", level: "warn" }
);

// == report ===================================================================

const failed = results.filter((r) => r.state === "fail");
const warned = results.filter((r) => r.state === "warn");
const passed = results.filter((r) => r.state === "pass");

if (JSON_OUT) {
  console.log(JSON.stringify({ failed: failed.length, warned: warned.length, passed: passed.length, results }, null, 2));
} else {
  const MARK = { pass: "PASS", warn: "WARN", fail: "FAIL", skip: "SKIP" };
  let group = null;
  console.log("");
  for (const r of results) {
    if (r.group !== group) {
      group = r.group;
      console.log(`-- ${group} ${"-".repeat(Math.max(0, 60 - group.length))}`);
    }
    console.log(`  ${MARK[r.state]}  ${r.name.padEnd(26)} ${r.detail ?? ""}`);
  }
  console.log(
    `\n${passed.length} passed, ${warned.length} warned, ${failed.length} failed` +
      (QUICK ? " (--quick: network checks skipped)" : "")
  );
}

const mode = process.env.PREFLIGHT_NOTIFY;
if (mode === "always" || (mode === "1" && (failed.length || warned.length))) {
  const { notify } = await import("../src/notify.js");
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const head = failed.length
    ? `\u{1F6A8} <b>Preflight: ${failed.length} fault${failed.length > 1 ? "s" : ""}</b>`
    : warned.length
      ? `⚠️ <b>Preflight: ${warned.length} thing${warned.length > 1 ? "s" : ""} to know</b>`
      : "✅ <b>Preflight: all clear</b>";

  const lines = [head, ""];

  // Faults first, then warnings. A wall of passes buries the one line that matters.
  for (const r of failed) lines.push(`❌ <b>${esc(r.name)}</b>\n   ${esc(r.detail)}`);
  if (failed.length && warned.length) lines.push("");
  for (const r of warned) lines.push(`⚠️ <b>${esc(r.name)}</b>\n   ${esc(r.detail)}`);

  // The owner asks "what is the routine / is it paused / what's queued" often
  // enough that the answers belong in every report, not only in a failing one.
  const facts = results.filter((r) =>
    ["config valid", "tomorrow is planned", "facebook page", "instagram account"].includes(r.name)
  );
  if (facts.length) {
    lines.push("", "<b>Where things stand</b>");
    for (const r of facts) lines.push(`• ${esc(r.name)}: ${esc(r.detail)}`);
  }

  lines.push("", `<i>${passed.length} passed · ${warned.length} warned · ${failed.length} failed</i>`);
  await notify(lines.join("\n"));
}

process.exitCode = failed.length ? 1 : 0;
