/** Can we register a client at all, without any credentials? */
const r = await fetch("https://app.metricool.com/oauth/register", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    client_name: "Operra Social Autopilot",
    redirect_uris: ["http://127.0.0.1:8765/callback"],
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
    scope: "mcp:read mcp:write",
  }),
  signal: AbortSignal.timeout(25000),
});
console.log("status:", r.status);
const t = await r.text();
console.log(t.slice(0, 400));
