/**
 * Motion styles for reels.
 *
 * Every reel used the same choreography: beats rise 26px and fade, the
 * background drifts up-left, a bar wipes across the top. Correct, and identical
 * every single time — a feed of them reads as one long advert.
 *
 * These are twelve HAND-PICKED combinations rather than random parameters.
 * Random soup produces incoherent motion; a named style is a set of choices
 * that agree with each other.
 *
 * DETERMINISM IS NON-NEGOTIABLE. The renderer screenshots setFrame(t) at each
 * timestamp and must produce the same frame on every run, so the style is
 * chosen from a hash of the post id — never Math.random() — and is recorded on
 * the post, exactly as the visual `look` already is. A reel re-rendered weeks
 * later must come out identical.
 */

/**
 * @typedef {object} ReelStyle
 * @property {string} name
 * @property {"up"|"down"|"left"|"right"|"scale"|"blur"} enter  how a beat arrives
 * @property {"fade"|"slide"|"shrink"} exit                     how it leaves
 * @property {"zoom-in"|"zoom-out"|"pan-left"|"pan-right"|"drift"|"still"} bg
 * @property {"left"|"center"} align
 * @property {"bar"|"dot"|"grow"|"none"} rule
 * @property {"top"|"bottom"|"none"} progress
 * @property {"rise"|"pop"|"slide"} cta
 * @property {number} pace   seconds a beat takes to arrive; small = snappy
 */

/** @type {ReelStyle[]} */
export const REEL_STYLES = [
  // The original. Kept first and unchanged so the familiar look survives.
  { name: "steady",    enter: "up",    exit: "fade",   bg: "drift",     align: "left",   rule: "bar",  progress: "top",    cta: "rise",  pace: 0.40 },
  { name: "snap",      enter: "up",    exit: "slide",  bg: "zoom-in",   align: "left",   rule: "grow", progress: "top",    cta: "pop",   pace: 0.22 },
  { name: "settle",    enter: "down",  exit: "fade",   bg: "zoom-out",  align: "left",   rule: "bar",  progress: "none",   cta: "rise",  pace: 0.50 },
  { name: "sweep",     enter: "left",  exit: "slide",  bg: "pan-right", align: "left",   rule: "grow", progress: "bottom", cta: "slide", pace: 0.30 },
  { name: "counter",   enter: "right", exit: "slide",  bg: "pan-left",  align: "left",   rule: "dot",  progress: "bottom", cta: "slide", pace: 0.30 },
  { name: "bloom",     enter: "scale", exit: "shrink", bg: "zoom-in",   align: "center", rule: "dot",  progress: "none",   cta: "pop",   pace: 0.38 },
  { name: "focus",     enter: "blur",  exit: "fade",   bg: "still",     align: "center", rule: "none", progress: "none",   cta: "rise",  pace: 0.45 },
  { name: "headline",  enter: "up",    exit: "fade",   bg: "zoom-out",  align: "center", rule: "grow", progress: "top",    cta: "pop",   pace: 0.34 },
  { name: "ticker",    enter: "left",  exit: "fade",   bg: "drift",     align: "left",   rule: "bar",  progress: "bottom", cta: "slide", pace: 0.24 },
  { name: "poster",    enter: "scale", exit: "fade",   bg: "still",     align: "left",   rule: "bar",  progress: "none",   cta: "rise",  pace: 0.55 },
  { name: "drop",      enter: "down",  exit: "shrink", bg: "pan-right", align: "center", rule: "none", progress: "top",    cta: "pop",   pace: 0.28 },
  { name: "quiet",     enter: "blur",  exit: "fade",   bg: "zoom-in",   align: "left",   rule: "dot",  progress: "none",   cta: "rise",  pace: 0.60 },
];

/** Stable 32-bit hash. Same string in, same number out, on every machine. */
function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < String(s).length; i++) {
    h ^= String(s).charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Pick a style for a post.
 *
 * @param {string} seed   the post id — NOT the clock, NOT random
 * @param {string} [pin]  a style name recorded on the post; wins if it exists,
 *                        so a re-render reproduces the original exactly
 */
export function styleFor(seed, pin = null) {
  if (pin) {
    const found = REEL_STYLES.find((s) => s.name === pin);
    if (found) return found;
  }
  return REEL_STYLES[hash(seed) % REEL_STYLES.length];
}
