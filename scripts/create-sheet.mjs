/**
 * One-off: create the review Sheet with the service account and share it with the
 * owner so it shows up in their Drive.
 *
 *   GOOGLE_SERVICE_ACCOUNT_JSON=... SHEET_OWNER_EMAIL=... node scripts/create-sheet.mjs
 */
import { createSign } from "node:crypto";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive",
].join(" ");

const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const creds = JSON.parse(existsSync(raw) ? await readFile(raw, "utf8") : raw);
const owner = process.env.SHEET_OWNER_EMAIL;
if (!owner) throw new Error("Set SHEET_OWNER_EMAIL");

const b64url = (i) =>
  Buffer.from(i).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const now = Math.floor(Date.now() / 1000);
const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
const claims = b64url(
  JSON.stringify({
    iss: creds.client_email,
    scope: SCOPES,
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  })
);
const signer = createSign("RSA-SHA256");
signer.update(`${header}.${claims}`);
const jwt = `${header}.${claims}.${b64url(signer.sign(creds.private_key))}`;

const tok = await (
  await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  })
).json();
if (!tok.access_token) throw new Error(`auth failed: ${tok.error_description ?? tok.error}`);
const auth = { authorization: `Bearer ${tok.access_token}`, "content-type": "application/json" };

const created = await (
  await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      properties: { title: "Operra Social Autopilot — Calendar" },
      sheets: [{ properties: { title: process.env.SHEET_TAB ?? "Calendar" } }],
    }),
  })
).json();
if (created.error) throw new Error(`create failed: ${created.error.message}`);
console.log(`SHEET_ID: ${created.spreadsheetId}`);
console.log(`URL     : ${created.spreadsheetUrl}`);

const share = await (
  await fetch(
    `https://www.googleapis.com/drive/v3/files/${created.spreadsheetId}/permissions?sendNotificationEmail=false`,
    {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ role: "writer", type: "user", emailAddress: owner }),
    }
  )
).json();
console.log(
  share.error ? `share FAILED: ${share.error.message}` : `shared with ${owner} as writer`
);
