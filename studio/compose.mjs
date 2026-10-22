/**
 * Brief -> reel page. The only creative input is the brief; everything here
 * is fixed design, tested once.
 *
 * Brief (what Alice writes):
 *   { id, language: "sw"|"en", eyebrow, cta,
 *     ledger?: { nights?, rightRate?, wrongRate? },        // optional; seeded otherwise
 *     scenes: [ { type, line, bad?, good?, image?, ...type fields } ] }
 *
 * The logo is the brand's own file, used as given. It is never redrawn.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { UI_CSS, P } from "./lib/ui.mjs";
import { SCENES, ROLE, WEIGHT, TRANSITIONS, transitionFor } from "./scenes.mjs";
import { makeLedger, tokens, assertNoDigits } from "./numbers.mjs";
import { planCuts } from "./timing.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const W = 1080, H = 1920;
const url = (p) => pathToFileURL(path.resolve(ROOT, p)).href;

function lcg(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

/** Refuse a brief the scene library cannot draw well, before any work is spent. */
export function validateBrief(b) {
  const errs = [];
  if (!["sw", "en"].includes(b.language)) errs.push(`language must be sw or en`);
  if (!Array.isArray(b.scenes) || b.scenes.length < 3 || b.scenes.length > 6) errs.push("3 to 6 scenes");
  (b.scenes ?? []).forEach((s, i) => {
    if (!SCENES[s.type]) errs.push(`scene ${i + 1}: unknown type "${s.type}" (have ${Object.keys(SCENES).join(", ")})`);
    if (!s.line || s.line.split(/\s+/).length > 9) errs.push(`scene ${i + 1}: line must be 1-9 words`);
    if (["place", "problem-doc", "payoff"].includes(s.type) && !s.image) errs.push(`scene ${i + 1}: ${s.type} needs an image`);
  });
  if (b.scenes?.[b.scenes.length - 1]?.type !== "payoff") errs.push("the last scene must be a payoff");
  // Anything that naturally carries writing makes MOSS write on it, and three
  // redraws of a desk of papers all came back with pseudo-text. Documents and
  // screens are drawn by the tool on top of the photo, so the photo needs none.
  const WRITES = /\b(papers?|sheets?|documents?|invoices?|receipts?|books?|ledgers?|folders?|notebooks?|notepads?|screens?|laptops?|monitors?|computers?|phones?|tablets?|signs?|signage|menus?|newspapers?|labels?|posters?|whiteboards?|calendars?|clipboards?|card machines?|keyboards?|number plates?|licen[cs]e plates?|banners?)\b/i;
  (b.scenes ?? []).forEach((s, i) => {
    const m = s.image && !/[\\/]/.test(s.image) && WRITES.exec(s.image);
    if (m) errs.push(`scene ${i + 1}: the image prompt mentions "${m[0]}", which MOSS will letter. Leave documents and screens to the scene; describe the place, light and objects without writing surfaces`);
  });
  for (const k of ["eyebrow", "cta"]) {
    try {
      assertNoDigits(b[k] ?? "", k);
    } catch (e) {
      errs.push(e.message);
    }
  }
  if (errs.length) throw new Error(`brief rejected:\n  - ${errs.join("\n  - ")}`);
  return b;
}

/**
 * @param brief  validated brief; scene.image paths resolved by the caller
 * @param voice  result of timing.pauses()
 * @param brand  brands/<id>/brand.json contents (+ dir)
 */
