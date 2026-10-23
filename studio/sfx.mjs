/**
 * Sound design for studio reels, synthesised here. No samples, no library, no
 * dependencies: a reel's sounds are as reproducible as its frames.
 *
 * A sound can only exist as the voice of something on screen. The page emits
 * its cues from the SAME code that animates the element (window.REEL_CUES), so
 * a stamp thud cannot play unless a stamp lands, and a success chime cannot
 * play over a problem. Each cue type is bound to one kind of visual event; the
 * table below is the whole vocabulary, and an unknown cue is an error rather
 * than a silent guess.
 *
 * The voiceover is never touched: these sit well underneath it and are added
 * to it, not mixed against it.
 */
import { writeFile } from "node:fs/promises";

const SR = 44100;

/** What each sound is FOR. Kept here so the mapping is reviewable in one place. */
export const VOCABULARY = {
  open:   "the first shot resolving out of blur at the very start",
  whoosh: "a transition carrying one scene into the next",
  draw:   "a line or stroke drawing on",
  node:   "a small point or marker arriving",
  card:   "a card or screen sliding into place",
  stamp:  "a REJECTED / problem stamp landing (problem scenes only)",
  strike: "a wrong figure being struck through (problem scenes only)",
  flip:   "a figure changing to its corrected value",
  match:  "a success chip appearing: matched, approved, paid (solution scenes only)",
  pop:    "a small chip or tag appearing",
  logo:   "the brand's own logo arriving on the end card",
  tap:    "the call-to-action button arriving",
  sketch: "ink lines drawing themselves on paper (the ink & wash style)",
  bloom:  "a watercolour veil spreading across a cut (the ink & wash style)",
  clink:  "two glasses visibly touching in a toast",
};

// ── primitives ────────────────────────────────────────────────────────────

function lcg(seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296) * 2 - 1;
}

/** RBJ biquad, coefficients recomputed per call so cutoff can sweep. */
function biquad(type, f, q = 0.707) {
  const w = (2 * Math.PI * Math.min(f, SR * 0.45)) / SR;
  const a = Math.sin(w) / (2 * q), c = Math.cos(w);
  let b0, b1, b2;
  if (type === "lp") [b0, b1, b2] = [(1 - c) / 2, 1 - c, (1 - c) / 2];
  else if (type === "hp") [b0, b1, b2] = [(1 + c) / 2, -(1 + c), (1 + c) / 2];
  else [b0, b1, b2] = [a, 0, -a]; // band-pass, 0 dB peak
  const a0 = 1 + a;
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: (-2 * c) / a0, a2: (1 - a) / a0 };
}

