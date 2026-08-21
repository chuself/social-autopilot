/**
 * One-time Metricool authorisation.
 *
 * Metricool's MCP speaks OAuth 2.1 with dynamic client registration, PKCE and
 * refresh tokens — so the owner approves once in a browser and the pipeline
 * mints its own access tokens from then on. No API key, no paid plan.
 *
 *   node scripts/metricool-auth.mjs
 *
 * Writes .metricool.json (gitignored) with the client id/secret and refresh token.
 */
import { createServer } from "node:http";
import { createHash, randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";

const AS = "https://app.metricool.com/oauth";
const RESOURCE = "https://ai.metricool.com/mcp";
const PORT = Number(process.env.OAUTH_PORT ?? 8765);
const REDIRECT = `http://127.0.0.1:${PORT}/callback`;

const b64url = (b) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

// 1. Register a client for this machine. No credentials needed to register.
const reg = await (
  await fetch(`${AS}/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_name: "Operra Social Autopilot",
      redirect_uris: [REDIRECT],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: "mcp:read mcp:write",
    }),
  })
).json();

if (!reg.client_id) {
  console.error("registration failed:", JSON.stringify(reg).slice(0, 300));
  process.exit(1);
}
console.log(`registered client ${reg.client_id}`);

// 2. PKCE
const verifier = b64url(randomBytes(48));
const challenge = b64url(createHash("sha256").update(verifier).digest());
const state = b64url(randomBytes(12));

const authUrl =
  `${AS}/authorize?` +
  new URLSearchParams({
    response_type: "code",
    client_id: reg.client_id,
    redirect_uri: REDIRECT,
    scope: "mcp:read mcp:write",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    resource: RESOURCE,
  });

console.log("\nOpen this in your browser and approve:\n");
console.log(authUrl);
console.log("\nwaiting for the redirect…");

// 3. Catch the redirect locally — the browser is on this machine, so no public
//    callback host is needed.
const code = await new Promise((resolve, reject) => {
  const server = createServer((req, res) => {
    const u = new URL(req.url, `http://127.0.0.1:${PORT}`);
    if (u.pathname !== "/callback") {
      res.writeHead(404).end("not here");
      return;
    }
    const got = u.searchParams.get("code");
    const err = u.searchParams.get("error");
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(
      `<body style="font:16px system-ui;padding:40px;background:#0b1218;color:#e9eef3">` +
        (got ? "<h2>Connected.</h2><p>You can close this tab.</p>" : `<h2>Failed</h2><p>${err}</p>`) +
        `</body>`
    );
    server.close();
    if (u.searchParams.get("state") !== state) return reject(new Error("state mismatch"));
    got ? resolve(got) : reject(new Error(err ?? "no code"));
  });
  server.listen(PORT, "127.0.0.1");
  setTimeout(() => {
    server.close();
    reject(new Error("timed out waiting for approval"));
  }, Number(process.env.OAUTH_WAIT_MS ?? 900_000)); // 15 min — a 5 min window kept expiring
});

// 4. Exchange for tokens
const body = new URLSearchParams({
  grant_type: "authorization_code",
  code,
  redirect_uri: REDIRECT,
  client_id: reg.client_id,
  code_verifier: verifier,
  resource: RESOURCE,
});
if (reg.client_secret) body.set("client_secret", reg.client_secret);

const tok = await (
  await fetch(`${AS}/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  })
).json();

if (!tok.access_token) {
  console.error("token exchange failed:", JSON.stringify(tok).slice(0, 300));
  process.exit(1);
}

const saved = {
  client_id: reg.client_id,
  client_secret: reg.client_secret ?? null,
  refresh_token: tok.refresh_token ?? null,
  scope: tok.scope,
  obtained: new Date().toISOString(),
};
await writeFile(".metricool.json", JSON.stringify(saved, null, 2));

console.log(`\naccess token ok (expires in ${tok.expires_in ?? "?"}s)`);
console.log(saved.refresh_token ? "refresh token saved to .metricool.json" : "NO refresh token returned");
console.log("\nNext: gh secret set METRICOOL_OAUTH < .metricool.json");
