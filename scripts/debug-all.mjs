const t = process.env.FB_PAGE_ACCESS_TOKEN, V = "v21.0";
const { readFile } = await import("node:fs/promises");
const hist = JSON.parse(await readFile("state/history.json", "utf8"));
for (const h of hist) {
  const r = await fetch(`https://graph.facebook.com/${V}/${h.postId}/comments?fields=id,text,message&limit=5`,
    { headers: { authorization: `Bearer ${t}` } });
  const j = await r.json();
  const n = (j.data ?? []).length;
  if (j.error) console.log(`✗ ${h.platform.padEnd(9)} ${h.postId}  ${j.error.message.slice(0, 60)} (code ${j.error.code})`);
  else if (n) console.log(`● ${h.platform.padEnd(9)} ${h.postId}  ${n} comment(s): ${(j.data[0].message ?? j.data[0].text ?? "").slice(0,60)}`);
}
