const t = process.env.FB_PAGE_ACCESS_TOKEN, id = process.env.FB_PAGE_ID, V = "v21.0";
const get = async (edge, fields) => {
  const r = await fetch(`https://graph.facebook.com/${V}/${edge}?fields=${fields}`, {
    headers: { authorization: `Bearer ${t}` } });
  return r.json();
};
for (const f of ["country_restriction","age_restrictions","is_published","has_added_app",
                 "promotion_eligible","promotion_ineligible_reason","restrictions",
                 "unpublished_content_type","talking_about_count","were_here_count","username",
                 "location","emails","phone","website","published_posts"]) {
  const r = await get(id, f);
  const v = r[f];
  if (r.error) { console.log(`${f.padEnd(28)} ERROR ${r.error.message.slice(0,60)}`); continue; }
  console.log(`${f.padEnd(28)} ${v === undefined ? "(not set)" : JSON.stringify(v).slice(0,120)}`);
}
