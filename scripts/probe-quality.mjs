import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile } from "node:fs/promises";
const run = promisify(execFile);
const prompt = encodeURIComponent(
  "overhead flat-lay of hotel room keys, a folded guest register and a cup of chai on dark wood, even soft daylight, no text, no people, no logos"
);
for (const model of ["flux", "sana"]) {
  const url = `https://image.pollinations.ai/prompt/${prompt}?width=1080&height=1350&nologo=true&model=${model}&seed=42`;
  const t0 = Date.now();
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(120000) });
    const buf = Buffer.from(await r.arrayBuffer());
    const f = `D:/tmp-render/model-${model}.png`;
    await writeFile(f, buf);
    const { stdout } = await run("ffprobe", ["-v","error","-select_streams","v","-show_entries","stream=width,height","-of","csv=p=0", f]);
    console.log(`${model.padEnd(6)} ${stdout.trim().padEnd(12)} ${(buf.length/1024).toFixed(0)} KB   ${((Date.now()-t0)/1000).toFixed(1)}s`);
  } catch (e) { console.log(`${model.padEnd(6)} FAILED ${e.message.slice(0,50)}`); }
}
