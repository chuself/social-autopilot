/**
 * What does Metricool think happened? Runs in CI, where the decryption key lives.
 * Shows queued and recently published posts so a TikTok result can be confirmed
 * from the authoritative side rather than by scraping a bot-walled profile.
 */
import { callTool } from "../src/publish/tiktok.js";

const from = process.argv[2] ?? new Date(Date.now() - 24 * 3600_000).toISOString().replace(/\.\d{3}Z$/, "+03:00");
const to = process.argv[3] ?? new Date(Date.now() + 48 * 3600_000).toISOString().replace(/\.\d{3}Z$/, "+03:00");

const out = await callTool("getScheduledPosts", {
  brandId: String(process.env.METRICOOL_BLOG_ID),
  fromDate: from,
  toDate: to,
  timezone: process.env.METRICOOL_TZ ?? "Africa/Nairobi",
});

let list;
try {
  const j = JSON.parse(out);
  list = Array.isArray(j) ? j : (j.data ?? []);
} catch {
  console.log(out.slice(0, 600));
  process.exit(0);
}

console.log(`${list.length} post(s) known to Metricool`);
for (const p of list) {
  const nets = (p.providers ?? []).map((x) => x.network).join("+");
  const when = p.publicationDate?.dateTime ?? p.date ?? "?";
  const status = p.status ?? p.postStatus ?? p.state ?? "?";
  console.log(`  ${when}  ${nets.padEnd(10)}  status=${status}`);
  console.log(`     ${(p.text ?? "").slice(0, 70).replace(/\n/g, " ")}`);
  for (const k of ["publishedUrl", "url", "permalink", "postUrl"]) if (p[k]) console.log(`     ${k}: ${p[k]}`);
}
