import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, rm } from "node:fs/promises";
const run = promisify(execFile);
const prompt = encodeURIComponent("dark hotel reception desk, moody light, no text, no people");

for (const [w, h, extra] of [
  [1080, 1350, ""],
  [1440, 1800, ""],
  [2048, 2560, ""],
  [1080, 1920, ""],
  [1080, 1350, "&enhance=true"],
]) {
  const url = `https://image.pollinations.ai/prompt/${prompt}?width=${w}&height=${h}&nologo=true&model=flux&seed=7${extra}`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(90000) });
    const buf = Buffer.from(await r.arrayBuffer());
    const f = `D:/tmp-render/size-${w}x${h}${extra ? "-e" : ""}.png`;
    await writeFile(f, buf);
    const { stdout } = await run("ffprobe", ["-v","error","-select_streams","v","-show_entries","stream=width,height","-of","csv=p=0", f]);
    console.log(`asked ${w}x${h}${extra}`.padEnd(30), "->", stdout.trim(), `(${(buf.length/1024).toFixed(0)} KB)`);
    await rm(f, { force: true });
  } catch (e) { console.log(`asked ${w}x${h}`.padEnd(30), "FAILED", e.message.slice(0,40)); }
}
