for (const u of ["https://operra.tech/privacy", "https://operra.tech/privacy-policy", "https://operra.tech"]) {
  try {
    const r = await fetch(u, { redirect: "follow", signal: AbortSignal.timeout(15000),
      headers: { "user-agent": "Mozilla/5.0" } });
    const html = await r.text();
    const title = (html.match(/<title>([^<]*)<\/title>/i) ?? [])[1] ?? "";
    const hasPrivacy = /privacy/i.test(html);
    console.log(`${r.status}  ${u}\n   title="${title.slice(0,60)}"  mentions-privacy=${hasPrivacy}`);
  } catch (e) { console.log(`ERR  ${u} — ${e.message.slice(0,50)}`); }
}
