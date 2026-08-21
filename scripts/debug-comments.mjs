const t = process.env.FB_PAGE_ACCESS_TOKEN, V = "v21.0";
const { readFile } = await import("node:fs/promises");
const hist = JSON.parse(await readFile("state/history.json", "utf8"));
const fb = hist.filter((h) => h.platform === "facebook").slice(-3);
for (const h of fb) {
  const url = `https://graph.facebook.com/${V}/${h.postId}/comments?fields=id,message&limit=5`;
  const r = await fetch(url, { headers: { authorization: `Bearer ${t}` } });
  const j = await r.json();
  console.log(`${h.postId}`);
  console.log(`   ${r.status} ${j.error ? j.error.message : `ok (${(j.data ?? []).length} comments)`}`);
  if (j.error) console.log(`   code=${j.error.code} sub=${j.error.error_subcode ?? "-"} type=${j.error.type}`);
}
