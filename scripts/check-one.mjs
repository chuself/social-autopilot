const t = process.env.FB_PAGE_ACCESS_TOKEN, V = "v21.0";
const r = await fetch(`https://graph.facebook.com/${V}/${process.argv[2]}?fields=id,created_time,status_type,message,is_published,permalink_url`, {
  headers: { authorization: `Bearer ${t}` } });
const j = await r.json();
console.log(JSON.stringify(j, null, 1));
