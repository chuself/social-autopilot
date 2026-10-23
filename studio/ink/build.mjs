#!/usr/bin/env node
/**
 * PROTOTYPE v2 — the "ink & wash" reel style: Bonasera's line illustration and
 * watercolour, in Operra's palette, as a second look for the studio.
 *
 * Same story, voice and ledger as the approved Arusha reel (golden 01), so the
 * two styles can be judged side by side. The logo is the brand's own
 * light-ground file, never redrawn.
 *
 * v1 was rejected as "too still between the cuts": once a scene had drawn
 * itself it stopped. In v2 nothing is ever still:
 *  - every scene has three depth layers (bg / mid / fg) that move at different
 *    speeds under a slow camera, so the picture has parallax;
 *  - each scene has a cast that lives for its whole length (birds, falling
 *    petals, clouds, steam, a pen that travels to the strike, a floating
 *    phone, pulse rings, a sinking sun, flickering lanterns, fireflies, stars,
 *    a clink of glasses);
 *  - the ink "boils" like hand-drawn animation, the washes breathe, and the
 *    key word of each line gets an ink underline.
 * All of it is computed from the frame time in life(t), never from a clock, so
 * a render is deterministic.
 *
 *   node studio/ink/build.mjs   -> studio/ink/page.html
 */
import { writeFileSync } from "node:fs";
import { makeLedger, tokens } from "../numbers.mjs";

const W = 1080, H = 1920, DUR = 24;
const CUTS = [6.22, 11.35, 18.4]; // the voice's own pauses (golden 01)
const END = 21.44;
const L = makeLedger({}, "operra-2026-10-20-13-pain-point", "sw");
const T = tokens(L);

const INK = "#1E2350";
const INK_SOFT = "#5A5F86";
const RED = "#B8325A"; // problem marks: pen and stamp
const TEAL_INK = "#138476"; // teal dark enough to read on cream

function lcg(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}
const r = lcg(1023);

const blossoms = Array.from({ length: 26 }, () => {
  const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 150;
  const x = 255 + Math.cos(a) * d * 1.3, y = 590 + Math.sin(a) * d * 0.8;
  return `M${x.toFixed(0)} ${y.toFixed(0)} a${(7 + r() * 5).toFixed(1)} ${(5 + r() * 4).toFixed(1)} 0 1 0 ${(14 + r() * 8).toFixed(1)} 0`;
});
const balusters = (x0, x1, step, yTop, yBot, slope) =>
  Array.from({ length: Math.floor((x1 - x0) / step) + 1 }, (_, i) => {
    const x = x0 + i * step, dy = (x - x0) * slope;
    return `M${x} ${(yTop + dy).toFixed(0)} L${x} ${(yBot + dy).toFixed(0)}`;
  });
const thatch = Array.from({ length: 26 }, (_, i) => {
  const x = 572 + i * 20, y = 718 - (x - 560) * (80 / 520);
  return `M${x} ${y.toFixed(0)} l-8 24`;
}).join(" ");
const cloud = (x, y, s) =>
  `<path class="actor" id="ID" transform="translate(${x} ${y}) scale(${s})" d="M0 0 C20 -18 50 -18 62 -4 C76 -20 110 -16 116 2 C132 0 140 12 132 20 L0 20 C-12 14 -10 2 0 0" stroke-width="${(1.8 / s).toFixed(2)}"/>`;

