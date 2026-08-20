const token = process.env.FB_PAGE_ACCESS_TOKEN;
const res = await fetch(
  `https://graph.facebook.com/v21.0/${process.argv[2]}?fields=id,permalink,media_type,timestamp,caption`,
  { headers: { authorization: `Bearer ${token}` } }
);
const j = await res.json();
if (j.error) console.log("ERROR:", j.error.message);
else {
  console.log("permalink :", j.permalink);
  console.log("type      :", j.media_type);
  console.log("posted    :", j.timestamp);
  console.log("caption   :", (j.caption ?? "").split("\n")[0]);
}