export function compose(brief, voice, brand) {
  validateBrief(brief);
  const seed = brief.id ?? "reel";
  const ledger = makeLedger(brief.ledger ?? {}, seed, brief.language);
  const T = tokens(ledger);
  const roles = brief.scenes.map((s) => ROLE[s.type]);
  const cuts = planCuts(voice, brief.scenes.length, roles.map((r) => WEIGHT[r]));
  const endAt = +(voice.speechEnd - 0.45).toFixed(3); // the end card lands under the last words
  const duration = Math.min(59, Math.ceil(voice.speechEnd + 2.2));
  const starts = [0, ...cuts];
  const ends = [...cuts, endAt];

  const ids = brief.scenes.map((_, i) => `s${i}`);
  const built = brief.scenes.map((s, i) =>
    SCENES[s.type](ids[i], s, { t0: starts[i], dur: ends[i] - starts[i], T, seed, ledger }),
  );

  const steps = [];
  // The end card's pieces enter on their own steps; hidden until then, or the
  // button shows before the logo (the lag the user saw).
  const hide = ["#bigLogo", "#cta", "#site"];
  const init = [];
  built.forEach((b) => {
    steps.push(...b.steps);
    hide.push(...(b.hide ?? []));
    init.push(...(b.init ?? []));
  });
  const joins = cuts.map((T0, i) => {
    const kind = transitionFor(roles[i], roles[i + 1], i);
    steps.push(...TRANSITIONS[kind](ids[i], ids[i + 1], T0));
    return kind;
  });

  // Opening: the first shot resolves out of blur.
  steps.push({ t: 0, sel: `#${ids[0]}`, from: { filter: "blur(22px) brightness(1)", scale: 1.08 }, to: { filter: "blur(0px) brightness(1)", scale: 1 }, dur: 1.5, ease: "power2.out", cue: "open" });
  steps.push({ t: 0.35, sel: "#lock", from: { opacity: 0, y: -14 }, to: { opacity: 1, y: 0 }, dur: 0.7, ease: "power3.out" });
  if (brief.eyebrow) steps.push({ t: 0.85, sel: "#eyebrow", from: { opacity: 0, scale: 0.8 }, to: { opacity: 1, scale: 1 }, dur: 0.45, ease: "back.out(2)", cue: "pop", cueOpts: { i: 0 } });

  // End card: the final scene may exit; the brand's own logo arrives with a sheen.
  const last = ids.at(-1);
  steps.push(
    // In order and quick: scene out, card in, logo, button, address — about a second.
    { t: endAt, sel: `#${last}`, to: { scale: 1.1, filter: "blur(16px) brightness(1)", opacity: 0 }, dur: 0.5, ease: "power2.in" },
    { t: endAt, sel: "#lock,#eyebrow", to: { opacity: 0 }, dur: 0.3, ease: "none" },
    { t: endAt + 0.2, sel: "#end", from: { opacity: 0 }, to: { opacity: 1 }, dur: 0.35, ease: "none" },
    { t: endAt + 0.3, sel: "#bigLogo", from: { opacity: 0, scale: 1.2, filter: "blur(10px)" }, to: { opacity: 1, scale: 1, filter: "blur(0px)" }, dur: 0.65, ease: "power4.out", cue: "logo" },
    { t: endAt + 0.75, sel: "#sheen", from: { backgroundPosition: "-600px 0" }, to: { backgroundPosition: "600px 0" }, dur: 0.9, ease: "power2.inOut" },
    { t: endAt + 0.7, sel: "#cta", from: { opacity: 0, xPercent: -50, y: 40, scale: 0.9 }, to: { opacity: 1, xPercent: -50, y: 0, scale: 1 }, dur: 0.45, ease: "back.out(1.7)", cue: "tap" },
    { t: endAt + 0.9, sel: "#site", from: { opacity: 0, y: 12 }, to: { opacity: 1, y: 0 }, dur: 0.4, ease: "power2.out" },
    { t: 0, sel: "#bar", from: { scaleX: 0 }, to: { scaleX: 1 }, dur: duration, ease: "none" },
  );

  const cues = steps
    .filter((s) => s.cue)
    .map((s) => ({ t: +(s.cueAt ?? s.t).toFixed(3), type: s.cue, ...(s.cueOpts ?? {}) }))
    .sort((a, b) => a.t - b.t);

  const r = lcg(seed.length * 7919 + 17);
  const dust = Array.from({ length: 22 }, () => ({ x: r() * W, y: r() * H, r: 4 + r() * 26, a: 0.12 + r() * 0.3, v: 18 + r() * 50, ph: r() * 6.28 }));
  const logo = url(path.join("brands", brand.id, brand.logo));
  const fonts = (wt) => url(`brands/${brand.id}/assets/fonts/inter-latin-${wt}-normal.woff2`);

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
${[400, 500, 600, 700].map((w) => `@font-face{font-family:Inter;font-weight:${w};src:url(${fonts(w)})}`).join("\n")}
${CSS(logo)}
</style></head><body>
${built.map((b) => b.html).join("\n")}
<div id="dust">${dust.map((d, i) => `<i id="d${i}" style="width:${(d.r * 2).toFixed(0)}px;height:${(d.r * 2).toFixed(0)}px;opacity:${d.a.toFixed(2)}"></i>`).join("")}</div>
<div class="leak" id="leak-warm"></div><div class="leak" id="leak-1"></div><div class="leak" id="leak-2"></div>
<div id="end"><img id="bigLogo" src="${logo}"><div id="sheen"></div>
  <div id="cta">${escape(brief.cta ?? "")}</div><div id="site">${escape(brand.site ?? "")}</div></div>
<div id="chrome"><img id="lock" src="${logo}">${brief.eyebrow ? `<div class="pill" id="eyebrow">${escape(brief.eyebrow.toUpperCase())}</div>` : ""}</div>
<div id="bar"></div>
<script src="${url("studio/assets/gsap.min.js")}"></script>
<script>
const SHOTS=${JSON.stringify(ids)}, DUST=${JSON.stringify(dust)}, STEPS=${JSON.stringify(steps)};
const HIDE=${JSON.stringify(hide)}, INIT=${JSON.stringify(init)};
window.REEL_DURATION=${duration};
${RUNTIME}
window.REEL_CUES=${JSON.stringify(cues)};
window.setFrame=(t)=>{tl.seek(t,false);redraw(t);};
window.setFrame(0);
</script></body></html>`;

  // What the checker needs: where each scene settles, and every number the
  // reel is allowed to show (the ledger's, plus figures a scene computed itself).
  const windows = brief.scenes.map((s, i) => ({ id: ids[i], type: s.type, t0: starts[i], t1: ends[i] }));
  const allowed = [...Object.values(T), ...built.flatMap((b) => b.shows ?? [])];
  return { html, duration, cues, cuts, joins, ledger, steps, windows, endAt, allowed };
}

const escape = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// The browser side: one paused timeline built from STEPS, plus the only writer
// of the cameras and the dust.
const RUNTIME = `
const CAM={};SHOTS.forEach((id,i)=>CAM[id]={push:1,shake:0,ph:i*1.7});
function redraw(t){
  SHOTS.forEach(id=>{
    const c=CAM[id],dx=Math.sin(t*.55+c.ph)*12,dy=Math.sin(t*.71+c.ph)*9;
    const sx=c.shake*Math.sin(t*83)*16,sy=c.shake*Math.cos(t*71)*12;
    document.getElementById(id+"-cam").style.transform="translate("+(dx+sx).toFixed(2)+"px,"+(dy+sy).toFixed(2)+"px) scale("+(1.1*c.push).toFixed(4)+")";
    document.getElementById(id+"-fg").style.transform="translate("+(dx*1.8+sx*1.3).toFixed(2)+"px,"+(dy*1.8+sy*1.3).toFixed(2)+"px)";
  });
  DUST.forEach((d,i)=>{const y=((d.y-d.v*t)%${H}+${H})%${H},x=d.x+Math.sin(t*.6+d.ph)*24;
    document.getElementById("d"+i).style.transform="translate("+(x-d.r).toFixed(1)+"px,"+(y-d.r).toFixed(1)+"px)";});
}
const tl=gsap.timeline({paused:true});
gsap.set(SHOTS.map(s=>"#"+s),{filter:"blur(0px) brightness(1)"});
gsap.set(SHOTS.slice(1).map(s=>"#"+s),{opacity:0});
gsap.set(".wi",{opacity:0});
if(HIDE.length)gsap.set(HIDE,{opacity:0});
if(INIT.length)gsap.set(INIT,{yPercent:110});
const target=(sel)=>sel.startsWith("cam:")?CAM[sel.slice(4)]:sel;
for(const s of STEPS){
  if(s.kind==="words"){
    document.querySelectorAll(s.sel+" .wi").forEach((w,i)=>tl.fromTo(w,{y:70-i*6,opacity:0,filter:"blur(10px)"},
      {y:0,opacity:1,filter:"blur(0px)",duration:.5,ease:"power3.out",immediateRender:false},s.t+i*.055));
    continue;
  }
  if(s.sel.startsWith("draw:")){
    const p=document.querySelector(s.sel.slice(5)),L=Math.ceil(p.getTotalLength())+4;
    gsap.set(p,{strokeDasharray:L,strokeDashoffset:L});
    tl.to(p,{strokeDashoffset:0,duration:s.dur,ease:s.ease},s.t);
    continue;
  }
  const to={...s.to,duration:s.dur,ease:s.ease};
  if(s.from)tl.fromTo(target(s.sel),s.from,{...to,immediateRender:false},s.t);
  else tl.to(target(s.sel),to,s.t);
}
tl.set({},{},window.REEL_DURATION);
`;

function CSS(logo) {
  return `
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${W}px;height:${H}px;overflow:hidden;background:${P.bg};font-family:Inter,sans-serif;color:${P.text}}
.scene{position:absolute;inset:0;overflow:hidden;background:${P.bg};transform-origin:540px 860px}
.cam{position:absolute;inset:0;transform-origin:540px 800px;will-change:transform}
.photo{position:absolute;left:0;width:${W}px;height:${H}px;object-fit:cover}
.grade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(4,15,19,.55) 0%,rgba(4,15,19,0) 22%,rgba(4,15,19,0) 46%,rgba(4,15,19,.82) 64%,rgba(4,15,19,.97) 82%)}
.grade.ops{background:radial-gradient(70% 40% at 50% 38%,rgba(123,84,255,.30),rgba(4,15,19,0) 70%),linear-gradient(180deg,rgba(4,15,19,.80),rgba(4,15,19,.88) 50%,rgba(4,15,19,.97) 80%)}
.fg{position:absolute;inset:0}
#dust{position:absolute;inset:0;pointer-events:none}
#dust i{position:absolute;border-radius:50%;background:radial-gradient(circle,rgba(255,226,178,.9),rgba(255,226,178,0) 70%)}
#chrome{position:absolute;left:0;top:0;width:${W}px;height:200px}
#lock{position:absolute;left:80px;top:96px;height:44px}
.pill{position:absolute;right:80px;top:92px;font-size:24px;font-weight:600;letter-spacing:.12em;color:${P.glow};
      background:rgba(4,15,19,.55);border:1.5px solid rgba(164,120,255,.45);border-radius:100px;padding:12px 26px}
