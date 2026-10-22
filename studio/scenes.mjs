/**
 * The scene library. Each scene type is designed and tested once, here; Alice
 * only chooses which ones to use, in what order, and fills in the words.
 *
 * A scene returns { html, steps, hide }:
 *   html   its layers (photo, graphics, caption)
 *   steps  declarative animation: {t, sel, from?, to, dur, ease, cue?}
 *          A step that makes a sound carries the cue itself, so the sound and
 *          the motion are one object and cannot drift apart.
 *   hide   elements that enter later (hidden until their step)
 *
 * Product screens are in English, as the product ships; captions, chips and
 * paper documents are in the reel's language. Every number on screen comes
 * from the reel's ledger (numbers.mjs) through a {token}.
 */
import { ico, P, frontDesk, guestRow, reportsHub, reportRow } from "./lib/ui.mjs";
import { fill, assertNoDigits, hash } from "./numbers.mjs";

export const ROLE = { place: "hook", "problem-doc": "problem", "folio-fix": "solution", "ui-screen": "solution", payoff: "payoff" };
export const WEIGHT = { hook: 1, problem: 1, solution: 1.4, payoff: 0.8 };

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/** Caption: one line, words marked bad/good by the brief. */
function caption(id, line, { bad = [], good = [] } = {}) {
  assertNoDigits(line, `${id} line`);
  const words = line.trim().split(/\s+/);
  const bare = (w) => w.replace(/[?.,!:;]/g, "").toLowerCase();
  for (const w of [...bad, ...good]) if (!words.some((x) => bare(x) === w.toLowerCase())) throw new Error(`${id}: marked word "${w}" is not in the line`);
  const size = line.length <= 36 ? 80 : line.length <= 52 ? 70 : 60;
  const cls = (w) => (bad.some((b) => b.toLowerCase() === bare(w)) ? "bad" : good.some((g) => g.toLowerCase() === bare(w)) ? "good" : "");
  return `<div class="cap" id="${id}-cap" style="font-size:${size}px">${words
    .map((w) => `<span class="w"><span class="wi ${cls(w)}">${esc(w)}</span></span>`)
    .join(" ")}</div>`;
}

/** Words arrive like a camera settling: travel decays word by word, blur resolves. */
const words = (id, t) => ({ t, kind: "words", sel: `#${id}-cap` });
const drift = (id, t, dur) => ({ t, sel: `#${id}-cap`, from: { y: 0 }, to: { y: -14 }, dur, ease: "none" });
const push = (id, t, dur, amount = 1.1) => ({ t, sel: `cam:${id}`, from: { push: 1 }, to: { push: amount }, dur, ease: "sine.inOut" });
const chipIn = (sel, t, cue, i) => ({ t, sel, from: { opacity: 0, x: -80 }, to: { opacity: 1, x: 0 }, dur: 0.5, ease: "power3.out", cue, cueOpts: { i } });
const popIn = (sel, t, cue) => ({ t, sel, from: { opacity: 0, scale: 0.7, y: 24 }, to: { opacity: 1, scale: 1, y: 0 }, dur: 0.5, ease: "back.out(2)", cue });

function chips(id, list = [], top = 1470) {
  return list
    .map((c, i) => {
      assertNoDigits(c, `${id} chip`);
      return `<div class="chip soft" id="${id}-chip${i}" style="left:80px;top:${top + i * 100}px">${ico("check", { size: 26, stroke: 2.6 })}${esc(c)}</div>`;
    })
    .join("");
}

const shell = (id, s, { fg = "", grade = "" } = {}) => `
<div class="scene" id="${id}">
  <div class="cam" id="${id}-cam">${s.image ? `<img class="photo" src="${s.image}" style="top:${s.focus ?? 0}px">` : ""}</div>
  <div class="grade ${grade}"></div>
  <div class="fg" id="${id}-fg">${fg}</div>
  ${caption(id, s.line, s)}
</div>`;