// Each scene: lines per depth layer (drawn on in order bg -> mid -> fg),
// washes per layer [texture, x, y, w, h, opacity], and actors (extra SVG with
// ids that life(t) moves for the whole scene).
const SCENES = {
  sA: {
    pan: { x: -96, y: -26, s: 0.1 },
    bg: {
      lines: [
        { d: "M40 600 C190 520 290 440 370 360 C420 312 465 252 515 205 C535 188 558 184 578 198 C640 246 702 318 790 398 C880 478 965 528 1050 570", w: 3.4 },
        { d: "M515 205 C505 232 528 246 512 270 M556 190 C566 220 550 238 570 258 M600 222 C596 246 612 256 604 280", w: 1.8 },
        { d: "M0 690 C150 650 280 672 420 640 C560 610 700 650 840 625 C930 610 1010 630 1080 618", w: 1.8 },
      ],
      washes: [["wash-sky", -80, 90, 1240, 640, 0.8], ["wash-blue", 330, 220, 520, 500, 0.5]],
      actors:
        cloud(140, 170, 1).replace("ID", "sA-c0") + cloud(760, 120, 0.8).replace("ID", "sA-c1") +
        [0, 1, 2].map((i) => `<path class="actor" id="sA-b${i}" d="" stroke-width="1.8"/>`).join(""),
    },
    mid: {
      lines: [
        { d: "M0 770 C200 750 420 780 640 758 C800 744 960 762 1080 754", w: 1.6 },
        { d: "M230 1000 C238 905 222 830 250 770 C266 738 256 708 276 676", w: 3.6 },
        { d: "M250 770 C205 732 165 712 120 702 M262 728 C306 698 346 688 388 668 M272 696 C258 650 248 610 258 570 M256 650 C218 628 188 600 178 568 M268 660 C306 630 326 600 336 568", w: 2.4 },
        { d: blossoms.join(" "), w: 1.6 },
      ],
      washes: [["wash-teal", -120, 700, 820, 400, 0.55], ["wash-lilac", 70, 430, 380, 330, 0.8], ["wash-violet", 170, 500, 200, 190, 0.55]],
      actors: Array.from({ length: 14 }, (_, i) => `<ellipse class="petal" id="sA-p${i}" cx="0" cy="0" rx="6" ry="3.6"/>`).join(""),
    },
    fg: {
      lines: [
        { d: "M560 720 L1080 640 M560 744 L1080 664", w: 3 },
        { d: thatch, w: 1.2 },
        { d: "M610 740 L610 1000 M780 714 L780 1000 M950 688 L950 1000", w: 2.8 },
        { d: "M560 880 L1080 846 M560 916 L1080 882", w: 2.2 },
        { d: balusters(585, 1065, 40, 880, 916, -34 / 520).join(" "), w: 1.4 },
      ],
      washes: [],
      actors: "",
    },
  },
  sB: {
    pan: { x: 70, y: -30, s: 0.09 },
    bg: {
      lines: [
        { d: "M700 300 L840 300 L885 410 L655 410 Z", w: 2.8 },
        { d: "M735 410 Q770 444 805 410 M770 300 L800 250 L905 330 L905 840 M845 846 L965 846", w: 2.4 },
      ],
      washes: [["wash-lilac", 540, 240, 460, 440, 0.75]],
      actors: "",
    },
    mid: {
      lines: [
        { d: "M0 880 L1080 840", w: 3 },
        { d: "M0 932 C300 912 700 906 1080 882 M0 976 C300 962 640 952 1080 926", w: 1.4 },
        { d: "M120 560 L120 660 C120 692 220 692 220 660 L220 560 M120 560 C120 545 220 545 220 560 C220 575 120 575 120 560 M220 590 C256 590 256 642 220 642", w: 2.6 },
        { d: "M150 790 a45 32 0 1 0 90 0 a45 32 0 1 0 -90 0 M240 790 q22 -14 44 0 M284 790 a45 32 0 1 0 90 0 a45 32 0 1 0 -90 0 M150 788 L110 770 M374 788 L414 772", w: 2.2 },
      ],
      washes: [["wash-blue", 230, 280, 640, 640, 0.45], ["wash-teal", 70, 500, 220, 230, 0.6]],
      actors: `<path class="actor" id="sB-s0" d="" stroke-width="1.6"/><path class="actor" id="sB-s1" d="" stroke-width="1.6"/>`,
    },
    fg: {
      lines: [],
      washes: [],
      actors: `<g id="sB-pen"><path d="M820 760 L1000 690 L1008 702 L828 772 Z" stroke-width="2"/><path d="M820 760 L804 772 L828 772" stroke-width="2"/></g>`,
    },
  },
  sC: {
    pan: { x: -54, y: -40, s: 0.09 },
    bg: {
      lines: [],
      washes: [["wash-violet-b", 650, 10, 400, 400, 0.55], ["wash-blue", 30, 620, 380, 380, 0.5]],
      actors: "",
    },
    mid: {
      lines: [
        { d: "M330 70 h420 a46 46 0 0 1 46 46 v800 a46 46 0 0 1 -46 46 h-420 a46 46 0 0 1 -46 -46 v-800 a46 46 0 0 1 46 -46 Z", w: 3.2 },
        { d: "M500 102 L580 102 M312 140 L768 140 M312 880 L768 880", w: 1.6 },
      ],
      washes: [["wash-teal", 200, 110, 680, 800, 0.5]],
      actors: "",
    },
    fg: {
      lines: [],
      washes: [],
      actors:
        [[216, 250, 16], [876, 430, 16], [892, 760, 12], [180, 700, 10]]
          .map(([x, y, s], i) => `<path class="actor spark" id="sC-k${i}" d="M${x - s} ${y} L${x + s} ${y} M${x} ${y - s} L${x} ${y + s}" stroke-width="2"/>`)
          .join("") +
        `<circle class="ring" id="sC-ring0" cx="540" cy="660" r="40"/><circle class="ring" id="sC-ring1" cx="540" cy="660" r="40"/>`,
    },
  },
  sD: {
    pan: { x: 64, y: -30, s: 0.09 },
    bg: {
      lines: [
        { d: "M80 470 C220 400 320 340 420 270 C460 242 490 210 520 190 C540 178 560 180 576 194 C650 250 720 300 800 352 C890 410 970 440 1060 470", w: 3.2 },
        { d: "M520 190 C512 212 530 222 518 242 M560 186 C568 208 556 222 572 238", w: 1.6 },
        { d: "M0 560 C300 540 700 560 1080 545", w: 1.6 },
      ],
      washes: [["wash-dusk", -40, 30, 1160, 620, 0.8], ["wash-rose", 0, 400, 1080, 280, 0.6]],
      actors:
        `<g id="sD-sun"><path d="M846 250 m-46 0 a46 46 0 1 0 92 0 a46 46 0 1 0 -92 0" stroke-width="1.8"/></g>` +
        [[150, 110], [300, 70], [470, 120], [640, 60], [960, 150], [1010, 80]]
          .map(([x, y], i) => `<path class="actor spark star" id="sD-st${i}" d="M${x - 7} ${y} L${x + 7} ${y} M${x} ${y - 7} L${x} ${y + 7}" stroke-width="1.6"/>`)
          .join(""),
      sunWash: true,
    },
    mid: {
      lines: [
        { d: "M0 700 L1080 680 M0 742 L1080 722", w: 2.6 },
        { d: balusters(30, 1050, 60, 700, 742, -20 / 1080).join(" "), w: 1.4 },
      ],
      washes: [["wash-violet", 0, 640, 1080, 420, 0.4], ["wash-blue", 270, 640, 190, 180, 0.5], ["wash-teal", 590, 620, 190, 180, 0.5]],
      actors:
        `<g id="sD-fig0"><path d="M392 470 C392 522 452 522 452 470 Z M422 516 L422 584 M398 588 L446 588" stroke-width="2.4"/>` +
        `<path d="M330 660 a34 38 0 1 0 68 0 a34 38 0 1 0 -68 0 M300 790 C300 730 330 702 364 700 C398 702 428 730 428 790 M404 724 C420 680 424 630 422 590 M338 646 C352 630 380 628 394 646" stroke-width="2.6"/></g>` +
        `<g id="sD-fig1"><path d="M572 448 C572 500 632 500 632 448 Z M602 494 L602 562 M578 566 L626 566" stroke-width="2.4"/>` +
        `<path d="M650 640 a34 38 0 1 0 68 0 a34 38 0 1 0 -68 0 M620 772 C620 712 650 684 684 682 C718 684 748 712 748 772 M640 704 C624 660 604 610 602 570 M658 626 C672 610 700 608 714 626" stroke-width="2.6"/></g>` +
        `<path class="actor" id="sD-clk" d="M500 432 L516 414 M512 448 L536 442 M498 420 L504 398" stroke-width="2"/>`,
    },
    fg: {
      lines: [{ d: "M150 770 h60 v90 h-60 Z M160 770 C160 745 200 745 200 770 M870 760 h60 v90 h-60 Z M880 760 C880 735 920 735 920 760", w: 2.2 }],
      washes: [["wash-lilac", 120, 730, 140, 150, 0.7], ["wash-lilac", 840, 720, 140, 150, 0.7]],
      actors:
        `<path class="actor flame" id="sD-f0" d="M180 846 C170 826 176 806 180 792 C184 806 190 826 180 846 Z" stroke-width="1.6"/>` +
        `<path class="actor flame" id="sD-f1" d="M900 836 C890 816 896 796 900 782 C904 796 910 816 900 836 Z" stroke-width="1.6"/>` +
        Array.from({ length: 8 }, (_, i) => `<circle class="fly" id="sD-ff${i}" cx="0" cy="0" r="4"/>`).join(""),
    },
  },
};

