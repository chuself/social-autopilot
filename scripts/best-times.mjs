/**
 * Ask Metricool when this audience is actually active.
 *
 * Reports only — changing the routine is the owner's call, and a routine change
 * goes through the same confirmation path as any other.
 */
import { callTool } from "../src/publish/tiktok.js";
import { notify } from "../src/notify.js";
import { readConfig, describe } from "../src/config.js";

const blogId = String(process.env.METRICOOL_BLOG_ID);
const lines = ["📊 <b>Best times to post</b>", ""];

for (const network of (process.env.BEST_TIME_NETWORKS ?? "instagram,facebook,tiktok").split(",")) {
  try {
    const out = await callTool("getBestTimeToPostByNetwork", {
      blogId,
      provider: network.trim(),
      timezone: process.env.METRICOOL_TZ ?? "Africa/Nairobi",
      start: new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 19) + "+03:00",
      end: new Date().toISOString().slice(0, 19) + "+03:00",
    });
    const data = JSON.parse(out);
    // Shape varies; surface the strongest hours whatever it is called.
    const flat = Array.isArray(data) ? data : data.data ?? [];
    const best = flat
      .flatMap((d) => (Array.isArray(d?.values) ? d.values.map((v, h) => ({ h, v, day: d.day })) : []))
      .sort((a, b) => b.v - a.v)
      .slice(0, 4)
      .map((x) => `${String(x.h).padStart(2, "0")}:00`);
    lines.push(`<b>${network}</b>: ${best.length ? best.join(", ") : "not enough data yet"}`);
  } catch (err) {
    lines.push(`<b>${network}</b>: ${err.message.slice(0, 70)}`);
  }
}

const cfg = await readConfig();
lines.push("", `Currently posting at: ${describe(cfg.slots)}`);
lines.push("", "Tell me to change it and I will — nothing moves on its own.");

const text = lines.join("\n");
console.log(text.replace(/<[^>]+>/g, ""));
await notify(text);