export const SCENES = {
  /** Hook: the place and the moment. A photo, a place tag, the question. */
  place(id, s, { t0, dur }) {
    const tag = s.tag ? `<div class="place" id="${id}-tag"><i></i>${esc(s.tag)}</div>` : "";
    if (s.tag) assertNoDigits(s.tag, `${id} tag`);
    return {
      html: shell(id, s, { fg: tag }),
      hide: s.tag ? [`#${id}-tag`] : [],
      steps: [
        push(id, t0, dur + 0.6, 1.12),
        words(id, t0 + 0.2),
        drift(id, t0 + 0.6, dur - 0.4),
        ...(s.tag ? [chipIn(`#${id}-tag`, t0 + 1.5, "pop", 1)] : []),
      ],
    };
  },

  /**
   * Problem: a paper document on the desk, the wrong figure struck through, a
   * stamp. The document is the analogue world: its labels are in the reel's
   * language; its figures are ledger tokens.
   */
  "problem-doc"(id, s, { t0, dur, T, seed }) {
    const d = s.doc;
    if (!d?.rows?.length) throw new Error(`${id}: problem-doc needs doc.rows`);
    const wrong = d.wrongRow ?? d.rows.length - 1;
    for (const [label] of d.rows) assertNoDigits(label, `${id} doc label`);
    for (const [, value] of d.rows) assertNoDigits(value, `${id} doc value`);
    if (s.stamp) assertNoDigits(s.stamp, `${id} stamp`);
    const number = d.number ?? `A-${1000 + (hash(seed + id) % 9000)}`;
    const rows = d.rows
      .map(([label, value], i) =>
        i === wrong
          ? `<div class="pline big"><span>${esc(label)}</span><span class="rate">${esc(fill(value, T))}<svg class="pen" viewBox="0 0 160 40" preserveAspectRatio="none"><path id="${id}-strike" d="M2 24 C 50 16, 110 26, 158 14"/></svg></span></div>`
          : `<div class="pline"><span>${esc(label)}</span><span>${esc(fill(value, T))}</span></div>`,
      )
      .join("");
    const paper = `<div class="paper" id="${id}-doc">
      <div class="phead"><span>${esc(d.title ?? "")}</span><span>№ ${esc(number)}</span></div>${rows}
      ${s.stamp ? `<div class="stamp" id="${id}-stamp">${esc(s.stamp)}</div>` : ""}</div>`;
    const strikeAt = t0 + Math.max(1.6, dur * 0.35);
    const stampAt = t0 + Math.max(2.6, dur * 0.56);
    return {
      html: shell(id, s, { fg: paper }),
      hide: [`#${id}-doc`, ...(s.stamp ? [`#${id}-stamp`] : [])],
      shows: [number],
      steps: [
        push(id, t0 - 0.2, dur + 0.4, 1.1),
        words(id, t0 + 0.2),
        { t: t0 + 0.8, sel: `#${id}-doc`, from: { opacity: 0, x: 520, rotation: 14, filter: "blur(12px)" }, to: { opacity: 1, x: 0, rotation: -4, filter: "blur(0px)" }, dur: 0.75, ease: "power4.out", cue: "card" },
        { t: t0 + 1.55, sel: `#${id}-doc`, to: { rotation: -2, y: -10 }, dur: dur - 1.8, ease: "sine.inOut" },
        { t: strikeAt, sel: `draw:#${id}-strike`, dur: 0.35, ease: "power1.inOut", cue: "strike" },
        ...(s.stamp
          ? [
              { t: stampAt - 0.17, sel: `#${id}-stamp`, from: { opacity: 0, scale: 2.4 }, to: { opacity: 0.95, scale: 1 }, dur: 0.17, ease: "power4.in" },
              { t: stampAt, sel: `cam:${id}`, from: { shake: 0 }, to: { shake: 1 }, dur: 0.04, ease: "none", cue: "stamp" },
              { t: stampAt + 0.04, sel: `cam:${id}`, to: { shake: 0 }, dur: 0.45, ease: "power2.out" },
            ]
          : []),
      ],
    };
  },

  /**
   * Solution: the Operra folio corrects the figure. Every value is computed
   * and the arithmetic is on screen: nights × rate = total.
   */
  "folio-fix"(id, s, { t0, dur, T }) {
    const flip = (k, a, b) => `<span class="flip" id="${id}-${k}"><span class="fa">${esc(a)}</span><span class="fb">${esc(b)}</span></span>`;
    const card = `<div class="tilt"><div class="fcard" id="${id}-fol">
      <div class="fhead">FOLIO · ROOM ${esc(T["{room}"])}</div>
      <div class="bline"><span>Room rate / night</span><span class="bval">${esc(T["{rightRate}"])}</span></div>
      <div class="bline neg"><span>Charged / night</span>${flip("rate", T["{wrongRate}"], T["{rightRate}"])}</div>
      <div class="btot"><span>Due<span class="sum">${flip("sum", T["{wrongSum}"], T["{rightSum}"])}</span></span>${flip("tot", T["{wrongTotal}"], T["{rightTotal}"])}</div>
    </div>
    <div class="chip ok" id="${id}-ok">${ico("check", { size: 30, stroke: 2.6 })}${esc(s.okChip ?? "Correct rate applied")}</div></div>
    ${chips(id, s.chips)}`;
    const f = (k, at, cue) => [
      { t: at, sel: `#${id}-${k} .fa`, to: { yPercent: -110 }, dur: 0.32, ease: "power2.inOut", cue },
      { t: at, sel: `#${id}-${k} .fb`, from: { yPercent: 110 }, to: { yPercent: 0 }, dur: 0.32, ease: "power2.inOut" },
    ];
    return {
      html: shell(id, s, { fg: card, grade: "ops" }),
      hide: [`#${id}-fol`, `#${id}-ok`, ...(s.chips ?? []).map((_, i) => `#${id}-chip${i}`)],
      init: [`#${id}-rate .fb`, `#${id}-sum .fb`, `#${id}-tot .fb`],
      steps: [
        push(id, t0 - 0.15, dur + 0.3, 1.08),
        words(id, t0 + 0.2),
        { t: t0 + 0.45, sel: `#${id}-fol`, from: { opacity: 0, rotationX: 38, y: 180, filter: "blur(10px)" }, to: { opacity: 1, rotationX: 0, y: 0, filter: "blur(0px)" }, dur: 0.9, ease: "power3.out", cue: "card" },
        ...f("rate", t0 + dur * 0.22, "flip"),
        ...f("sum", t0 + dur * 0.27, null),
        ...f("tot", t0 + dur * 0.27, "flip"),
        popIn(`#${id}-ok`, t0 + dur * 0.34, "match"),
        ...(s.chips ?? []).map((_, i) => chipIn(`#${id}-chip${i}`, t0 + dur * (0.45 + i * 0.13), "pop", i + 2)),
        { t: t0 + 1.4, sel: `#${id}-fol`, to: { y: -12 }, dur: dur - 1.6, ease: "sine.inOut" },
      ],
    };
  },

  /** Solution: a live Operra screen (front desk or reports) tilting up out of depth. */
  "ui-screen"(id, s, { t0, dur, seed }) {
    const screen = s.screen ?? "frontdesk";
    let el, rowsSel, shows = [];
    if (screen === "reports") {
      el = reportsHub(`${id}-scr`, [
        reportRow(`${id}-r0`, ico("trending-up", { size: 24 }), "Revenue", "Today, by outlet"),
        reportRow(`${id}-r1`, ico("bed-double", { size: 24 }), "Occupancy", "Rooms, live"),
        reportRow(`${id}-r2`, ico("receipt", { size: 24 }), "Folio audit", "Every change, logged"),
        reportRow(`${id}-r3`, ico("users", { size: 24 }), "Guests", "Arrivals and departures"),
      ].join(""), { extra: "position:relative" });
      rowsSel = [0, 1, 2, 3].map((i) => `#${id}-r${i}`);
    } else {
      // Occupancy, free rooms and arrivals are computed from one room count, so they agree.
      const r = hash(seed + id);
      const rooms = [14, 16, 18, 20, 24][r % 5];
      const occupied = Math.round(rooms * (0.62 + ((r >>> 4) % 25) / 100));
      const names = [["A", "Amina K."], ["J", "Joseph M."], ["N", "Neema S."], ["D", "David O."], ["R", "Rehema J."], ["P", "Peter L."]];
      const start = (r >>> 8) % 3;
      const list = names.slice(start, start + 3);
      el = frontDesk(`${id}-scr`, {
        compact: true,
        occupancy: `${Math.round((occupied / rooms) * 100)}%`,
        available: String(rooms - occupied),
        checkins: String(list.length),
        rows: list.map(([i, n], k) => guestRow(`${id}-g${k}`, i, n, String(101 + k * 3 + ((r >>> (k * 5 + 3)) % 3)))).join(""),
      });
      rowsSel = list.map((_, k) => `#${id}-g${k}`);
      shows = [`${Math.round((occupied / rooms) * 100)}%`, String(rooms - occupied), String(list.length), ...list.map((_, k) => `Room ${101 + k * 3 + ((r >>> (k * 5 + 3)) % 3)}`)];
    }
    const html = `<div class="tilt scr-${screen}"><div class="scrwrap" id="${id}-wrap">${el}</div></div>${chips(id, s.chips)}`;
    return {
      html: shell(id, s, { fg: html, grade: "ops" }),
      shows,
      hide: [`#${id}-wrap`, ...rowsSel, ...(s.chips ?? []).map((_, i) => `#${id}-chip${i}`)],
      steps: [
        push(id, t0 - 0.15, dur + 0.3, 1.08),
        words(id, t0 + 0.2),
        { t: t0 + 0.45, sel: `#${id}-wrap`, from: { opacity: 0, rotationX: 34, y: 200, filter: "blur(10px)" }, to: { opacity: 1, rotationX: 0, y: 0, filter: "blur(0px)" }, dur: 0.9, ease: "power3.out", cue: "card" },
        ...rowsSel.map((sel, i) => ({ t: t0 + 1.2 + i * 0.16, sel, from: { opacity: 0, x: 40 }, to: { opacity: 1, x: 0 }, dur: 0.45, ease: "power3.out" })),
        ...(s.chips ?? []).map((_, i) => chipIn(`#${id}-chip${i}`, t0 + dur * (0.42 + i * 0.14), "pop", i + 2)),
        { t: t0 + 1.4, sel: `#${id}-wrap`, to: { y: -12 }, dur: dur - 1.6, ease: "sine.inOut" },
      ],
    };
  },

  /** Payoff: the good outcome in its place, one success chip. */
  payoff(id, s, { t0, dur, T }) {
    if (s.chip) assertNoDigits(s.chip, `${id} chip`);
    const chip = s.chip ? `<div class="chip ok" id="${id}-ok" style="left:80px;top:1086px">${ico("check", { size: 30, stroke: 2.6 })}${esc(fill(s.chip, T))}</div>` : "";
    return {
      html: shell(id, s, { fg: chip }),
      hide: s.chip ? [`#${id}-ok`] : [],
      steps: [push(id, t0, dur + 1, 1.1), words(id, t0 + 0.2), ...(s.chip ? [popIn(`#${id}-ok`, t0 + Math.min(1.3, dur * 0.4), "match")] : [])],
    };
  },
};

