const t = process.env.FB_PAGE_ACCESS_TOKEN, V = "v21.0";
const get = async (edge, fields) => {
  const r = await fetch(`https://graph.facebook.com/${V}/${edge}?fields=${fields}`, {
    headers: { authorization: `Bearer ${t}` } });
  return r.json();
};

const ig = await get(process.argv[2], "id,media_type,media_url,permalink,children{id,media_type},comments_count");
console.log("INSTAGRAM");
console.log("  type      :", ig.media_type);
console.log("  slides    :", (ig.children?.data ?? []).length);
console.log("  permalink :", ig.permalink);
if (ig.error) console.log("  ERROR:", ig.error.message);

const fb = await get(process.argv[3], "id,created_time,permalink_url,attachments{subattachments}");
console.log("\nFACEBOOK");
const subs = fb.attachments?.data?.[0]?.subattachments?.data ?? [];
console.log("  photos    :", subs.length);
console.log("  permalink :", fb.permalink_url);
if (fb.error) console.log("  ERROR:", fb.error.message);

for (const [name, id] of [["instagram", process.argv[2]], ["facebook", process.argv[3]]]) {
  const c = await get(`${id}/comments`, "id,text,message");
  const first = (c.data ?? [])[0];
  console.log(`\n${name} first comment:`, first ? (first.text ?? first.message ?? "").slice(0, 60) : (c.error?.message ?? "none"));
}
