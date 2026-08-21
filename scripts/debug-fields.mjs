const t = process.env.FB_PAGE_ACCESS_TOKEN, V = "v21.0";
const id = "1049514968255534_122140208247351110";
for (const f of ["id,message", "id,message,created_time", "id,message,permalink_url", "id,message,from{name}", "id,message,from"]) {
  const r = await fetch(`https://graph.facebook.com/${V}/${id}/comments?fields=${encodeURIComponent(f)}&limit=3`,
    { headers: { authorization: `Bearer ${t}` } });
  const j = await r.json();
  console.log(`${f.padEnd(30)} ${r.status} ${j.error ? j.error.message.slice(0, 55) : `ok (${(j.data??[]).length})`}`);
}
