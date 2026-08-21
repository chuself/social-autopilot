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
import { writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const AS = "https://app.metricool.com/oauth";
const RESOURCE = "https://ai.metricool.com/mcp";
const PORT = Number(process.env.OAUTH_PORT ?? 8765);
const REDIRECT = `http://127.0.0.1:${PORT}/callback`;

const b64url = (b) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const PENDING = ".metricool-pending.json";

/**
 * Resume mode: finish an approval whose local listener already exited.
 *   node scripts/metricool-auth.mjs --code "http://127.0.0.1:8765/callback?code=..."
 * The PKCE verifier is persisted before waiting, so a timeout no longer throws
 * the authorisation away.
 */
const codeArg = process.argv.includes("--code")
  ? process.argv[process.argv.indexOf("--code") + 1]
  : null;

if (codeArg) {
  if (!existsSync(PENDING)) {
    console.error(`No ${PENDING} — start a fresh run instead.`);
    process.exit(1);
  }
  const pend = JSON.parse(await readFile(PENDING, "utf8"));
  const code = codeArg.includes("code=")
    ? new URL(codeArg).searchParams.get("code")
    : codeArg.trim();
  await exchange(code, pend.client_id, pend.client_secret, pend.verifier);
  process.exit(0);
}

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

await exchange(code, reg.client_id, reg.client_secret, verifier);

async function exchange(code, clientId, clientSecret, codeVerifier) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT,
    client_id: clientId,
    code_verifier: codeVerifier,
    resource: RESOURCE,
  });
  if (clientSecret) body.set("client_secret", clientSecret);

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
    client_id: clientId,
    client_secret: clientSecret ?? null,
    refresh_token: tok.refresh_token ?? null,
    scope: tok.scope,
    obtained: new Date().toISOString(),
  };
  await writeFile(".metricool.json", JSON.stringify(saved, null, 2));

  console.log(`
access token ok (expires in ${tok.expires_in ?? "?"}s)`);
  console.log(saved.refresh_token ? "refresh token saved to .metricool.json" : "NO refresh token returned");
}
