#!/usr/bin/env node
/**
 * PROTOTYPE — the "ink & wash" reel style: Bonasera's line illustration and
 * watercolour, in Operra's palette, as a second look for the studio.
 *
 * Same story, voice and ledger as the approved Arusha reel (golden 01), so the
 * two styles can be judged side by side. Lines are hand-drawn SVG that draws
 * itself on; washes are pre-made textures (textures.py) that bloom in behind
 * the ink; every cut is a watercolour veil spreading across the paper.
 * The logo is the brand's own light-ground file, never redrawn.
 *
 *   node studio/ink/build.mjs   -> studio/ink/page.html
 */
import { writeFileSync } from "node:fs";
import { makeLedger, tokens, money } from "../numbers.mjs";

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

// Jacaranda blossom: small loops scattered over the canopy.
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

const SCENES = {
  sA: {
    lines: [
      { d: "M40 600 C190 520 290 440 370 360 C420 312 465 252 515 205 C535 188 558 184 578 198 C640 246 702 318 790 398 C880 478 965 528 1050 570", w: 3.4 },
      { d: "M515 205 C505 232 528 246 512 270 M556 190 C566 220 550 238 570 258 M600 222 C596 246 612 256 604 280", w: 1.8 },
      { d: "M0 690 C150 650 280 672 420 640 C560 610 700 650 840 625 C930 610 1010 630 1080 618", w: 1.8 },
      { d: "M0 770 C200 750 420 780 640 758 C800 744 960 762 1080 754", w: 1.6 },
      { d: "M230 1000 C238 905 222 830 250 770 C266 738 256 708 276 676", w: 3.6 },
      { d: "M250 770 C205 732 165 712 120 702 M262 728 C306 698 346 688 388 668 M272 696 C258 650 248 610 258 570 M256 650 C218 628 188 600 178 568 M268 660 C306 630 326 600 336 568", w: 2.4 },
      { d: blossoms.join(" "), w: 1.6 },
      { d: "M560 720 L1080 640 M560 744 L1080 664", w: 3 },
      { d: Array.from({ length: 26 }, (_, i) => { const x = 572 + i * 20, y = 718 - (x - 560) * (80 / 520); return `M${x} ${y.toFixed(0)} l-8 ${24}`; }).join(" "), w: 1.2 },
      { d: "M610 740 L610 1000 M780 714 L780 1000 M950 688 L950 1000", w: 2.8 },
      { d: "M560 880 L1080 846 M560 916 L1080 882", w: 2.2 },
      { d: balusters(585, 1065, 40, 880, 916, -34 / 520).join(" "), w: 1.4 },
      { d: "M700 300 q12 -10 24 0 q12 -10 24 0 M770 268 q9 -8 18 0 q9 -8 18 0 M640 336 q8 -7 16 0 q8 -7 16 0", w: 1.8 },
    ],
    washes: [
      ["wash-sky", -60, 100, 1200, 620, 0.8],
      ["wash-blue", 330, 220, 520, 500, 0.5],
      ["wash-teal", -120, 690, 820, 400, 0.55],
      ["wash-lilac", 70, 430, 380, 330, 0.8],
      ["wash-violet", 170, 500, 200, 190, 0.55],
    ],
  },
  sB: {
    lines: [
      { d: "M0 880 L1080 840", w: 3 },
      { d: "M0 932 C300 912 700 906 1080 882 M0 976 C300 962 640 952 1080 926", w: 1.4 },
      { d: "M700 300 L840 300 L885 410 L655 410 Z", w: 2.8 },
      { d: "M735 410 Q770 444 805 410 M770 300 L800 250 L905 330 L905 840 M845 846 L965 846", w: 2.4 },
      { d: "M120 560 L120 660 C120 692 220 692 220 660 L220 560 M120 560 C120 545 220 545 220 560 C220 575 120 575 120 560 M220 590 C256 590 256 642 220 642", w: 2.6 },
      { d: "M150 530 C140 505 165 495 155 470 M185 528 C175 503 200 493 190 468", w: 1.4 },
      { d: "M150 790 a45 32 0 1 0 90 0 a45 32 0 1 0 -90 0 M240 790 q22 -14 44 0 M284 790 a45 32 0 1 0 90 0 a45 32 0 1 0 -90 0 M150 788 L110 770 M374 788 L414 772", w: 2.2 },
      { d: "M820 760 L1000 690 L1008 702 L828 772 Z", w: 1.8 },
    ],
    washes: [
      ["wash-lilac", 540, 240, 460, 440, 0.75],
      ["wash-blue", 260, 320, 600, 600, 0.45],
      ["wash-teal", 70, 500, 220, 230, 0.6],
    ],
  },
  sC: {
    lines: [
      { d: "M330 70 h420 a46 46 0 0 1 46 46 v800 a46 46 0 0 1 -46 46 h-420 a46 46 0 0 1 -46 -46 v-800 a46 46 0 0 1 46 -46 Z", w: 3.2 },
      { d: "M500 102 L580 102 M312 140 L768 140 M312 880 L768 880", w: 1.6 },
      { d: "M200 250 L232 250 M216 234 L216 266 M860 430 L892 430 M876 414 L876 446 M880 760 L904 760 M892 748 L892 772", w: 1.8 },
    ],
    washes: [
      ["wash-teal", 200, 110, 680, 800, 0.5],
      ["wash-violet-b", 650, 10, 400, 400, 0.55],
      ["wash-blue", 30, 620, 380, 380, 0.5],
    ],
  },
  sD: {
    lines: [
      { d: "M80 470 C220 400 320 340 420 270 C460 242 490 210 520 190 C540 178 560 180 576 194 C650 250 720 300 800 352 C890 410 970 440 1060 470", w: 3.2 },
      { d: "M520 190 C512 212 530 222 518 242 M560 186 C568 208 556 222 572 238", w: 1.6 },
      { d: "M846 290 m-46 0 a46 46 0 1 0 92 0 a46 46 0 1 0 -92 0", w: 1.8 },
      { d: "M0 560 C300 540 700 560 1080 545", w: 1.6 },
      { d: "M0 700 L1080 680 M0 742 L1080 722", w: 2.6 },
      { d: balusters(30, 1050, 60, 700, 742, -20 / 1080).join(" "), w: 1.4 },
      { d: "M392 470 C392 522 452 522 452 470 Z M422 516 L422 584 M398 588 L446 588", w: 2.4 },
      { d: "M572 448 C572 500 632 500 632 448 Z M602 494 L602 562 M578 566 L626 566", w: 2.4 },
      { d: "M330 660 a34 38 0 1 0 68 0 a34 38 0 1 0 -68 0 M300 790 C300 730 330 702 364 700 C398 702 428 730 428 790 M404 724 C420 680 424 630 422 590", w: 2.6 },
      { d: "M650 640 a34 38 0 1 0 68 0 a34 38 0 1 0 -68 0 M620 772 C620 712 650 684 684 682 C718 684 748 712 748 772 M640 704 C624 660 604 610 602 570", w: 2.6 },
      { d: "M338 646 C352 630 380 628 394 646 M658 626 C672 610 700 608 714 626", w: 1.4 },
      { d: "M500 438 L516 422 M510 452 L532 446 M502 428 L508 406", w: 1.6 },
      { d: "M150 770 h60 v90 h-60 Z M160 770 C160 745 200 745 200 770 M870 760 h60 v90 h-60 Z M880 760 C880 735 920 735 920 760", w: 2.2 },
      { d: "M180 800 C172 815 188 822 180 836 M900 790 C892 805 908 812 900 826", w: 1.4 },
    ],
    washes: [
      ["wash-dusk", -40, 30, 1160, 620, 0.8],
      ["wash-rose", 0, 400, 1080, 280, 0.6],
      ["wash-magenta", 740, 190, 220, 220, 0.8],
      ["wash-violet", 0, 640, 1080, 420, 0.4],
      ["wash-lilac", 120, 730, 140, 150, 0.7],
      ["wash-lilac", 840, 720, 140, 150, 0.7],
      ["wash-blue", 270, 640, 190, 180, 0.5],
      ["wash-teal", 590, 620, 190, 180, 0.5],
    ],
  },
};

