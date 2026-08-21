/** What a logged-out visitor actually gets. The API's own view is not proof. */
const urls = [
  "https://www.facebook.com/1049514968255534",
  "https://www.facebook.com/122140157103351110/posts/122140186197351110",
  "https://www.facebook.com/reel/2191800291379153/",
  "https://www.instagram.com/reel/DcR39Hrmccn/",
];
for (const u of urls) {
  try {
    const r = await fetch(u, {
      redirect: "follow",
      headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36" },
      signal: AbortSignal.timeout(25000),
    });
    const html = await r.text();
    const title = (html.match(/<title>([^<]*)<\/title>/i) ?? [])[1] ?? "";
    const login = /log in|Log In|login_form|checkpoint/i.test(html);
    const notFound = /isn't available|content isn't available|Page Not Found/i.test(html);
    console.log(`${r.status}  ${u}`);
    console.log(`   title="${title.slice(0, 70)}" loginwall=${login} notfound=${notFound}`);
  } catch (e) {
    console.log(`ERR  ${u} — ${e.message}`);
  }
}
