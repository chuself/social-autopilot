const t = process.env.FB_PAGE_ACCESS_TOKEN, id = process.env.FB_PAGE_ID, V = "v21.0";
const get = async (edge, fields) => {
  const r = await fetch(`https://graph.facebook.com/${V}/${edge}?fields=${fields}`, {
    headers: { authorization: `Bearer ${t}` } });
  return r.json();
};
const page = await get(id, "id,name,is_published,verification_status,link,fan_count,followers_count,is_webhooks_subscribed,country_page_likes,about,category,new_like_count");
console.log("PAGE:", JSON.stringify(page, null, 1));
const posts = await get(`${id}/posts`, "id,created_time,is_published,privacy,permalink_url,is_hidden,is_expired");
console.log("\nRECENT POSTS:");
for (const p of (posts.data ?? []).slice(0, 6)) {
  console.log(` ${p.created_time} published=${p.is_published} hidden=${p.is_hidden} privacy=${JSON.stringify(p.privacy)}`);
  console.log(`   ${p.permalink_url}`);
}
if (posts.error) console.log("posts error:", posts.error.message);