const CAPS = {
  sA: { text: "Ankara inakataliwa tena msimu huu?", bad: ["inakataliwa"] },
  sB: { text: "Bei ya wakala imekosewa mapokezi?", bad: ["imekosewa"] },
  sC: { text: "Operra inadhibiti viwango na mapokezi.", good: ["inadhibiti"] },
  sD: { text: "Malipo ya msimu yanaingia bila usumbufu.", good: ["bila", "usumbufu"] },
};
const UL = `<span class="ul"><svg viewBox="0 0 100 12" preserveAspectRatio="none"><path d="M2 8 C 22 3, 48 11, 70 5 S 96 6, 98 6"/></svg></span>`;
const cap = (id, c) => {
  const words = c.text.split(" ");
  const cls = (w) => {
    const b = w.replace(/[?.,]/g, "");
    return c.bad?.includes(b) ? "bad" : c.good?.includes(b) ? "good" : "";
  };
  return `<div class="cap" id="${id}-cap" style="font-size:${c.text.length <= 36 ? 74 : 66}px">${words
    .map((w) => `<span class="w"><span class="wi ${cls(w)}">${w}${cls(w) ? UL : ""}</span></span>`)
    .join(" ")}</div>`;
};

const layer = (id, name, ly, extra = "") => {
  const washes = ly.washes
    .map(([n, x, y, w, h, o], i) => `<div class="wb" id="${id}-${name}-wb${i}" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px"><img class="wash" data-o="${o}" src="tex/${n}.webp"></div>`)
    .join("");
  const sunWash = ly.sunWash ? `<div class="wb" id="sD-sunwash" style="left:740px;top:150px;width:220px;height:220px"><img class="wash" data-o="0.8" src="tex/wash-magenta.webp"></div>` : "";
  const lines = ly.lines.map((l, i) => `<path class="ln" data-o="${name}" id="${id}-${name}-l${i}" d="${l.d}" stroke-width="${l.w}"/>`).join("");
  return `<div class="ly" id="${id}-${name}">${sunWash}${washes}<svg class="ink" viewBox="0 0 1080 1000">${lines}${ly.actors}</svg>${extra}</div>`;
};

const invoice = `<div class="invw" id="sB-invw"><div class="inv" id="sB-inv">
  <svg class="invb" viewBox="0 0 540 560" preserveAspectRatio="none"><path id="sB-invb" d="M8 10 L532 4 L536 552 L4 556 Z"/></svg>
  <div class="ihead"><span>ANKARA</span><span>№ A-4417</span></div>
  <div class="irow"><span>Chumba</span><span>${T["{room}"]}</span></div>
  <div class="irow"><span>Usiku</span><span>${T["{nights}"]}</span></div>
  <div class="irow big"><span>Bei ya chumba / usiku</span><span class="rate">${T["{wrongRate}"]}<svg class="pen" viewBox="0 0 160 40" preserveAspectRatio="none"><path id="sB-strike" d="M2 26 C 50 14, 112 28, 158 12"/></svg></span></div>
  <div class="irow"><span>Jumla</span><span>${T["{wrongTotal}"]}</span></div>
  <div class="stamp" id="sB-stamp">IMEKATALIWA</div>
</div></div>`;

const flip = (id, a, b) => `<span class="flip" id="${id}"><span class="fa">${a}</span><span class="fb">${b}</span></span>`;
const folio = `<div class="fol" id="sC-fol">
  <div class="fhead">FOLIO · ROOM ${T["{room}"]}</div>
  <div class="frow"><span>Room rate / night</span><span>${T["{rightRate}"]}</span></div>
  <div class="frow"><span>Charged / night</span>${flip("sC-f1", T["{wrongRate}"], T["{rightRate}"])}</div>
  <div class="frow tot"><span>Due<i>${flip("sC-f2", T["{wrongSum}"], T["{rightSum}"])}</i></span>${flip("sC-f3", T["{wrongTotal}"], T["{rightTotal}"])}</div>
  <svg class="tick" viewBox="0 0 120 120"><path id="sC-tick" d="M60 60 m-40 0 a40 40 0 1 0 80 0 a40 40 0 1 0 -80 0 M40 62 L55 77 L82 46"/></svg>
  <div class="ok" id="sC-ok">Correct rate applied</div>
</div>`;

