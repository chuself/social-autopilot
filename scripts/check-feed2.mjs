const t = process.env.FB_PAGE_ACCESS_TOKEN, id = process.env.FB_PAGE_ID, V = "v21.0";
const get = async (edge, fields) => {
  const r = await fetch(`https://graph.facebook.com/${V}/${edge}?fields=${fields}`, {
    headers: { authorization: `Bearer ${t}` } });
  return r.json();
};
const feed = await get(`${id}/feed`, "id,created_time,status_type,message,is_published");
console.log("=== /feed ===");
for (const p of (feed.data ?? [])) {
  console.log(`${p.created_time}  status_type=${p.status_type}  published=${p.is_published}`);
  console.log(`   ${(p.message ?? "(no message)").slice(0, 55)}`);
}
console.log("\n=== reel statuses ===");
for (const rid of ["27999867053007083", "2191800291379153"]) {
  const v = await get(rid, "id,status,published,post_views,permalink_url,content_category");
  console.log(rid, JSON.stringify(v.status ?? v.error?.message ?? v));
  if (v.permalink_url) console.log("   ", v.permalink_url);
}