const CAPS = {
  sA: { text: "Ankara inakataliwa tena msimu huu?", bad: ["inakataliwa"] },
  sB: { text: "Bei ya wakala imekosewa mapokezi?", bad: ["imekosewa"] },
  sC: { text: "Operra inadhibiti viwango na mapokezi." },
  sD: { text: "Malipo ya msimu yanaingia bila usumbufu.", good: ["bila", "usumbufu"] },
};
const cap = (id, c) => {
  const words = c.text.split(" ");
  const cls = (w) => {
    const b = w.replace(/[?.,]/g, "");
    return c.bad?.includes(b) ? "bad" : c.good?.includes(b) ? "good" : "";
  };
  return `<div class="cap" id="${id}-cap" style="font-size:${c.text.length <= 36 ? 74 : 66}px">${words
    .map((w) => `<span class="w"><span class="wi ${cls(w)}">${w}</span></span>`)
    .join(" ")}</div>`;
};

const svgFor = (id, s) =>
  `<svg class="ink" viewBox="0 0 1080 1000">${s.lines
    .map((l, i) => `<path id="${id}-l${i}" d="${l.d}" stroke-width="${l.w}"/>`)
    .join("")}</svg>`;
const washesFor = (id, s) =>
  s.washes
    .map(([n, x, y, w, h, o], i) => `<img class="wash" id="${id}-w${i}" data-o="${o}" src="tex/${n}.webp" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px">`)
    .join("");

