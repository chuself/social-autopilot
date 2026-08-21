const url = "https://www.tiktok.com/@operra.tech";
const r = await fetch(url, {
  headers: {
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36",
    "accept-language": "en-US,en;q=0.9",
  },
  signal: AbortSignal.timeout(30000),
});
const html = await r.text();
console.log("status", r.status, "bytes", html.length);
const videoCount = /"videoCount":(\d+)/.exec(html)?.[1];
const followers = /"followerCount":(\d+)/.exec(html)?.[1];
console.log("videoCount:", videoCount ?? "(not found)");
console.log("followerCount:", followers ?? "(not found)");
for (const kw of ["check-in", "check in", "East African", "Operra", "hoteli"]) {
  if (html.includes(kw)) console.log(`  found in page: "${kw}"`);
}
const ids = [...html.matchAll(/"video":\{"id":"(\d+)"/g)].map(m => m[1]).slice(0, 3);
if (ids.length) console.log("video ids:", ids.join(", "));