.place{position:absolute;left:80px;top:1086px;font-size:24px;font-weight:600;letter-spacing:.14em;
       background:rgba(4,15,19,.62);border:1px solid rgba(255,255,255,.18);border-radius:100px;padding:12px 24px;display:flex;align-items:center;gap:12px}
.place i{width:12px;height:12px;border-radius:50%;background:${P.teal};box-shadow:0 0 12px ${P.teal}}
.cap{position:absolute;left:80px;top:1190px;width:840px;font-weight:600;line-height:1.1;letter-spacing:-.025em}
.w{display:inline-block;vertical-align:top}
.wi{display:inline-block}
.wi.bad{color:#ff8a7a}
.wi.good{color:${P.teal}}
.paper{position:absolute;left:470px;top:560px;width:500px;padding:30px 34px 34px;background:#ece5d3;color:#26303a;border-radius:10px;box-shadow:0 50px 100px -30px rgba(0,0,0,.95)}
.phead{display:flex;justify-content:space-between;font-size:20px;letter-spacing:.14em;color:#1d3f8c;font-weight:700;border-bottom:2px solid #1d3f8c;padding-bottom:12px;margin-bottom:10px}
.pline{display:flex;justify-content:space-between;gap:16px;font-size:24px;padding:10px 0;border-bottom:1px dashed #b9b09a}
.pline.big{font-size:28px;font-weight:700;border:0;padding-top:16px}
.rate{position:relative;display:inline-block;white-space:nowrap}
.pen{position:absolute;left:-12px;top:0;width:calc(100% + 24px);height:100%;overflow:visible}
.pen path{fill:none;stroke:#d33a2c;stroke-width:6;stroke-linecap:round}
.stamp{position:absolute;left:-26px;bottom:-40px;font-size:44px;font-weight:700;letter-spacing:.08em;color:#c8312b;background:rgba(236,229,211,.55);
       border:6px double #c8312b;border-radius:10px;padding:6px 18px;transform:rotate(-12deg)}
${UI_CSS}
.tilt{position:absolute;left:80px;top:440px;width:920px;perspective:1400px}
.tilt .fcard{position:relative;width:920px;transform-origin:50% 100%}
.tilt>.chip{position:relative;display:inline-flex;margin-top:30px}
.scrwrap{transform-origin:50% 100%}
.scrwrap .win,.scrwrap .phone{position:relative;margin:0 auto}
.scr-frontdesk .win{width:920px !important}
.scr-reports{top:300px}
.bline .bval{white-space:nowrap}
.bline.neg .flip .fa{color:${P.neg}}
.btot>span:first-child{display:flex;flex-direction:column}
.btot .sum{font-size:22px;font-weight:500;color:${P.muted};margin-top:6px}
.btot .sum .flip .fb{color:${P.muted}}
.flip{position:relative;display:inline-block;overflow:hidden;height:1.25em;vertical-align:bottom;min-width:6.4em;text-align:right}
.btot .sum .flip{text-align:left;min-width:9em}
.btot .sum .flip span{left:0;right:auto}
.flip span{position:absolute;right:0;top:0;white-space:nowrap}
.flip .fb{color:${P.teal}}
.chip{position:absolute;display:flex;align-items:center;gap:12px;font-size:28px;font-weight:600;border-radius:100px;padding:16px 28px;white-space:nowrap}
.chip.ok{color:${P.teal};background:rgba(4,15,19,.7);border:1.5px solid rgba(54,210,186,.55)}
.chip.soft{color:${P.text};background:rgba(14,28,38,.92);border:1px solid rgba(255,255,255,.14)}
.leak{position:absolute;pointer-events:none;opacity:0}
#leak-warm{inset:0;background:#ff9d4d;mix-blend-mode:screen}
#leak-1{left:-900px;top:200px;width:2400px;height:1500px;background:radial-gradient(closest-side,rgba(255,190,120,.95),rgba(255,120,60,0));mix-blend-mode:screen}
#leak-2{left:-1200px;top:900px;width:2600px;height:1400px;background:radial-gradient(closest-side,rgba(224,31,238,.6),rgba(224,31,238,0));mix-blend-mode:screen}
#end{position:absolute;inset:0;opacity:0;background:radial-gradient(60% 34% at 50% 44%,rgba(123,84,255,.26),rgba(4,15,19,0) 72%),${P.bg}}
#bigLogo{position:absolute;left:272px;top:740px;width:536px}
#sheen{position:absolute;left:272px;top:740px;width:536px;height:136px;-webkit-mask:url(${logo}) 0 0/100% 100% no-repeat;mask:url(${logo}) 0 0/100% 100% no-repeat;
       background:linear-gradient(105deg,rgba(255,255,255,0) 35%,rgba(255,255,255,.85) 50%,rgba(255,255,255,0) 65%) -600px 0/300% 100% no-repeat}
#cta{position:absolute;top:1010px;left:50%;font-size:40px;font-weight:600;color:#0b0620;background:linear-gradient(135deg,${P.primary},${P.glow} 50%,${P.teal});border-radius:100px;padding:26px 56px;white-space:nowrap}
#site{position:absolute;top:1160px;width:100%;text-align:center;font-size:32px;color:${P.muted};letter-spacing:.04em}
#bar{position:absolute;left:0;bottom:0;height:8px;width:${W}px;background:linear-gradient(90deg,#E01FEE,#7B54FF,#1FA8F0);transform-origin:0 50%}
`;
}
