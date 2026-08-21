/**
 * TikTok, via Metricool's hosted MCP.
 *
 * TikTok's own Content Posting API only allows PUBLIC posts once your app passes
 * their audit; unaudited apps are forced to private. Metricool is already
 * audited, so scheduling through them posts publicly with no audit of our own —
 * and their MCP works on the free plan.
 *
 * Auth is OAuth 2.1: the owner approves once (scripts/metricool-auth.mjs) and we
 * mint access tokens from the stored refresh token thereafter.
 */
const MCP = "https://ai.metricool.com/mcp";
const TOKEN_URL = "https://app.metricool.com/oauth/token";

export const id = "tiktok";

export function tiktokConfigured() {
  return Boolean(process.env.METRICOOL_OAUTH && process.env.METRICOOL_BLOG_ID);
}

function credentials() {
  const raw = process.env.METRICOOL_OAUTH;
  if (!raw) throw new Error("METRICOOL_OAUTH is not set — run scripts/metricool-auth.mjs");
  const c = JSON.parse(raw);
  if (!c.refresh_token) throw new Error("stored Metricool credentials have no refresh_token");
  return c;
}

/** Refresh tokens are long-lived; access tokens are minted per run. */
async function accessToken() {
  const c = credentials();
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: c.refresh_token,
    client_id: c.client_id,
    resource: MCP,
  });
  if (c.client_secret) body.set("client_secret", c.client_secret);

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await res.json();
  if (!json.access_token) {
    throw new Error(`Metricool token refresh failed: ${JSON.stringify(json).slice(0, 200)}`);
  }
  return json.access_token;
}

let rpcId = 0;

/**
 * MCP is JSON-RPC over HTTP. Responses may come back as SSE, so both shapes are
 * handled rather than assuming one.
 */
async function rpc(token, method, params, sessionId) {
  const headers = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    authorization: `Bearer ${token}`,
  };
  if (sessionId) headers["mcp-session-id"] = sessionId;

  const res = await fetch(MCP, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
    signal: AbortSignal.timeout(60_000),
  });

  const session = res.headers.get("mcp-session-id") ?? sessionId;
  const text = await res.text();
  if (!res.ok) throw new Error(`MCP ${method} ${res.status}: ${text.slice(0, 200)}`);
  if (!text.trim()) return { result: null, session };

  // SSE frames look like: event: message\ndata: {...}
  const payload = text.includes("data:")
    ? text.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("")
    : text;

  const json = JSON.parse(payload);
  if (json.error) throw new Error(`MCP ${method}: ${json.error.message ?? JSON.stringify(json.error)}`);
  return { result: json.result, session };
}

async function connect() {
  const token = await accessToken();
  const { result, session } = await rpc(token, "initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "social-autopilot", version: "1.0" },
  });
  return { token, session, server: result?.serverInfo?.name };
}

/** Names change; discover rather than hard-code the scheduling tool. */
export async function listTools() {
  const { token, session } = await connect();
  const { result } = await rpc(token, "tools/list", {}, session);
  return (result?.tools ?? []).map((t) => ({ name: t.name, description: t.description }));
}

/**
 * @param {object} opts
 *   videoUrl   public MP4
 *   caption    post text, hashtags included
 *   when       ISO time to schedule, or null for as soon as possible
 */
export async function publishTikTok({ videoUrl, caption, when = null, dryRun }) {
  if (dryRun) {
    console.log(`[dry-run] tiktok -> ${videoUrl}`);
    return { platform: "tiktok", postId: "dry-run" };
  }

  const { token, session } = await connect();
  const { result: toolList } = await rpc(token, "tools/list", {}, session);
  const tools = toolList?.tools ?? [];
  const scheduler =
    tools.find((t) => /schedule.*post|post.*schedule/i.test(t.name)) ??
    tools.find((t) => /publish/i.test(t.name));
  if (!scheduler) {
    throw new Error(`no scheduling tool found. Available: ${tools.map((t) => t.name).join(", ")}`);
  }

  const at = when ?? new Date(Date.now() + 5 * 60_000).toISOString();
  const { result } = await rpc(
    token,
    "tools/call",
    {
      name: scheduler.name,
      arguments: {
        blogId: Number(process.env.METRICOOL_BLOG_ID),
        userId: Number(process.env.METRICOOL_USER_ID),
        providers: ["tiktok"],
        text: caption,
        media: [videoUrl],
        publicationDate: at,
        autoPublish: true,
      },
    },
    session
  );

  const text = (result?.content ?? []).map((c) => c.text ?? "").join(" ");
  if (result?.isError) throw new Error(`TikTok schedule failed: ${text.slice(0, 200)}`);
  console.log(`  scheduled for ${at}`);
  return { platform: "tiktok", postId: text.slice(0, 80) || "scheduled", scheduledFor: at };
}
