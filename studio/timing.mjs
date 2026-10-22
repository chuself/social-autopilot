/**
 * Where the scenes change: in the voiceover's own pauses.
 *
 * Alice's voice is generated and never edited, so the picture follows the
 * voice, not the other way round. ffmpeg's silencedetect finds the breaths;
 * each cut goes in the breath nearest its share of the running time, so no
 * scene changes mid-word and none is starved.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

/** [{start, end, mid}] for every pause of at least `minGap` seconds, plus the voice length. */
export async function pauses(voiceFile, { noise = -35, minGap = 0.22 } = {}) {
  const { stderr } = await run("ffmpeg", ["-hide_banner", "-i", voiceFile, "-af", `silencedetect=noise=${noise}dB:d=${minGap}`, "-f", "null", "-"], { maxBuffer: 1 << 24 });
  const dur = Number(/Duration: (\d+):(\d+):([\d.]+)/.exec(stderr)?.slice(1).reduce((a, x, i) => a + Number(x) * [3600, 60, 1][i], 0));
  const out = [];
  let open = null;
  for (const line of stderr.split(/\r?\n/)) {
    const s = /silence_start: ([\d.]+)/.exec(line);
    const e = /silence_end: ([\d.]+)/.exec(line);
    if (s) open = Number(s[1]);
    if (e && open !== null) {
      out.push({ start: open, end: Number(e[1]), mid: (open + Number(e[1])) / 2 });
      open = null;
    }
  }
  // Speech runs from the end of the leading silence to the start of the trailing one.
  const speechStart = out[0]?.start <= 0.05 ? out[0].end : 0;
  const tail = out.at(-1) && out.at(-1).end >= dur - 0.05 ? out.at(-1).start : dur;
  const inner = out.filter((p) => p.start > speechStart + 0.1 && p.end < tail - 0.1);
  return { duration: dur, speechStart, speechEnd: tail ?? dur, pauses: inner };
}

/**
 * Cut times for `n` scenes over the spoken part.
 * @param weights relative length wanted for each scene (default equal)
 * @returns {number[]} n-1 cut times, each in a real pause where one exists
 */
export function planCuts(voice, n, weights = null, minScene = 2.8) {
  const w = weights ?? Array(n).fill(1);
  const total = w.reduce((a, b) => a + b, 0);
  const span = voice.speechEnd - voice.speechStart;
  const cuts = [];
  let acc = 0;
  let prev = 0;
  for (let i = 0; i < n - 1; i++) {
    acc += w[i];
    const target = voice.speechStart + (span * acc) / total;
    // The breath nearest the target, as long as it leaves both sides long enough.
    const options = voice.pauses
      .filter((p) => p.mid - prev >= minScene && p.mid <= voice.speechEnd - minScene * (n - 1 - i))
      .sort((a, b) => Math.abs(a.mid - target) - Math.abs(b.mid - target));
    const chosen = options[0] && Math.abs(options[0].mid - target) < span / n ? options[0].mid : Math.max(target, prev + minScene);
    cuts.push(+chosen.toFixed(3));
    prev = chosen;
  }
  return cuts;
}
