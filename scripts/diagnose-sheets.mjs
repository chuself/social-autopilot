/**
 * Ask Google which project it is actually enforcing against — the error text
 * names the project number when an API is disabled.
 */
import { createSign } from "node:crypto";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const creds = JSON.parse(existsSync(raw) ? await readFile(raw, "utf8") : raw);
console.log(`service account : ${creds.client_email}`);
console.log(`its project     : ${creds.project_id}`);

const b64url = (i) =>
  Buffer.from(i).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function token(scope) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({ iss: creds.client_email, scope, aud: "https://oauth2.googleapis.com/token", exp: now + 3600, iat: now })
  );
  const s = createSign("RSA-SHA256");
  s.update(`${header}.${claims}`);
  const jwt = `${header}.${claims}.${b64url(s.sign(creds.private_key))}`;
  const r = await (
    await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
    })
  ).json();
  if (!r.access_token) throw new Error(`auth: ${r.error_description ?? r.error}`);
  return r.access_token;
}

for (const [name, scope, url] of [
  ["Sheets", "https://www.googleapis.com/auth/spreadsheets", "https://sheets.googleapis.com/v4/spreadsheets/1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"],
  ["Drive", "https://www.googleapis.com/auth/drive", "https://www.googleapis.com/drive/v3/files?pageSize=1"],
]) {
  try {
    const t = await token(scope);
    const res = await fetch(url, { headers: { authorization: `Bearer ${t}` } });
    const j = await res.json();
    console.log(`\n${name}: HTTP ${res.status}`);
    console.log(`  ${(j.error?.message ?? "OK").slice(0, 300)}`);
  } catch (e) {
    console.log(`\n${name}: ${e.message}`);
  }
}
