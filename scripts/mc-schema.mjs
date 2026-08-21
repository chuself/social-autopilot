import { readFile } from "node:fs/promises";
const MCP = "https://ai.metricool.com/mcp";
const c = JSON.parse(await readFile(".metricool.json", "utf8"));
const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: c.refresh_token, client_id: c.client_id, resource: MCP });
const tok = await (await fetch("https://app.metricool.com/oauth/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body })).json();
let id = 0, session;
async function rpc(method, params) {
  const h = { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${tok.access_token}` };
  if (session) h["mcp-session-id"] = session;
  const r = await fetch(MCP, { method: "POST", headers: h, body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }) });
  session = r.headers.get("mcp-session-id") ?? session;
  const t = await r.text();
  const p = t.includes("data:") ? t.split("\n").filter(l => l.startsWith("data:")).map(l => l.slice(5).trim()).join("") : t;
  return p ? JSON.parse(p) : {};
}
await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "probe", version: "1" } });
const list = await rpc("tools/list", {});
const tools = list.result?.tools ?? [];
const t = tools.find(x => x.name === process.argv[2]);
if (!t) { console.log("not found. have:", tools.map(x=>x.name).join(", ")); process.exit(0); }
console.log("KEYS:", Object.keys(t).join(", "));
console.log("DESC:", (t.description ?? "").slice(0, 400));
const schema = t.inputSchema ?? t.input_schema ?? t.parameters;
console.log(JSON.stringify(schema, null, 1).slice(0, 3000));
