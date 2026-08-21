import { readFile } from "node:fs/promises";
const c = JSON.parse(await readFile(".metricool.json", "utf8"));
const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: c.refresh_token, client_id: c.client_id, resource: "https://ai.metricool.com/mcp" });
const r = await fetch("https://app.metricool.com/oauth/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
const j = await r.json();
console.log("refresh status:", r.status);
console.log("access_token:", j.access_token ? "ok" : "NONE");
console.log("new refresh_token returned:", j.refresh_token ? (j.refresh_token === c.refresh_token ? "same" : "ROTATED") : "none");
if (j.error) console.log("error:", j.error, j.error_description ?? "");