/** Filter a mono buffer; `freq` may be a number or a function of 0..1 progress. */
function filter(x, type, freq, q) {
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0, k;
  for (let i = 0; i < x.length; i++) {
    if (i % 32 === 0) k = biquad(type, typeof freq === "function" ? freq(i / x.length) : freq, q);
    const v = k.b0 * x[i] + k.b1 * x1 + k.b2 * x2 - k.a1 * y1 - k.a2 * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}

const secs = (s) => Math.max(1, Math.round(s * SR));

function noise(dur, seed) {
  const r = lcg(seed), x = new Float32Array(secs(dur));
  for (let i = 0; i < x.length; i++) x[i] = r();
  return x;
}

/** Exponential attack/decay envelope applied in place. */
function env(x, attack, decay, hold = 0) {
  const a = secs(attack), h = secs(hold);
  for (let i = 0; i < x.length; i++) {
    const g = i < a ? i / a : i < a + h ? 1 : Math.exp(-(i - a - h) / (decay * SR));
    x[i] *= g;
  }
  return x;
}

/** A sine with optional pitch glide (f0 -> f1) and harmonics. */
function tone(dur, f0, f1 = f0, harmonics = [1]) {
  const x = new Float32Array(secs(dur));
  let ph = 0;
  for (let i = 0; i < x.length; i++) {
    const f = f0 * Math.pow(f1 / f0, i / x.length);
    ph += (2 * Math.PI * f) / SR;
    let v = 0;
    harmonics.forEach((g, h) => (v += g * Math.sin(ph * (h + 1))));
    x[i] = v;
  }
  return x;
}

function sum(...parts) {
  const n = Math.max(...parts.map(([b, off = 0]) => b.length + secs(off)));
  const y = new Float32Array(n);
  for (const [b, off = 0, g = 1] of parts) for (let i = 0; i < b.length; i++) y[i + secs(off)] += b[i] * g;
  return y;
}

// ── the sounds ────────────────────────────────────────────────────────────
// Each returns { buf, lead, pan }: lead is how far BEFORE the cue it starts
// (a whoosh builds up to the cut; a thud starts on it).

const SOUNDS = {
  // A nib on paper: band-limited scratch whose pressure wanders, for as long as
  // the lines are drawing. Quiet: it is texture under the voice, not an event.
  sketch: (seed, o) => {
    const d = o.dur ?? 1.4;
    const n = filter(noise(d, seed), "bp", (p) => 1800 + 900 * Math.sin(p * 9), 1.2);
    const r = lcg(seed + 7);
    let pressure = 0.5;
    for (let i = 0; i < n.length; i++) {
      if (i % 400 === 0) pressure = 0.25 + 0.75 * Math.abs(r());
      n[i] *= pressure * Math.sin((Math.PI * i) / n.length) ** 0.6;
    }
    return { buf: n, lead: 0, gain: 0.09, pan: [-0.25, 0.25] };
  },
  // Two glasses touching: bright, inharmonic partials that ring briefly.
  clink: () => {
    const ring = (f, d) => env(tone(0.9, f, f * 0.998, [1, 0, 0.3]), 0.001, d);
    return { buf: sum([ring(2637, 0.22), 0, 0.7], [ring(3951, 0.15), 0.004, 0.5], [ring(5274, 0.09), 0.008, 0.25]), lead: 0, gain: 0.16, pan: [0.1] };
  },
  // Pigment blooming into wet paper: a soft low swell that peaks on the cut.
  bloom: (seed) => {
    const d = 1.1;
    const air = filter(noise(d, seed), "lp", (p) => 220 + 1400 * Math.sin(Math.PI * p), 0.7);
    for (let i = 0; i < air.length; i++) air[i] *= Math.sin((Math.PI * i) / air.length) ** 2;
    const body = env(tone(d, 70, 96, [1, 0.25]), 0.45, 0.3);
    return { buf: sum([air, 0, 0.9], [body, 0, 0.35]), lead: 0.5, gain: 0.42, pan: [-0.2, 0.2] };
  },
  open: (seed) => {
    const d = 1.8;
    const air = filter(noise(d, seed), "lp", (p) => 300 + 2600 * p, 0.7);
    env(air, 0.9, 0.35);
    const low = env(tone(d, 55, 82, [1, 0.3]), 0.8, 0.4);
    return { buf: sum([air, 0, 0.8], [low, 0, 0.5]), lead: 0, gain: 0.35, pan: [-0.2, 0.2] };
  },
  whoosh: (seed) => {
    const d = 0.95;
    const n = filter(noise(d, seed), "bp", (p) => 260 * Math.pow(16, p), 1.1);
    env(n, 0.62, 0.11);
    return { buf: n, lead: 0.62, gain: 0.55, pan: [-0.6, 0.6] };
  },
  draw: (seed, o) => {
    const d = o.dur ?? 1.2;
    const n = filter(noise(d, seed), "hp", 5200, 0.7);
    for (let i = 0; i < n.length; i++) n[i] *= Math.sin((Math.PI * i) / n.length) ** 2;
    return { buf: n, lead: 0, gain: 0.07, pan: [0.3, -0.3] };
  },
  node: (seed, o) => {
    const notes = [587.3, 740, 880, 1174.7]; // D5 F#5 A5 D6 — rising, one per node
    const f = notes[(o.i ?? 0) % notes.length];
    const t = env(tone(0.5, f, f, [1, 0.25, 0.08]), 0.003, 0.11);
    return { buf: t, lead: 0, gain: 0.16, pan: [[-0.5, 0.5, 0][(o.i ?? 0) % 3]] };
  },
  card: (seed) => {
    const n = filter(noise(0.42, seed), "lp", (p) => 1500 - 1100 * p, 0.8);
    env(n, 0.16, 0.09);
    return { buf: n, lead: 0.16, gain: 0.32, pan: [0.25] };
  },
  stamp: (seed) => {
    const body = env(tone(0.32, 92, 48, [1, 0.35]), 0.002, 0.07);
    const slap = env(filter(noise(0.12, seed), "lp", 900, 0.9), 0.001, 0.025);
    const click = env(filter(noise(0.02, seed + 1), "bp", 2400, 2), 0.0005, 0.004);
    return { buf: sum([body, 0, 0.9], [slap, 0, 0.8], [click, 0, 0.35]), lead: 0, gain: 0.6, pan: [0] };
  },
  strike: (seed) => {
    const d = 0.24, n = filter(noise(d, seed), "bp", (p) => 2600 + 1400 * p, 1.6);
    for (let i = 0; i < n.length; i++) n[i] *= 0.6 + 0.4 * Math.sin((2 * Math.PI * 38 * i) / SR); // the nib's chatter
    env(n, 0.02, 0.07, 0.1);
    return { buf: n, lead: 0, gain: 0.22, pan: [-0.3, 0.3] };
  },
  flip: (seed) => {
    const tick = () => env(filter(noise(0.03, seed), "bp", 3200, 3), 0.0005, 0.006);
    return { buf: sum([tick(), 0, 1], [tick(), 0.045, 0.7]), lead: 0, gain: 0.3, pan: [0.15] };
  },
  match: () => {
    const bell = (f) => env(tone(1.3, f, f, [1, 0, 0.18, 0, 0.06]), 0.004, 0.32);
    return { buf: sum([bell(1318.5), 0, 0.8], [bell(1661.2), 0.09, 0.7]), lead: 0, gain: 0.2, pan: [0.2] };
  },
  pop: (seed, o) => {
    const f = 760 + 140 * ((o.i ?? 0) % 4);
    return { buf: env(tone(0.09, f, f * 1.55), 0.002, 0.022), lead: 0, gain: 0.2, pan: [((o.i ?? 0) % 2 ? 0.3 : -0.3)] };
  },
  logo: (seed) => {
    const chord = [220, 277.2, 329.6, 440, 554.4].map((f, i) => [env(tone(2.6, f, f, [1, 0.2]), 0.5, 0.9, 0.3), i * 0.06, 0.2]);
    const air = filter(noise(2.0, seed), "hp", 6000, 0.7);
    for (let i = 0; i < air.length; i++) air[i] *= Math.sin((Math.PI * i) / air.length) ** 2;
    return { buf: sum(...chord, [air, 0.1, 0.05]), lead: 0.45, gain: 0.3, pan: [-0.2, 0.2] };
  },
  tap: (seed) => {
    const tock = env(tone(0.12, 420, 300), 0.001, 0.03);
    const tip = env(filter(noise(0.015, seed), "bp", 4000, 2), 0.0005, 0.003);
    return { buf: sum([tock, 0, 1], [tip, 0, 0.5]), lead: 0, gain: 0.3, pan: [0] };
  },
};

/** Light Schroeder room so the effects sit in one space instead of on top. */
function room(x, wet = 0.14) {
  const y = Float32Array.from(x);
  const combs = [1557, 1617, 1491, 1422].map((d) => ({ d, buf: new Float32Array(d), i: 0 }));
  const aps = [225, 556].map((d) => ({ d, buf: new Float32Array(d), i: 0 }));
  for (let n = 0; n < x.length; n++) {
    let s = 0;
    for (const c of combs) {
      const o = c.buf[c.i];
      c.buf[c.i] = x[n] + o * 0.78;
      c.i = (c.i + 1) % c.d;
      s += o;
    }
    s *= 0.25;
    for (const a of aps) {
      const o = a.buf[a.i];
      a.buf[a.i] = s + o * 0.5;
      a.i = (a.i + 1) % a.d;
      s = o - s * 0.5;
    }
    y[n] += s * wet;
  }
  return y;
}

/**
 * Render cues into a stereo 16-bit WAV.
 * @param {{t:number,type:string,dur?:number,i?:number}[]} cues
 */
export async function renderSfx(cues, duration, outFile) {
  const n = secs(duration);
  const L = new Float32Array(n), R = new Float32Array(n);
  cues.forEach((c, k) => {
    const make = SOUNDS[c.type];
    if (!make) throw new Error(`unknown sound cue "${c.type}" — add it to VOCABULARY first`);
    const { buf, lead, gain, pan } = make(1000 + k, c);
    const start = secs(Math.max(0, c.t - lead));
    for (let i = 0; i < buf.length && start + i < n; i++) {
      const p = pan.length === 1 ? pan[0] : pan[0] + (pan[1] - pan[0]) * (i / buf.length);
      const v = buf[i] * gain;
      L[start + i] += v * Math.cos(((p + 1) * Math.PI) / 4) * Math.SQRT2;
      R[start + i] += v * Math.sin(((p + 1) * Math.PI) / 4) * Math.SQRT2;
    }
  });
  const l = room(L), r = room(R);
  const data = Buffer.alloc(44 + n * 4);
  data.write("RIFF", 0); data.writeUInt32LE(36 + n * 4, 4); data.write("WAVEfmt ", 8);
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(2, 22);
  data.writeUInt32LE(SR, 24); data.writeUInt32LE(SR * 4, 28); data.writeUInt16LE(4, 32); data.writeUInt16LE(16, 34);
  data.write("data", 36); data.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    data.writeInt16LE(Math.round(Math.tanh(l[i]) * 32767), 44 + i * 4);
    data.writeInt16LE(Math.round(Math.tanh(r[i]) * 32767), 46 + i * 4);
  }
  await writeFile(outFile, data);
  return outFile;
}
