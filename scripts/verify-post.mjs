const token = process.env.FB_PAGE_ACCESS_TOKEN;
const id = process.argv[2];
const res = await fetch(
  `https://graph.facebook.com/v21.0/${id}?fields=id,created_time,message,permalink_url,is_published,full_picture`,
  { headers: { authorization: `Bearer ${token}` } }
);
const j = await res.json();
if (j.error) console.log("ERROR:", j.error.message);
else {
  console.log("published :", j.is_published);
  console.log("created   :", j.created_time);
  console.log("permalink :", j.permalink_url);
  console.log("has image :", Boolean(j.full_picture));
  console.log("message   :", (j.message ?? "").split("\n")[0]);
}