const invoice = `<div class="inv" id="sB-inv">
  <svg class="invb" viewBox="0 0 440 470" preserveAspectRatio="none"><path id="sB-invb" d="M8 10 L432 4 L436 462 L4 466 Z"/></svg>
  <div class="ihead"><span>ANKARA</span><span>№ A-4417</span></div>
  <div class="irow"><span>Chumba</span><span>${T["{room}"]}</span></div>
  <div class="irow"><span>Usiku</span><span>${T["{nights}"]}</span></div>
  <div class="irow big"><span>Bei ya chumba / usiku</span><span class="rate">${T["{wrongRate}"]}<svg class="pen" viewBox="0 0 160 40" preserveAspectRatio="none"><path id="sB-strike" d="M2 26 C 50 14, 112 28, 158 12"/></svg></span></div>
  <div class="irow"><span>Jumla</span><span>${T["{wrongTotal}"]}</span></div>
  <div class="stamp" id="sB-stamp">IMEKATALIWA</div>
</div>`;

const flip = (id, a, b) => `<span class="flip" id="${id}"><span class="fa">${a}</span><span class="fb">${b}</span></span>`;
const folio = `<div class="fol" id="sC-fol">
  <div class="fhead">FOLIO · ROOM ${T["{room}"]}</div>
  <div class="frow" id="sC-r0"><span>Room rate / night</span><span>${T["{rightRate}"]}</span></div>
  <div class="frow" id="sC-r1"><span>Charged / night</span>${flip("sC-f1", T["{wrongRate}"], T["{rightRate}"])}</div>
  <div class="frow tot" id="sC-r2"><span>Due<i>${flip("sC-f2", T["{wrongSum}"], T["{rightSum}"])}</i></span>${flip("sC-f3", T["{wrongTotal}"], T["{rightTotal}"])}</div>
  <svg class="tick" viewBox="0 0 120 120"><path id="sC-tick" d="M60 60 m-40 0 a40 40 0 1 0 80 0 a40 40 0 1 0 -80 0 M40 62 L55 77 L82 46"/></svg>
  <div class="ok" id="sC-ok">Correct rate applied</div>
</div>`;

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
.wash{position:absolute;opacity:0;mix-blend-mode:multiply}
.ink{position:absolute;left:0;top:0;width:1080px;height:1000px;overflow:visible}
.ink path{fill:none;stroke:${INK};stroke-linecap:round;stroke-linejoin:round}
.cap{position:absolute;left:80px;top:1215px;width:840px;font-weight:600;line-height:1.12;letter-spacing:-.02em;color:${INK}}
.w{display:inline-block;vertical-align:top}
.wi{display:inline-block}
.wi.bad{color:${RED}}
.wi.good{color:${TEAL_INK}}
.rule{position:absolute;left:80px;top:1180px;width:120px;height:5px;border-radius:5px;background:linear-gradient(90deg,#B23BFF,#3E86FF,#36D2BA);transform-origin:0 50%}
#lock{position:absolute;left:80px;top:96px;height:44px}
.pill{position:absolute;right:80px;top:92px;font-size:23px;font-weight:600;letter-spacing:.12em;color:${INK};border:2px solid ${INK};border-radius:100px;padding:11px 24px}
.tag{position:absolute;left:80px;top:1120px;font-size:22px;font-weight:600;letter-spacing:.14em;color:${INK_SOFT}}
.inv{position:absolute;left:260px;top:260px;width:540px;height:560px;padding:40px 44px;transform:rotate(-3deg);font-size:27px;color:${INK}}
.invb{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.invb path{fill:rgba(255,253,248,.82);stroke:${INK};stroke-width:2.6;stroke-linejoin:round}
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
.ok{position:absolute;left:0;top:560px;width:448px;text-align:center;font-size:24px;font-weight:600;color:${TEAL_INK};opacity:0}
.chip{position:absolute;left:80px;top:1112px;font-size:26px;font-weight:600;color:${TEAL_INK};border:2px solid ${TEAL_INK};border-radius:100px;padding:12px 26px;opacity:0;background:rgba(249,245,238,.85)}
#veil{position:absolute;left:-160px;top:260px;width:1400px;height:1400px;opacity:0;transform-origin:700px 700px;mix-blend-mode:multiply}
#end{position:absolute;inset:0;opacity:0}
#endwash{position:absolute;left:190px;top:520px;width:700px;height:560px;opacity:.55;mix-blend-mode:multiply}
#bigLogo{position:absolute;left:270px;top:740px;width:540px;opacity:0}
#cta{position:absolute;left:50%;top:1000px;font-size:38px;font-weight:600;color:#F9F5EE;background:${INK};border-radius:100px;padding:24px 54px;white-space:nowrap;opacity:0}
#site{position:absolute;top:1140px;width:100%;text-align:center;font-size:30px;color:${INK_SOFT};opacity:0}
#bar{position:absolute;left:0;bottom:0;height:7px;width:${W}px;background:linear-gradient(90deg,#E01FEE,#7B54FF,#1FA8F0);transform-origin:0 50%}
</style></head><body>
<img id="paper" src="tex/paper.webp">
${Object.entries(SCENES)
  .map(([id, s]) => `<div class="scene" id="${id}"><div class="art" id="${id}-art">${washesFor(id, s)}${svgFor(id, s)}${id === "sB" ? invoice : ""}${id === "sC" ? folio : ""}</div>${cap(id, CAPS[id])}</div>`)
  .join("\n")}
<div class="tag" id="tagA">ARUSHA · MSIMU WA SAFARI</div>
<div class="chip" id="chipC">Kiswahili na Kiingereza</div>
<div class="chip" id="chipD">Malipo yamepokelewa · ${T["{rightTotal}"]}</div>
<div class="rule" id="rule"></div>
<img id="veil" src="tex/veil.webp">
<div id="end"><img id="endwash" src="tex/wash-lilac.webp"><img id="bigLogo" src="../../brands/operra/assets/logo-light.png">
  <div id="cta">Ona inavyofanya kazi</div><div id="site">operra.tech</div></div>
<img id="lock" src="../../brands/operra/assets/logo-light.png"><div class="pill" id="eyebrow">UPANGAJI BEI</div>
<div id="bar"></div>
<script src="../assets/gsap.min.js"></script>
<script>
const CUTS=${JSON.stringify(CUTS)}, END=${END}, DUR=${DUR};
const CUES=[];
const WASH=.62; // watercolour sits under the ink: lighter than the line, never over it
const cue=(t,type,o={})=>{CUES.push({t:+t.toFixed(3),type,...o});return t;};
const tl=gsap.timeline({paused:true});
const $=(s)=>document.querySelector(s), $$=(s)=>document.querySelectorAll(s);

// Ink draws itself on, path by path. The pen's scratch plays while it draws.
function draw(id,t0,span){
  const paths=[...$$("#"+id+" .ink path")];
  const step=span/paths.length;
  paths.forEach((p,i)=>{const L=Math.ceil(p.getTotalLength())+4;gsap.set(p,{strokeDasharray:L,strokeDashoffset:L});
    tl.to(p,{strokeDashoffset:0,duration:Math.max(.5,step*1.8),ease:"power1.inOut"},t0+i*step);});
  cue(t0,"sketch",{dur:span+.6});
}
// Pigment blooms into the paper behind the ink.
function bloom(sel,t,o){tl.fromTo(sel,{opacity:0,scale:.8},{opacity:o*WASH,scale:1,duration:1.4,ease:"power2.out",immediateRender:false},t);}
function washes(id,t0,gap){[...$$("#"+id+" .wash")].forEach((w,i)=>bloom(w,t0+i*gap,+w.dataset.o));}
function words(id,t){[...$$("#"+id+"-cap .wi")].forEach((w,i)=>tl.fromTo(w,{y:60-i*5,opacity:0,filter:"blur(8px)"},{y:0,opacity:1,filter:"blur(0px)",duration:.5,ease:"power3.out",immediateRender:false},t+i*.055));}
function camera(id,t0,t1){tl.fromTo("#"+id+"-art",{scale:1,x:0,y:0},{scale:1.05,x:-14,y:-10,duration:t1-t0+.8,ease:"sine.inOut",immediateRender:false},t0);}
// The cut: a violet bloom spreads across the paper, the scenes swap under it,
// and it soaks away into the next picture.
function veilCut(a,b,T){
  tl.fromTo("#veil",{opacity:0,scale:.12,rotation:-8},{opacity:.92,scale:1.6,rotation:0,duration:.5,ease:"power2.in",immediateRender:false},T-.5);
  tl.to("#veil",{scale:3.2,duration:.55,ease:"power2.out"},T);
  tl.set("#"+a,{opacity:0},T); if(b) tl.set("#"+b,{opacity:1},T);
  tl.to("#veil",{opacity:0,duration:.6,ease:"power1.out"},T+.08);
  cue(T,"bloom");
}
gsap.set(".wi",{opacity:0});
// Everything that makes an entrance starts hidden, or it shows before its cue
// (the invoice showed through the first veil).
gsap.set(["#sB-inv","#sC-fol .fhead","#sC-fol .frow","#sC-ok"],{opacity:0});

// A · Arusha (0 – 6.22)
camera("sA",0,CUTS[0]); draw("sA",.15,2.4); washes("sA",.5,.32); words("sA",.6);
tl.fromTo("#lock",{opacity:0},{opacity:1,duration:.6,immediateRender:false},.3);
tl.fromTo("#eyebrow",{opacity:0,y:-10},{opacity:1,y:0,duration:.5,immediateRender:false},cue(.9,"pop",{i:0}));
tl.fromTo("#rule",{scaleX:0},{scaleX:1,duration:.7,ease:"power3.out",immediateRender:false},.5);
tl.fromTo("#tagA",{opacity:0,x:-30},{opacity:1,x:0,duration:.5,immediateRender:false},cue(2.0,"pop",{i:1}));
tl.to("#tagA",{opacity:0,duration:.3},CUTS[0]-.6);

// B · the mistake (6.22 – 11.35)
veilCut("sA","sB",CUTS[0]);
camera("sB",CUTS[0],CUTS[1]); draw("sB",CUTS[0]+.15,1.6); washes("sB",CUTS[0]+.3,.35); words("sB",CUTS[0]+.25);
tl.fromTo("#sB-inv",{opacity:0,y:40,rotation:-8},{opacity:1,y:0,rotation:-3,duration:.7,ease:"power3.out",immediateRender:false},cue(CUTS[0]+.7,"card"));
{const p=$("#sB-invb"),L=Math.ceil(p.getTotalLength())+4;gsap.set(p,{strokeDasharray:L,strokeDashoffset:L});tl.to(p,{strokeDashoffset:0,duration:.9,ease:"power1.inOut"},CUTS[0]+.75);}
{const p=$("#sB-strike"),L=Math.ceil(p.getTotalLength())+4;gsap.set(p,{strokeDasharray:L,strokeDashoffset:L});tl.to(p,{strokeDashoffset:0,duration:.35,ease:"power1.inOut"},cue(CUTS[0]+2.0,"strike"));}
tl.fromTo("#sB-stamp",{opacity:0,scale:2.2},{opacity:.92,scale:1,duration:.17,ease:"power4.in",immediateRender:false},cue(CUTS[0]+2.95,"stamp")-.17);
tl.fromTo("#sB-art",{x:0},{x:-7,duration:.05,yoyo:true,repeat:3,ease:"none",immediateRender:false},CUTS[0]+2.95);

// C · Operra (11.35 – 18.4)
veilCut("sB","sC",CUTS[1]);
camera("sC",CUTS[1],CUTS[2]); draw("sC",CUTS[1]+.15,1.2); washes("sC",CUTS[1]+.25,.35); words("sC",CUTS[1]+.25);
tl.fromTo("#sC-fol .fhead, #sC-fol .frow",{opacity:0,y:16},{opacity:1,y:0,duration:.45,stagger:.15,ease:"power3.out",immediateRender:false},cue(CUTS[1]+.9,"card"));
gsap.set(["#sC-f1 .fb","#sC-f2 .fb","#sC-f3 .fb"],{yPercent:110});
for(const [id,t,c] of [["sC-f1",CUTS[1]+2.0,"flip"],["sC-f2",CUTS[1]+2.35,null],["sC-f3",CUTS[1]+2.35,"flip"]]){
  tl.to("#"+id+" .fa",{yPercent:-110,duration:.32,ease:"power2.inOut"},c?cue(t,c):t);
  tl.to("#"+id+" .fb",{yPercent:0,duration:.32,ease:"power2.inOut"},t);
}
{const p=$("#sC-tick"),L=Math.ceil(p.getTotalLength())+4;gsap.set(p,{strokeDasharray:L,strokeDashoffset:L});tl.to(p,{strokeDashoffset:0,duration:.7,ease:"power2.inOut"},cue(CUTS[1]+2.9,"match"));}
tl.fromTo("#sC-ok",{opacity:0,y:10},{opacity:1,y:0,duration:.4,immediateRender:false},CUTS[1]+3.3);
tl.fromTo("#chipC",{opacity:0,x:-40},{opacity:1,x:0,duration:.5,ease:"power3.out",immediateRender:false},cue(CUTS[1]+3.9,"pop",{i:2}));
tl.to("#chipC",{opacity:0,duration:.3},CUTS[2]-.6);

// D · paid (18.4 – 21.44)
veilCut("sC","sD",CUTS[2]);
camera("sD",CUTS[2],END); draw("sD",CUTS[2]+.1,1.5); washes("sD",CUTS[2]+.2,.22); words("sD",CUTS[2]+.25);
tl.fromTo("#chipD",{opacity:0,scale:.8},{opacity:1,scale:1,duration:.45,ease:"back.out(2)",immediateRender:false},cue(CUTS[2]+1.25,"match"));

// End card: the last veil carries the paper to the brand's own logo.
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

window.REEL_DURATION=DUR;
window.REEL_CUES=CUES.sort((a,b)=>a.t-b.t);
window.setFrame=(t)=>{tl.seek(t,false);}; // returns nothing: returning the timeline crashed the browser when the renderer read the result
window.setFrame(0);
</script></body></html>`;

writeFileSync(new URL("./page.html", import.meta.url), html);
console.log("page.html written", L.nights, "nights", T["{wrongTotal}"], "->", T["{rightTotal}"]);
