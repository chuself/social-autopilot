const token = process.env.FB_PAGE_ACCESS_TOKEN;
const V = "v21.0";
for (const id of process.argv.slice(2)) {
  const res = await fetch(
    `https://graph.facebook.com/${V}/${id}?fields=id,name,username,category`,
    { headers: { authorization: `Bearer ${token}` } }
  );
  const j = await res.json();
  console.log(
    String(id).padEnd(20),
    j.error ? `ERROR: ${j.error.message.slice(0, 90)}` : JSON.stringify(j)
  );
}