// ── transitions: outgoing accelerates out (.in), incoming decelerates in (.out),
// overlapping so the cut lands at peak speed. Each carries the whoosh.
export const TRANSITIONS = {
  zoom: (a, b, T) => [
    { t: T - 0.5, sel: `#${a}`, to: { scale: 1.32, filter: "blur(16px) brightness(1)" }, dur: 0.5, ease: "power2.in" },
    { t: T - 0.08, sel: `#${a}`, to: { opacity: 0 }, dur: 0.16, ease: "none" },
    { t: T - 0.08, sel: `#${b}`, from: { opacity: 0, scale: 1.22, filter: "blur(16px) brightness(1)" }, to: { opacity: 1, scale: 1, filter: "blur(0px) brightness(1)" }, dur: 0.7, ease: "power2.out", cue: "whoosh", cueAt: T },
  ],
  push: (a, b, T) => [
    { t: T - 0.5, sel: `#${a}`, to: { y: -560, filter: "blur(14px) brightness(1)" }, dur: 0.5, ease: "power3.in" },
    { t: T - 0.08, sel: `#${a}`, to: { opacity: 0 }, dur: 0.16, ease: "none" },
    { t: T - 0.08, sel: `#${b}`, from: { opacity: 0, y: 640, filter: "blur(14px) brightness(1)" }, to: { opacity: 1, y: 0, filter: "blur(0px) brightness(1)" }, dur: 0.7, ease: "power3.out", cue: "whoosh", cueAt: T },
  ],
  whip: (a, b, T) => [
    { t: T - 0.42, sel: `#${a}`, to: { x: -700, skewX: -6, filter: "blur(18px) brightness(1)" }, dur: 0.42, ease: "power3.in" },
    { t: T - 0.06, sel: `#${a}`, to: { opacity: 0 }, dur: 0.12, ease: "none" },
    { t: T - 0.06, sel: `#${b}`, from: { opacity: 0, x: 760, skewX: 6, filter: "blur(18px) brightness(1)" }, to: { opacity: 1, x: 0, skewX: 0, filter: "blur(0px) brightness(1)" }, dur: 0.62, ease: "power3.out", cue: "whoosh", cueAt: T },
  ],
  leak: (a, b, T) => [
    { t: T - 0.35, sel: "#leak-warm", from: { opacity: 0 }, to: { opacity: 0.38 }, dur: 0.35, ease: "power1.in" },
    { t: T - 0.4, sel: "#leak-1", from: { opacity: 0, x: 0 }, to: { opacity: 0.9, x: 420 }, dur: 0.7, ease: "sine.inOut" },
    { t: T - 0.35, sel: "#leak-2", from: { opacity: 0, x: 0 }, to: { opacity: 0.7, x: 360 }, dur: 0.8, ease: "sine.inOut" },
    { t: T - 0.35, sel: `#${a}`, to: { filter: "blur(0px) brightness(1.6)", scale: 1.05 }, dur: 0.35, ease: "power2.in" },
    { t: T - 0.1, sel: `#${a}`, to: { opacity: 0 }, dur: 0.3, ease: "none" },
    { t: T - 0.1, sel: `#${b}`, from: { opacity: 0 }, to: { opacity: 1 }, dur: 0.3, ease: "none", cue: "whoosh", cueAt: T },
    { t: T - 0.1, sel: `#${b}`, from: { filter: "blur(0px) brightness(1.6)", scale: 1.06 }, to: { filter: "blur(0px) brightness(1)", scale: 1 }, dur: 0.8, ease: "power2.out" },
    { t: T + 0.05, sel: "#leak-warm", to: { opacity: 0 }, dur: 0.6, ease: "power2.out" },
    { t: T + 0.1, sel: "#leak-1", to: { opacity: 0, x: 760 }, dur: 0.6, ease: "power1.out" },
    { t: T + 0.1, sel: "#leak-2", to: { opacity: 0, x: 620 }, dur: 0.7, ease: "power1.out" },
  ],
};

/** Which transition joins two roles. Related beats keep one primary; the turns get their own. */
export function transitionFor(fromRole, toRole, i) {
  if (toRole === "payoff") return "leak";
  if (fromRole === "problem" && toRole === "solution") return "push";
  if (fromRole === "solution" && toRole === "solution") return "whip";
  return i % 2 ? "whip" : "zoom";
}
