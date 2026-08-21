const t = process.env.FB_PAGE_ACCESS_TOKEN, V = "v21.0";
for (const id of process.argv.slice(2)) {
  const r = await fetch(`https://graph.facebook.com/${V}/${id}?fields=id,status,permalink_url,description,post_views`, {
    headers: { authorization: `Bearer ${t}` } });
  const j = await r.json();
  if (j.error) { console.log(id, "ERR", j.error.message.slice(0, 70)); continue; }
  console.log(`${id}  ${j.status?.video_status ?? "?"}  ${j.status?.publishing_phase?.publish_status ?? ""}`);
  console.log(`   https://www.facebook.com${j.permalink_url ?? ""}`);
}
