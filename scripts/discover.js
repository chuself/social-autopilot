#!/usr/bin/env node
/**
 * One-off setup helper: given a user token, find the Page id, the Page access
 * token and the linked Instagram Business account id.
 *
 *   FB_USER_TOKEN=... node scripts/discover.js
 */
const token = process.env.FB_USER_TOKEN;
if (!token) throw new Error("Set FB_USER_TOKEN");
const V = "v21.0";

const get = async (edge, fields) => {
  const res = await fetch(`https://graph.facebook.com/${V}/${edge}?fields=${fields}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  return res.json();
};

const debug = await (
  await fetch(`https://graph.facebook.com/${V}/debug_token?input_token=${encodeURIComponent(token)}`, {
    headers: { authorization: `Bearer ${token}` },
  })
).json();

const d = debug.data ?? {};
console.log(`token type    : ${d.type}`);
console.log(`expires       : ${d.expires_at ? new Date(d.expires_at * 1000).toISOString() : "never"}`);
console.log(`scopes        : ${(d.scopes ?? []).join(", ")}`);

const pageIds = new Set();
const igIds = new Set();
for (const g of d.granular_scopes ?? []) {
  for (const t of g.target_ids ?? []) (g.scope.startsWith("instagram") ? igIds : pageIds).add(t);
}

for (const pageId of pageIds) {
  const page = await get(pageId, "id,name,access_token,instagram_business_account{id,username}");
  if (page.error) {
    console.log(`\npage ${pageId}: ERROR ${page.error.message}`);
    continue;
  }
  console.log(`\nFB_PAGE_ID    : ${page.id}   (${page.name})`);
  console.log(`page token    : ${page.access_token ? page.access_token.slice(0, 12) + "…(" + page.access_token.length + " chars)" : "NOT RETURNED"}`);
  if (page.instagram_business_account) {
    console.log(`IG_USER_ID    : ${page.instagram_business_account.id}  (@${page.instagram_business_account.username})`);
  }
  if (page.access_token) {
    const { writeFileSync } = await import("node:fs");
    writeFileSync(".page-token", page.access_token);
    console.log(`page token written to .page-token (gitignored)`);
  }
}

for (const igId of igIds) {
  const ig = await get(igId, "id,username");
  console.log(`\nIG account    : ${ig.error ? "ERROR " + ig.error.message : `${ig.id} (@${ig.username})`}`);
}
