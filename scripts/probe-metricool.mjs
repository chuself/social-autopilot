/** Does the hosted MCP answer, and what does it want for auth? */
const url = "https://ai.metricool.com/mcp";
const body = {
  jsonrpc: "2.0", id: 1, method: "initialize",
  params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "probe", version: "1" } },
};
const headers = { "content-type": "application/json", accept: "application/json, text/event-stream" };
if (process.env.MC_AUTH) headers["X-Mc-Auth"] = process.env.MC_AUTH;

const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(25000) });
console.log("status:", r.status);
for (const h of ["www-authenticate", "content-type"]) {
  const v = r.headers.get(h);
  if (v) console.log(`${h}: ${v}`);
}
console.log((await r.text()).slice(0, 500));