const endPetals = Array.from({ length: 16 }, (_, i) => `<div class="epetal" id="e-p${i}"></div>`).join("");

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:Inter;font-weight:400;src:url(../../brands/operra/assets/fonts/inter-latin-400-normal.woff2)}
@font-face{font-family:Inter;font-weight:500;src:url(../../brands/operra/assets/fonts/inter-latin-500-normal.woff2)}
@font-face{font-family:Inter;font-weight:600;src:url(../../brands/operra/assets/fonts/inter-latin-600-normal.woff2)}
@font-face{font-family:Inter;font-weight:700;src:url(../../brands/operra/assets/fonts/inter-latin-700-normal.woff2)}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${W}px;height:${H}px;overflow:hidden;background:#F9F5EE;font-family:Inter,sans-serif;color:${INK}}
#paper{position:absolute;inset:0;width:${W}px;height:${H}px}
.scene{position:absolute;inset:0;opacity:0}
#sA{opacity:1}
.art{position:absolute;left:0;top:170px;width:1080px;height:1000px;transform-origin:540px 520px}
.ly{position:absolute;inset:0}
.wb{position:absolute}
.wash{position:absolute;inset:0;width:100%;height:100%;opacity:0;mix-blend-mode:multiply}
.ink{position:absolute;left:0;top:0;width:1080px;height:1000px;overflow:visible;filter:url(#boil)}
.ink path,.ink circle,.ink ellipse{fill:none;stroke:${INK};stroke-linecap:round;stroke-linejoin:round}
.ink .petal{fill:#B596F0;stroke:none;opacity:0}
.ink .ring{stroke:${TEAL_INK};stroke-width:2.4;opacity:0}
.ink .fly{fill:#F2CF7A;stroke:none;opacity:0}
.ink .flame{fill:rgba(242,190,110,.55)}
.ink .spark,.ink .actor,.ink g{transform-box:fill-box;transform-origin:center}
.ink .flame{transform-origin:center bottom}
.cap{position:absolute;left:80px;top:1215px;width:840px;font-weight:600;line-height:1.14;letter-spacing:-.02em;color:${INK}}
.w{display:inline-block;vertical-align:top}
.wi{display:inline-block;position:relative}
.wi.bad{color:${RED}}
.wi.good{color:${TEAL_INK}}
.ul{position:absolute;left:-2px;right:-2px;bottom:-6px;height:14px;clip-path:inset(0 100% 0 0)}
.ul svg{display:block;width:100%;height:100%;overflow:visible}
.ul path{fill:none;stroke:currentColor;stroke-width:4;stroke-linecap:round;vector-effect:non-scaling-stroke}
.rule{position:absolute;left:80px;top:1180px;width:120px;height:5px;border-radius:5px;background:linear-gradient(90deg,#B23BFF,#3E86FF,#36D2BA);transform-origin:0 50%}
#lock{position:absolute;left:80px;top:96px;height:44px}
.pill{position:absolute;right:80px;top:92px;font-size:23px;font-weight:600;letter-spacing:.12em;color:${INK};border:2px solid ${INK};border-radius:100px;padding:11px 24px}
.tag{position:absolute;left:80px;top:1120px;font-size:22px;font-weight:600;letter-spacing:.14em;color:${INK_SOFT}}
.invw{position:absolute;left:260px;top:260px;width:540px;height:560px;transform-origin:50% 60%}
.inv{position:absolute;inset:0;padding:40px 44px;transform:rotate(-3deg);font-size:27px;color:${INK}}
.invb{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.invb path{fill:rgba(255,253,248,.85);stroke:${INK};stroke-width:2.6;stroke-linejoin:round}
.ihead,.irow{position:relative;display:flex;justify-content:space-between;gap:12px}
.ihead{font-weight:700;letter-spacing:.14em;font-size:24px;border-bottom:2px solid ${INK};padding-bottom:12px;margin-bottom:12px}
.irow{padding:12px 0;border-bottom:1.5px dashed rgba(30,35,80,.35)}
.irow.big{font-weight:700;font-size:30px}
.rate{position:relative;white-space:nowrap}
.pen{position:absolute;left:-10px;top:0;width:calc(100% + 20px);height:100%;overflow:visible}
.pen path{fill:none;stroke:${RED};stroke-width:5;stroke-linecap:round}
.stamp{position:absolute;left:44px;bottom:28px;font-size:46px;font-weight:700;letter-spacing:.08em;color:${RED};border:5px double ${RED};border-radius:10px;padding:6px 16px;transform:rotate(-14deg);opacity:0;mix-blend-mode:multiply}
.fol{position:absolute;left:316px;top:180px;width:448px;color:${INK}}
.fhead{font-size:19px;font-weight:600;letter-spacing:.12em;color:${INK_SOFT};margin-bottom:20px}
.frow{display:flex;justify-content:space-between;align-items:flex-end;font-size:23px;padding:14px 0;border-bottom:1.5px solid rgba(30,35,80,.18)}
.frow.tot{font-size:27px;font-weight:700;border:0;padding-top:20px}
.frow.tot>span:first-child{display:flex;flex-direction:column}
.frow.tot i{font-style:normal;font-weight:500;font-size:18px;color:${INK_SOFT};margin-top:6px}
.flip{position:relative;display:inline-block;overflow:hidden;height:1.25em;min-width:7.4em;text-align:right;vertical-align:bottom}
.flip span{position:absolute;right:0;top:0;white-space:nowrap}
.frow.tot i .flip{text-align:left;min-width:8.6em}
.frow.tot i .flip span{left:0;right:auto}
#sC-f1 .fa{color:${RED}}
.flip .fb{color:${TEAL_INK}}
.tick{position:absolute;left:164px;top:420px;width:120px;height:120px;overflow:visible}
.tick path{fill:none;stroke:${TEAL_INK};stroke-width:5;stroke-linecap:round;stroke-linejoin:round}
.ok{position:absolute;left:0;top:560px;width:448px;text-align:center;font-size:24px;font-weight:600;color:${TEAL_INK}}
.chip{position:absolute;left:80px;top:1112px;font-size:26px;font-weight:600;color:${TEAL_INK};border:2px solid ${TEAL_INK};border-radius:100px;padding:12px 26px;opacity:0;background:rgba(249,245,238,.85)}
#veil{position:absolute;left:-160px;top:260px;width:1400px;height:1400px;opacity:0;transform-origin:700px 700px;mix-blend-mode:multiply}
#end{position:absolute;inset:0;opacity:0}
#endwash{position:absolute;left:190px;top:520px;width:700px;height:560px;opacity:.55;mix-blend-mode:multiply}
.epetal{position:absolute;left:0;top:0;width:20px;height:12px;border-radius:50%;background:#B596F0;opacity:.7}
#bigLogo{position:absolute;left:270px;top:740px;width:540px;opacity:0}
#cta{position:absolute;left:50%;top:1000px;font-size:38px;font-weight:600;color:#F9F5EE;background:${INK};border-radius:100px;padding:24px 54px;white-space:nowrap;opacity:0}
#site{position:absolute;top:1140px;width:100%;text-align:center;font-size:30px;color:${INK_SOFT};opacity:0}
#bar{position:absolute;left:0;bottom:0;height:7px;width:${W}px;background:linear-gradient(90deg,#E01FEE,#7B54FF,#1FA8F0);transform-origin:0 50%}
</style></head><body>
<svg width="0" height="0" style="position:absolute"><filter id="boil" x="-3%" y="-3%" width="106%" height="106%">
  <feTurbulence id="turb" type="fractalNoise" baseFrequency="0.024" numOctaves="2" seed="1"/>
  <feDisplacementMap in="SourceGraphic" scale="3.2" xChannelSelector="R" yChannelSelector="G"/></filter></svg>
<img id="paper" src="tex/paper.webp">
${Object.entries(SCENES)
  .map(
    ([id, s]) =>
      `<div class="scene" id="${id}"><div class="art" id="${id}-art">${layer(id, "bg", s.bg)}${layer(id, "mid", s.mid, id === "sB" ? invoice : id === "sC" ? folio : "")}${layer(id, "fg", s.fg)}</div>${cap(id, CAPS[id])}</div>`,
  )
  .join("\n")}
<div class="tag" id="tagA">ARUSHA · MSIMU WA SAFARI</div>
<div class="chip" id="chipC">Kiswahili na Kiingereza</div>
<div class="chip" id="chipD">Malipo yamepokelewa · ${T["{rightTotal}"]}</div>
<div class="rule" id="rule"></div>
<img id="veil" src="tex/veil.webp">
<div id="end"><img id="endwash" src="tex/wash-lilac.webp">${endPetals}<img id="bigLogo" src="../../brands/operra/assets/logo-light.png">
  <div id="cta">Ona inavyofanya kazi</div><div id="site">operra.tech</div></div>
<img id="lock" src="../../brands/operra/assets/logo-light.png"><div class="pill" id="eyebrow">UPANGAJI BEI</div>
<div id="bar"></div>
<script src="../assets/gsap.min.js"></script>
<script>
const CUTS=${JSON.stringify(CUTS)}, END=${END}, DUR=${DUR};
const PAN=${JSON.stringify(Object.fromEntries(Object.entries(SCENES).map(([k, s]) => [k, s.pan])))};
const WIN={sA:[0,CUTS[0]],sB:[CUTS[0],CUTS[1]],sC:[CUTS[1],CUTS[2]],sD:[CUTS[2],END]};
const WASH=.62; // watercolour sits under the ink: lighter than the line, never over it
const CUES=[];
const cue=(t,type,o={})=>{CUES.push({t:+t.toFixed(3),type,...o});return t;};
const tl=gsap.timeline({paused:true});
const $=(s)=>document.querySelector(s), $$=(s)=>document.querySelectorAll(s);
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const ease=(u)=>.5-.5*Math.cos(Math.PI*clamp(u));

// Ink draws itself on, layer by layer, back to front. The pen scratches as it draws.
function draw(id,t0,span){
  const paths=[...$$("#"+id+" .ln")];
  const step=span/paths.length;
  paths.forEach((p,i)=>{const L=Math.ceil(p.getTotalLength())+4;gsap.set(p,{strokeDasharray:L,strokeDashoffset:L});
    tl.to(p,{strokeDashoffset:0,duration:Math.max(.5,step*1.8),ease:"power1.inOut"},t0+i*step);});
  cue(t0,"sketch",{dur:span+.6});
}
function bloom(el,t,o){tl.fromTo(el,{opacity:0,scale:.8},{opacity:o*WASH,scale:1,duration:1.4,ease:"power2.out",immediateRender:false},t);}
function washes(id,t0,gap){[...$$("#"+id+" .wash")].forEach((w,i)=>bloom(w,t0+i*gap,+w.dataset.o));}
function words(id,t){
  const ws=[...$$("#"+id+"-cap .wi")];
  ws.forEach((w,i)=>tl.fromTo(w,{y:60-i*5,opacity:0,filter:"blur(8px)"},{y:0,opacity:1,filter:"blur(0px)",duration:.5,ease:"power3.out",immediateRender:false},t+i*.055));
  // the key word gets an ink underline once the line has landed
  $$("#"+id+"-cap .ul").forEach((u,k)=>tl.fromTo(u,{clipPath:"inset(0% 100% 0% 0%)"},{clipPath:"inset(0% 0% 0% 0%)",duration:.45,ease:"power2.inOut",immediateRender:false},t+ws.length*.055+.45+k*.2));
}
function veilCut(a,b,T){
  tl.fromTo("#veil",{opacity:0,scale:.12,rotation:-8},{opacity:.92,scale:1.6,rotation:0,duration:.5,ease:"power2.in",immediateRender:false},T-.5);
  tl.to("#veil",{scale:3.2,duration:.55,ease:"power2.out"},T);
  tl.set("#"+a,{opacity:0},T); if(b) tl.set("#"+b,{opacity:1},T);
  tl.to("#veil",{opacity:0,duration:.6,ease:"power1.out"},T+.08);
  cue(T,"bloom");
}
gsap.set(".wi",{opacity:0});
// Everything that makes an entrance starts hidden, or it shows before its cue.
gsap.set(["#sB-inv","#sC-fol .fhead","#sC-fol .frow","#sC-ok"],{opacity:0});

// A · Arusha
draw("sA",.15,2.4); washes("sA",.5,.3); words("sA",.6);
tl.fromTo("#lock",{opacity:0},{opacity:1,duration:.6,immediateRender:false},.3);
tl.fromTo("#eyebrow",{opacity:0,y:-10},{opacity:1,y:0,duration:.5,immediateRender:false},cue(.9,"pop",{i:0}));
tl.fromTo("#rule",{scaleX:0},{scaleX:1,duration:.7,ease:"power3.out",immediateRender:false},.5);
tl.fromTo("#tagA",{opacity:0,x:-30},{opacity:1,x:0,duration:.5,immediateRender:false},cue(2.0,"pop",{i:1}));
tl.to("#tagA",{opacity:0,duration:.3},CUTS[0]-.6);

// B · the mistake
const STRIKE=CUTS[0]+2.0, STAMP=CUTS[0]+2.95;
veilCut("sA","sB",CUTS[0]);
draw("sB",CUTS[0]+.15,1.4); washes("sB",CUTS[0]+.3,.35); words("sB",CUTS[0]+.25);
tl.fromTo("#sB-inv",{opacity:0,y:40,rotation:-8},{opacity:1,y:0,rotation:-3,duration:.7,ease:"power3.out",immediateRender:false},cue(CUTS[0]+.7,"card"));
{const p=$("#sB-invb"),L=Math.ceil(p.getTotalLength())+4;gsap.set(p,{strokeDasharray:L,strokeDashoffset:L});tl.to(p,{strokeDashoffset:0,duration:.9,ease:"power1.inOut"},CUTS[0]+.75);}
{const p=$("#sB-strike"),L=Math.ceil(p.getTotalLength())+4;gsap.set(p,{strokeDasharray:L,strokeDashoffset:L});tl.to(p,{strokeDashoffset:0,duration:.35,ease:"power1.inOut"},cue(STRIKE,"strike"));}
tl.fromTo("#sB-stamp",{opacity:0,scale:2.2},{opacity:.92,scale:1,duration:.17,ease:"power4.in",immediateRender:false},cue(STAMP,"stamp")-.17);
tl.fromTo("#sB-art",{x:0},{x:-7,duration:.05,yoyo:true,repeat:3,ease:"none",immediateRender:false},STAMP);

// C · Operra
const TICK=CUTS[1]+2.9;
veilCut("sB","sC",CUTS[1]);
draw("sC",CUTS[1]+.15,1.0); washes("sC",CUTS[1]+.25,.35); words("sC",CUTS[1]+.25);
tl.fromTo("#sC-fol .fhead, #sC-fol .frow",{opacity:0,y:16},{opacity:1,y:0,duration:.45,stagger:.15,ease:"power3.out",immediateRender:false},cue(CUTS[1]+.9,"card"));
gsap.set(["#sC-f1 .fb","#sC-f2 .fb","#sC-f3 .fb"],{yPercent:110});
for(const [id,t,c] of [["sC-f1",CUTS[1]+2.0,"flip"],["sC-f2",CUTS[1]+2.35,null],["sC-f3",CUTS[1]+2.35,"flip"]]){
  tl.to("#"+id+" .fa",{yPercent:-110,duration:.32,ease:"power2.inOut"},c?cue(t,c):t);
  tl.to("#"+id+" .fb",{yPercent:0,duration:.32,ease:"power2.inOut"},t);
}
{const p=$("#sC-tick"),L=Math.ceil(p.getTotalLength())+4;gsap.set(p,{strokeDasharray:L,strokeDashoffset:L});tl.to(p,{strokeDashoffset:0,duration:.7,ease:"power2.inOut"},cue(TICK,"match"));}
tl.fromTo("#sC-ok",{opacity:0,y:10},{opacity:1,y:0,duration:.4,immediateRender:false},TICK+.4);
tl.fromTo("#chipC",{opacity:0,x:-40},{opacity:1,x:0,duration:.5,ease:"power3.out",immediateRender:false},cue(CUTS[1]+3.9,"pop",{i:2}));
tl.to("#chipC",{opacity:0,duration:.3},CUTS[2]-.6);

// D · paid, with a clink
const CLINK=CUTS[2]+1.15;
veilCut("sC","sD",CUTS[2]);
draw("sD",CUTS[2]+.1,1.2); washes("sD",CUTS[2]+.2,.2); words("sD",CUTS[2]+.25);
cue(CLINK,"clink");
tl.fromTo("#chipD",{opacity:0,scale:.8},{opacity:1,scale:1,duration:.45,ease:"back.out(2)",immediateRender:false},cue(CLINK+.6,"match"));

// End card
veilCut("sD",null,END);
tl.to(["#chipD","#rule","#eyebrow","#lock"],{opacity:0,duration:.3},END);
tl.set("#end",{opacity:1},END);
tl.fromTo("#endwash",{opacity:0,scale:.8},{opacity:.55,scale:1,duration:1.2,ease:"power2.out",immediateRender:false},END+.05);
tl.fromTo("#bigLogo",{opacity:0,y:20},{opacity:1,y:0,duration:.7,ease:"power3.out",immediateRender:false},cue(END+.3,"logo"));
tl.fromTo("#cta",{opacity:0,xPercent:-50,y:30},{opacity:1,xPercent:-50,y:0,duration:.45,ease:"back.out(1.6)",immediateRender:false},cue(END+.85,"tap"));
tl.fromTo("#site",{opacity:0},{opacity:1,duration:.4,immediateRender:false},END+1.05);
tl.to("#bigLogo",{scale:1.04,duration:DUR-END-1,ease:"sine.inOut"},END+1);
tl.fromTo("#bar",{scaleX:0},{scaleX:1,duration:DUR,ease:"none"},0);
tl.set({},{},DUR);

// ── life(t): everything that moves for the whole scene, from the frame time.
const el={};const g=(id)=>el[id]??=document.getElementById(id);
const setT=(id,v)=>{const e=g(id);if(e)e.setAttribute("transform",v);};
const css=(id,v)=>{const e=g(id);if(e)e.style.transform=v;};
const op=(id,v)=>{const e=g(id);if(e)e.style.opacity=v;};
const PET=Array.from({length:14},(_,i)=>{const a=(i*2.399)%6.283,d=40+((i*53)%120);return{x:255+Math.cos(a)*d*1.2,y:560+Math.sin(a)*d*.7,v:38+(i*17)%40,ph:i*.7};});
const FLY=Array.from({length:8},(_,i)=>({x:120+(i*137)%840,y:560+(i*71)%260,ph:i*1.3}));
function life(t){
  // the camera and its parallax: back layers move least, front layers most
  for(const id in WIN){const [a,b]=WIN[id],p=PAN[id],u=ease((t-a)/(b-a+.9));
    const cx=p.x*u+Math.sin(t*.5+a)*12, cy=p.y*u+Math.sin(t*.37+a)*8;
    {const c=g(id+"-cap");if(c)c.style.transform="translateY("+(-16*u).toFixed(1)+"px)";}
    css(id+"-art","scale("+(1+p.s*u).toFixed(4)+")");
    css(id+"-bg","translate("+(cx*.35).toFixed(1)+"px,"+(cy*.35).toFixed(1)+"px)");
    css(id+"-mid","translate("+(cx*.8).toFixed(1)+"px,"+(cy*.8).toFixed(1)+"px)");
    css(id+"-fg","translate("+(cx*1.35).toFixed(1)+"px,"+(cy*1.35).toFixed(1)+"px)");}
  // the ink boils like hand-drawn animation: a new wobble 8 times a second
  g("turb").setAttribute("seed",String(1+Math.floor(t*8)%7));
  // the washes breathe
  $$(".wb").forEach((w,i)=>{w.style.transform="scale("+(1+.05*Math.sin(t*.8+i*1.7)).toFixed(4)+") translate("+(11*Math.sin(t*.6+i)).toFixed(1)+"px,"+(6*Math.sin(t*.45+i*2)).toFixed(1)+"px) rotate("+(2*Math.sin(t*.3+i)).toFixed(2)+"deg)";});

  // A: birds cross the sky flapping, clouds drift, petals fall and sway
  const tA=t-.2;
  [[880,250,58,0],[960,215,66,1.7],[820,300,50,3.1]].forEach(([x0,y0,v,ph],i)=>{
    const x=x0-v*tA,y=y0+7*Math.sin(t*2.2+ph),f=Math.sin(t*13+ph*2);
    const e=g("sA-b"+i);if(e){e.setAttribute("d","M"+x.toFixed(1)+" "+y.toFixed(1)+" q8 "+(-11*f).toFixed(1)+" 16 0 q8 "+(-11*f).toFixed(1)+" 16 0");e.style.opacity=clamp((t-1.6)*2)*clamp((x+40)/100);}});
  setT("sA-c0","translate("+(140+14*t).toFixed(1)+" 170) scale(1)");
  setT("sA-c1","translate("+(760+9*t).toFixed(1)+" 120) scale(.8)");
  PET.forEach((p,i)=>{const e=g("sA-p"+i);if(!e)return;const run=((t*p.v/10+p.ph*40)%260);
    e.setAttribute("cx",(p.x+18*Math.sin(t*1.6+i)+run*.25).toFixed(1));e.setAttribute("cy",(p.y+run).toFixed(1));
    e.setAttribute("transform","rotate("+(40*Math.sin(t*2+i)).toFixed(1)+" "+(p.x).toFixed(0)+" "+(p.y+run).toFixed(0)+")");
    e.style.opacity=(clamp((t-1.8)*1.5)*(1-run/260)*.85).toFixed(3);});

  // B: steam curls up from the cup, the lamp glow flickers, the pen travels to strike
  for(const k of [0,1]){const e=g("sB-s"+k);if(!e)continue;let d="";const x0=150+k*35;
    for(let j=0;j<=12;j++){const y=528-j*6,x=x0+7*Math.sin(j*.55-t*3.2+k*2);d+=(j?" L":"M")+x.toFixed(1)+" "+y.toFixed(1);}
    e.setAttribute("d",d);e.style.opacity=(clamp((t-CUTS[0]-1)*1.2)*(.55+.25*Math.sin(t*2+k))).toFixed(3);}
  {const w=g("sB-bg-wb0");if(w)w.style.opacity=(.8+.2*Math.sin(t*7.1)*Math.sin(t*2.3)).toFixed(3);}
  {const rest=[0,0],a=[-220,-262],b=[-62,-280];let p=rest;
   if(t>STRIKE-.55&&t<STRIKE){const u=ease((t-STRIKE+.55)/.55);p=[a[0]*u,a[1]*u];}
   else if(t>=STRIKE&&t<STRIKE+.35){const u=(t-STRIKE)/.35;p=[a[0]+(b[0]-a[0])*u,a[1]+(b[1]-a[1])*u];}
   else if(t>=STRIKE+.35&&t<STRIKE+1){const u=ease((t-STRIKE-.35)/.65);p=[b[0]*(1-u),b[1]*(1-u)];}
   setT("sB-pen","translate("+p[0].toFixed(1)+" "+p[1].toFixed(1)+")");
   const e=g("sB-pen");if(e)e.style.opacity=clamp((t-CUTS[0]-1.2)*2);}
  css("sB-invw","rotate("+(.7*Math.sin(t*1.1)).toFixed(3)+"deg) translateY("+(4*Math.sin(t*.9)).toFixed(1)+"px)");

  // C: the phone floats, sparkles twinkle, rings pulse out from the tick
  css("sC-mid",g("sC-mid").style.transform+" translateY("+(18*Math.sin(t*1.35)).toFixed(1)+"px) rotate("+(1.4*Math.sin(t*.8)).toFixed(2)+"deg)");
  for(let i=0;i<4;i++){const e=g("sC-k"+i);if(e){e.style.transform="scale("+(.6+.5*Math.abs(Math.sin(t*2.1+i*1.3))).toFixed(3)+") rotate("+((t*40+i*30)%360).toFixed(0)+"deg)";e.style.opacity=clamp((t-CUTS[1]-1)*2);}}
  for(const k of [0,1]){const e=g("sC-ring"+k);if(!e)continue;const s=t-TICK-.5-k*.7;
    if(s<0){e.style.opacity=0;continue;}const f=(s/1.4)%1;e.setAttribute("r",(44+90*f).toFixed(1));e.style.opacity=(.65*(1-f)).toFixed(3);}

  // D: the sun sinks, stars come out, lanterns flicker, fireflies drift, glasses clink
  const uD=clamp((t-CUTS[2])/(END-CUTS[2]+1));
  setT("sD-sun","translate(0 "+(80*uD).toFixed(1)+")");
  css("sD-sunwash","translateY("+(80*uD).toFixed(1)+"px)");
  for(let i=0;i<6;i++){const e=g("sD-st"+i);if(!e)continue;const on=clamp((t-CUTS[2]-.6-i*.35)*2);
    e.style.opacity=(on*(.5+.5*Math.abs(Math.sin(t*3+i)))).toFixed(3);e.style.transform="scale("+(.7+.4*Math.abs(Math.sin(t*2.4+i))).toFixed(3)+")";}
  for(const k of [0,1]){const e=g("sD-f"+k);if(e)e.style.transform="scaleY("+(.85+.3*Math.abs(Math.sin(t*13+k)*Math.sin(t*7.3+k*2))).toFixed(3)+") scaleX("+(1+.08*Math.sin(t*9+k)).toFixed(3)+")";
    const w=g("sD-fg-wb"+k);if(w)w.style.opacity=(.75+.25*Math.abs(Math.sin(t*11+k))).toFixed(3);}
  FLY.forEach((f,i)=>{const e=g("sD-ff"+i);if(!e)return;e.setAttribute("cx",(f.x+30*Math.sin(t*.7+f.ph)).toFixed(1));e.setAttribute("cy",(f.y+18*Math.sin(t*1.1+f.ph*2)).toFixed(1));
    e.style.opacity=(clamp((t-CUTS[2]-.8)*1.5)*(.35+.65*Math.abs(Math.sin(t*2.6+f.ph)))).toFixed(3);});
  const c=t-CLINK, lean=c<-.35?0:c<0?ease((c+.35)/.35):c<.5?1-ease(c/.5)*.6:.4;
  css("sD-fig0","rotate("+(5*lean).toFixed(2)+"deg)");css("sD-fig1","rotate("+(-5*lean).toFixed(2)+"deg)");
  {const e=g("sD-clk");if(e){const k=c<0?0:c<.6?1-c/.6:0;e.style.opacity=k.toFixed(3);e.style.transform="scale("+(.8+.6*(1-k)).toFixed(3)+")";}}

  // end card: a few blossoms drift down past the logo
  {const w=g("endwash");if(w&&t>END+1.3)w.style.transform="scale("+(1+.06*Math.sin((t-END)*1.3)).toFixed(4)+") rotate("+(3*Math.sin((t-END)*.7)).toFixed(2)+"deg)";}
  {const b=g("cta");if(b&&t>END+1.4)b.style.marginTop=(5*Math.sin((t-END)*3)).toFixed(1)+"px";}
  for(let i=0;i<16;i++){const e=g("e-p"+i);if(!e)continue;const s=t-END-.2;if(s<0){e.style.opacity=0;continue;}
    const x=100+(i*131)%880+30*Math.sin(t*1.4+i),y=300+((s*120+i*83)%1150);
    e.style.transform="translate("+x.toFixed(1)+"px,"+y.toFixed(1)+"px) rotate("+(50*Math.sin(t*2+i)).toFixed(0)+"deg)";e.style.opacity=(.7*clamp(s*2)).toFixed(3);}
}

window.REEL_DURATION=DUR;
window.REEL_CUES=CUES.sort((a,b)=>a.t-b.t);
// returns nothing: returning the timeline crashed the browser when the renderer read the result
window.setFrame=(t)=>{tl.seek(t,false);life(t);};
window.setFrame(0);
</script></body></html>`;

writeFileSync(new URL("./page.html", import.meta.url), html);
console.log("page.html written", L.nights, "nights", T["{wrongTotal}"], "->", T["{rightTotal}"]);
