const t = process.env.FB_PAGE_ACCESS_TOKEN, V = "v21.0";
const d = await (await fetch(`https://graph.facebook.com/${V}/debug_token?input_token=${encodeURIComponent(t)}`,
  { headers: { authorization: `Bearer ${t}` } })).json();
const have = new Set(d.data?.scopes ?? []);
console.log("token has:", [...have].join(", "));
const need = {
  "pages_read_user_content": "read comments other people leave on your posts",
  "pages_manage_engagement": "reply to / hide / like comments",
  "instagram_manage_comments": "read and reply to Instagram comments",
};
console.log("\nmissing for the comment responder:");
for (const [scope, why] of Object.entries(need)) {
  if (!have.has(scope)) console.log(`  ✗ ${scope.padEnd(28)} ${why}`);
  else console.log(`  ✓ ${scope}`);
}
// prove the IG side too
const ig = await (await fetch(`https://graph.facebook.com/${V}/${process.env.IG_USER_ID}/media?fields=id,comments_count&limit=2`,
  { headers: { authorization: `Bearer ${t}` } })).json();
console.log("\nIG media read:", ig.error ? `ERR ${ig.error.message.slice(0,70)}` : `ok (${(ig.data??[]).length} items)`);
if (ig.data?.[0]) {
  const c = await (await fetch(`https://graph.facebook.com/${V}/${ig.data[0].id}/comments?fields=id,text`,
    { headers: { authorization: `Bearer ${t}` } })).json();
  console.log("IG comments read:", c.error ? `ERR ${c.error.message.slice(0,70)}` : `ok (${(c.data??[]).length})`);
}
