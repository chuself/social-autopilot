#!/usr/bin/env node
/**
 * Turn a short-lived user token into a Page token that does not expire.
 *
 *   FB_APP_ID=... FB_APP_SECRET=... FB_USER_TOKEN=... node scripts/exchange-token.js
 *
 * Short-lived user token (~1-2h)
 *   -> long-lived user token (60 days)
 *   -> Page token derived from it (no expiry, as long as the user stays admin)
 */
const V = "v21.0";
const appId = need("FB_APP_ID");
const appSecret = need("FB_APP_SECRET");
const userToken = need("FB_USER_TOKEN");
const pageId = process.env.FB_PAGE_ID;

function need(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Set ${name}`);
  return v;
}

const longRes = await fetch(
  `https://graph.facebook.com/${V}/oauth/access_token?` +
    new URLSearchParams({
      grant_type: "fb_exchange_token",
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: userToken,
    })
);
const long = await longRes.json();
if (long.error) throw new Error(`exchange failed: ${long.error.message}`);
console.log(`long-lived user token: ${long.access_token.slice(0, 12)}… (expires in ${Math.round((long.expires_in ?? 0) / 86400)} days)`);

const target = pageId ?? (await firstPageId(long.access_token));
const pageRes = await fetch(
  `https://graph.facebook.com/${V}/${target}?fields=id,name,access_token`,
  { headers: { authorization: `Bearer ${long.access_token}` } }
);
const page = await pageRes.json();
if (page.error) throw new Error(`page token failed: ${page.error.message}`);

const check = await (
  await fetch(
    `https://graph.facebook.com/${V}/debug_token?input_token=${encodeURIComponent(page.access_token)}`,
    { headers: { authorization: `Bearer ${long.access_token}` } }
  )
).json();
const expires = check.data?.expires_at;
console.log(`page token for ${page.name}: expires ${expires ? new Date(expires * 1000).toISOString() : "NEVER"}`);

const { writeFileSync } = await import("node:fs");
writeFileSync(".page-token", page.access_token);
console.log("written to .page-token (gitignored)");
console.log("\nNow run:  gh secret set FB_PAGE_ACCESS_TOKEN < .page-token");

async function firstPageId(token) {
  const r = await (
    await fetch(`https://graph.facebook.com/${V}/me/accounts?fields=id`, {
      headers: { authorization: `Bearer ${token}` },
    })
  ).json();
  const id = r.data?.[0]?.id;
  if (!id) throw new Error("No page found — pass FB_PAGE_ID");
  return id;
}
