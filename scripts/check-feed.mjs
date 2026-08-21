const t = process.env.FB_PAGE_ACCESS_TOKEN, id = process.env.FB_PAGE_ID, V = "v21.0";
const get = async (edge, fields, extra = "") => {
  const r = await fetch(`https://graph.facebook.com/${V}/${edge}?fields=${fields}${extra}`, {
    headers: { authorization: `Bearer ${t}` } });
  return r.json();
};
const feed = await get(`${id}/feed`, "id,created_time,status_type,type,message,attachments{media_type,type},is_published");
console.log("=== /feed (what followers see) ===");
for (const p of (feed.data ?? [])) {
  const a = p.attachments?.data?.[0];
  console.log(`${p.created_time}  status_type=${p.status_type}  attach=${a?.type ?? "-"}/${a?.media_type ?? "-"}`);
  console.log(`   ${(p.message ?? "(no message)").slice(0, 60)}`);
}
if (feed.error) console.log("feed error:", feed.error.message);

const vids = await get(`${id}/video_reels`, "id,description,post_views,status");
console.log("\n=== /video_reels (actual FB Reels) ===");
console.log(vids.error ? `error: ${vids.error.message}` : JSON.stringify(vids.data ?? [], null, 1).slice(0, 400));
