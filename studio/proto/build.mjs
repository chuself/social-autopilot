#!/usr/bin/env node
/**
 * PROTOTYPE v2 — one reel built by hand, to find the level before it becomes a tool.
 * Source post: operra-2026-10-20-13-pain-point (Swahili, Arusha, seasonal agent
 * rates), with its exact published voiceover. Scene changes sit in the voice's
 * own pauses (ffmpeg silencedetect): 5.89-6.54, 11.04-11.66, 18.16-18.64.
 *
 * v1 was rejected for three reasons, each now a rule:
 *  - It drew its own version of the Operra mark. The logo is ONLY ever the
 *    brand's own file (brands/operra/assets/logo-dark.png), never redrawn.
 *  - Its cuts were a hard geometric wipe between near-still photos: jarring.
 *    Every change is now a motion handoff — outgoing and incoming move at the
 *    same moment with matched eases (.in out, .out in), the cut at peak speed.
 *  - Nothing moved between cuts. Every shot now has a camera (push + drift),
 *    graphics ride a faster parallax plane, and dust drifts through the frame.
 *
 *   node studio/proto/build.mjs   -> studio/proto/page.html
 */
import { writeFileSync } from "node:fs";
import { folio, billLine, ico, UI_CSS, P } from "../lib/ui.mjs";

const DURATION = 24;
const W = 1080, H = 1920;
const LOGO = "../../brands/operra/assets/logo-dark.png"; // 429 x 109, used as given

// Seeded, so the dust is identical on every render.
function lcg(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}
const rnd = lcg(20261020);
const DUST = Array.from({ length: 22 }, () => ({
  x: rnd() * W, y: rnd() * H, r: 4 + rnd() * 26, a: 0.12 + rnd() * 0.3, v: 18 + rnd() * 50, ph: rnd() * 6.28,
}));

const words = (id, text, cls = {}) =>
  `<div class="cap" id="${id}">${text
    .split(" ")
    .map((w) => `<span class="w"><span class="wi ${cls[w.replace(/[?.,]/g, "")] ?? ""}">${w}</span></span>`)
    .join(" ")}</div>`;

// photo: the shot. fg: graphics on a faster parallax plane. cap: the line.
const scene = (id, img, { fg = "", cap = "", focus = 0, grade = "" } = {}) => `
<div class="scene" id="${id}">
  <div class="cam" id="${id}-cam"><img class="photo" src="media/${img}.jpg" style="top:${focus}px"></div>
  <div class="grade ${grade}"></div>
  <div class="fg" id="${id}-fg">${fg}</div>
  ${cap}
</div>`;

const invoice = `
<div class="paper" id="inv">
  <div class="phead"><span>ANKARA</span><span>№ A-2041</span></div>
  <div class="pline"><span>Wakala</span><span>Serengeti Trails</span></div>
  <div class="pline"><span>Usiku</span><span>12</span></div>
  <div class="pline big"><span>Bei kwa usiku</span><span class="rate">USD 210<svg class="pen" viewBox="0 0 160 40" preserveAspectRatio="none"><path id="inv-strike" d="M2 24 C 50 16, 110 26, 158 14"/></svg></span></div>
  <div class="stamp" id="inv-stamp">IMEKATALIWA</div>
</div>`;

const flipVal = (id, a, b) =>
  `<span class="flip" id="${id}"><span class="fa">${a}</span><span class="fb">${b}</span></span>`;

const ops = `
<div class="tilt">${folio("fol", {
  title: "FOLIO · SERENGETI TRAILS · HIGH SEASON",
  lines:
    billLine("fl1", "Agent contract rate", "USD 180") +
    billLine("fl2", "Charged at front desk", flipVal("fl2v", "USD 210", "USD 180"), "neg") +
    billLine("fl3", "Nights", "12"),
  totalLabel: "Due from agent",
  total: flipVal("foltot", "USD 2,520", "USD 2,160"),
})}</div>
<div class="chip ok" id="matched" style="left:110px;top:905px">${ico("check", { size: 30, stroke: 2.6 })}Matched to contract</div>`;

const html = `<!doctype html><html><head><meta charset="utf-8">
<style>
@font-face{font-family:Inter;font-weight:400;src:url(../../brands/operra/assets/fonts/inter-latin-400-normal.woff2)}
@font-face{font-family:Inter;font-weight:500;src:url(../../brands/operra/assets/fonts/inter-latin-500-normal.woff2)}
@font-face{font-family:Inter;font-weight:600;src:url(../../brands/operra/assets/fonts/inter-latin-600-normal.woff2)}
@font-face{font-family:Inter;font-weight:700;src:url(../../brands/operra/assets/fonts/inter-latin-700-normal.woff2)}
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

.cap{position:absolute;left:80px;top:1190px;width:880px;font-size:80px;font-weight:600;line-height:1.1;letter-spacing:-.025em}
.w{display:inline-block;vertical-align:top}
.wi{display:inline-block}
.wi.bad{color:#ff8a7a}
.wi.good{color:${P.teal}}

.paper{position:absolute;left:470px;top:560px;width:500px;padding:30px 34px 34px;background:#ece5d3;color:#26303a;border-radius:10px;
       box-shadow:0 50px 100px -30px rgba(0,0,0,.95)}
.phead{display:flex;justify-content:space-between;font-size:20px;letter-spacing:.14em;color:#1d3f8c;font-weight:700;border-bottom:2px solid #1d3f8c;padding-bottom:12px;margin-bottom:10px}
.pline{display:flex;justify-content:space-between;font-size:24px;padding:10px 0;border-bottom:1px dashed #b9b09a}
.pline.big{font-size:30px;font-weight:700;border:0;padding-top:16px}
.rate{position:relative;display:inline-block}
.pen{position:absolute;left:-12px;top:0;width:calc(100% + 24px);height:100%;overflow:visible}
.pen path{fill:none;stroke:#d33a2c;stroke-width:6;stroke-linecap:round}
.stamp{position:absolute;right:26px;top:-34px;font-size:44px;font-weight:700;letter-spacing:.08em;color:#c8312b;background:rgba(236,229,211,.55);
       border:6px double #c8312b;border-radius:10px;padding:6px 18px;transform:rotate(-12deg);opacity:0}

${UI_CSS}
.tilt{position:absolute;left:110px;top:470px;width:860px;perspective:1400px}
#fol{position:relative;width:860px;transform-origin:50% 100%}
.bline.neg .flip .fa{color:${P.neg}}
.flip{position:relative;display:inline-block;overflow:hidden;height:1.25em;vertical-align:bottom;min-width:5.6em;text-align:right}
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
#sheen{position:absolute;left:272px;top:740px;width:536px;height:136px;
       -webkit-mask:url(${LOGO}) 0 0/100% 100% no-repeat;mask:url(${LOGO}) 0 0/100% 100% no-repeat;
       background:linear-gradient(105deg,rgba(255,255,255,0) 35%,rgba(255,255,255,.85) 50%,rgba(255,255,255,0) 65%) -600px 0/300% 100% no-repeat}
#cta{position:absolute;top:1010px;left:50%;font-size:40px;font-weight:600;color:#0b0620;
     background:linear-gradient(135deg,${P.primary},${P.glow} 50%,${P.teal});border-radius:100px;padding:26px 56px;white-space:nowrap}
#site{position:absolute;top:1160px;width:100%;text-align:center;font-size:32px;color:${P.muted};letter-spacing:.04em}
#bar{position:absolute;left:0;bottom:0;height:8px;width:${W}px;background:linear-gradient(90deg,#E01FEE,#7B54FF,#1FA8F0);transform-origin:0 50%}
</style></head><body>

${scene("sA", "s1-season", {
  focus: -150,
  fg: `<div class="place" id="placeA"><i></i>ARUSHA · MSIMU WA SAFARI</div>`,
  cap: words("c1", "Ankara inakataliwa tena msimu huu?", { inakataliwa: "bad" }),
})}
${scene("sB", "s2-mistake", { focus: -260, fg: invoice, cap: words("c2", "Bei ya wakala imekosewa mapokezi?", { imekosewa: "bad" }) })}
${scene("sC", "s3-desk", {
  grade: "ops",
  fg: ops + `
<div class="chip soft" id="chip1" style="left:80px;top:1470px">${ico("check", { size: 26, stroke: 2.6 })}Kiswahili na Kiingereza</div>
<div class="chip soft" id="chip2" style="left:80px;top:1570px">${ico("wifi-off", { size: 26 })}Inafanya kazi mtandao ukiwa mdogo</div>`,
  cap: words("c3", "Operra inadhibiti viwango na mapokezi."),
})}
${scene("sD", "s4-dusk", {
  focus: -120,
  fg: `<div class="chip ok" id="paid" style="left:80px;top:1086px">${ico("check", { size: 30, stroke: 2.6 })}Malipo yamepokelewa · USD 2,160</div>`,
  cap: words("c4", "Malipo ya msimu yanaingia bila usumbufu.", { bila: "good", usumbufu: "good" }),
})}

<div id="dust">${DUST.map((d, i) => `<i id="d${i}" style="width:${(d.r * 2).toFixed(0)}px;height:${(d.r * 2).toFixed(0)}px;opacity:${d.a.toFixed(2)}"></i>`).join("")}</div>
<div class="leak" id="leak-warm"></div><div class="leak" id="leak-1"></div><div class="leak" id="leak-2"></div>

<div id="end">
  <img id="bigLogo" src="${LOGO}"><div id="sheen"></div>
  <div id="cta">Ona inavyofanya kazi</div>
  <div id="site">operra.tech</div>
</div>

<div id="chrome"><img id="lock" src="${LOGO}"><div class="pill" id="eyebrow">UPANGAJI BEI</div></div>
<div id="bar"></div>

<script src="../assets/gsap.min.js"></script>
<script>
const DUST=${JSON.stringify(DUST)};
const CUES=[];
// A sound exists only where an animation is placed: cue() returns the time it
// is given, so the tween and its sound share one number.
const cue=(t,type,o={})=>{CUES.push({t:+t.toFixed(3),type,...o});return t;};

// ── camera: one state per shot; redraw() is the only writer of .cam/.fg ──
const SHOTS=["sA","sB","sC","sD"];
const CAM={};SHOTS.forEach((id,i)=>CAM[id]={push:1,shake:0,ph:i*1.7});
function redraw(t){
  SHOTS.forEach(id=>{
    const c=CAM[id];
    const dx=Math.sin(t*.55+c.ph)*12, dy=Math.sin(t*.71+c.ph)*9;
    const sx=c.shake*Math.sin(t*83)*16, sy=c.shake*Math.cos(t*71)*12;
    document.getElementById(id+"-cam").style.transform=
      "translate("+(dx+sx).toFixed(2)+"px,"+(dy+sy).toFixed(2)+"px) scale("+(1.1*c.push).toFixed(4)+")";
    // graphics sit nearer the lens: they travel further than the photo
    document.getElementById(id+"-fg").style.transform=
      "translate("+(dx*1.8+sx*1.3).toFixed(2)+"px,"+(dy*1.8+sy*1.3).toFixed(2)+"px)";
  });
  DUST.forEach((d,i)=>{
    const y=((d.y-d.v*t)%${H}+${H})%${H}, x=d.x+Math.sin(t*.6+d.ph)*24;
    document.getElementById("d"+i).style.transform="translate("+(x-d.r).toFixed(1)+"px,"+(y-d.r).toFixed(1)+"px)";
  });
}

const tl=gsap.timeline({paused:true});
const wordsOf=(id)=>document.querySelectorAll("#"+id+" .wi");
// Words arrive like a camera settling: travel decays word by word, blur resolves.
function capIn(id,t){
  wordsOf(id).forEach((w,i)=>tl.fromTo(w,{y:70-i*6,opacity:0,filter:"blur(10px) brightness(1)"},
    {y:0,opacity:1,filter:"blur(0px) brightness(1)",duration:.6,ease:"power3.out",immediateRender:false},t+i*.075));
}
gsap.set(".wi",{opacity:0});
// Everything that makes an entrance starts hidden, or it shows before its cue.
gsap.set(["#placeA","#inv","#fol","#matched","#chip1","#chip2","#paid","#bigLogo","#cta","#site"],{opacity:0});
gsap.set(["#sA","#sB","#sC","#sD"],{filter:"blur(0px) brightness(1)"});
gsap.set(["#sB","#sC","#sD"],{opacity:0});

// Transitions. The outgoing shot accelerates out (.in), the incoming one
// decelerates in (.out), and they overlap so the fastest moment is the cut.
function zoomThrough(a,b,T){
  tl.to("#"+a,{scale:1.32,filter:"blur(16px) brightness(1)",duration:.5,ease:"power2.in"},T-.5);
  tl.to("#"+a,{opacity:0,duration:.16,ease:"none"},T-.08);
  tl.fromTo("#"+b,{opacity:0,scale:1.22,filter:"blur(16px) brightness(1)"},{opacity:1,scale:1,filter:"blur(0px) brightness(1)",duration:.7,ease:"power2.out",immediateRender:false},T-.08);
}
function pushUp(a,b,T){
  tl.to("#"+a,{y:-560,filter:"blur(14px) brightness(1)",duration:.5,ease:"power3.in"},T-.5);
  tl.to("#"+a,{opacity:0,duration:.16,ease:"none"},T-.08);
  tl.fromTo("#"+b,{opacity:0,y:640,filter:"blur(14px) brightness(1)"},{opacity:1,y:0,filter:"blur(0px) brightness(1)",duration:.7,ease:"power3.out",immediateRender:false},T-.08);
}
function lightLeak(a,b,T){
  tl.to("#leak-warm",{opacity:.38,duration:.35,ease:"power1.in"},T-.35);
  tl.fromTo("#leak-1",{opacity:0,x:0},{opacity:.9,x:420,duration:.7,ease:"sine.inOut",immediateRender:false},T-.4);
  tl.fromTo("#leak-2",{opacity:0,x:0},{opacity:.7,x:360,duration:.8,ease:"sine.inOut",immediateRender:false},T-.35);
  tl.to("#"+a,{filter:"blur(0px) brightness(1.6)",scale:1.05,duration:.35,ease:"power2.in"},T-.35);
  tl.to("#"+a,{opacity:0,duration:.3,ease:"none"},T-.1);
  tl.fromTo("#"+b,{opacity:0},{opacity:1,duration:.3,ease:"none",immediateRender:false},T-.1);
  tl.fromTo("#"+b,{filter:"blur(0px) brightness(1.6)",scale:1.06},{filter:"blur(0px) brightness(1)",scale:1,duration:.8,ease:"power2.out",immediateRender:false},T-.1);
  tl.to("#leak-warm",{opacity:0,duration:.6,ease:"power2.out"},T+.05);
  tl.to("#leak-1",{opacity:0,x:760,duration:.6,ease:"power1.out"},T+.1);
  tl.to("#leak-2",{opacity:0,x:620,duration:.7,ease:"power1.out"},T+.1);
}

// ── A · the season (0 – 6.2): opens on a focus pull ──
tl.fromTo("#sA",{filter:"blur(22px) brightness(1)",scale:1.08},{filter:"blur(0px) brightness(1)",scale:1,duration:1.5,ease:"power2.out"},cue(0,"open"));
tl.fromTo(CAM.sA,{push:1},{push:1.12,duration:6.4,ease:"sine.inOut"},0);
tl.fromTo("#lock",{opacity:0,y:-14},{opacity:1,y:0,duration:.7,ease:"power3.out"},.35);
tl.fromTo("#eyebrow",{opacity:0,scale:.8},{opacity:1,scale:1,duration:.45,ease:"back.out(2)",immediateRender:false},cue(.85,"pop",{i:0}));
tl.fromTo("#placeA",{opacity:0,x:-60},{opacity:1,x:0,duration:.55,ease:"power3.out",immediateRender:false},cue(1.6,"pop",{i:1}));
capIn("c1",.55);
tl.fromTo("#c1",{y:0},{y:-14,duration:5.6,ease:"none",immediateRender:false},.6);

// ── B · the mistake (6.2 – 11.35) ──
zoomThrough("sA","sB",cue(6.2,"whoosh"));
tl.fromTo(CAM.sB,{push:1},{push:1.1,duration:5.6,ease:"sine.inOut"},6.0);
capIn("c2",6.5);
tl.fromTo("#inv",{opacity:0,x:520,rotation:14,filter:"blur(12px) brightness(1)"},{opacity:1,x:0,rotation:-4,filter:"blur(0px) brightness(1)",duration:.75,ease:"power4.out",immediateRender:false},cue(7.0,"card"));
tl.to("#inv",{rotation:-2,y:-10,duration:3.4,ease:"sine.inOut"},7.75);
const strike=document.getElementById("inv-strike"),SL=Math.ceil(strike.getTotalLength())+4;
gsap.set(strike,{strokeDasharray:SL,strokeDashoffset:SL});
tl.to(strike,{strokeDashoffset:0,duration:.35,ease:"power1.inOut"},cue(8.0,"strike"));
tl.fromTo("#inv-stamp",{opacity:0,scale:2.4},{opacity:.95,scale:1,duration:.17,ease:"power4.in",immediateRender:false},cue(9.05,"stamp")-.17);
tl.fromTo(CAM.sB,{shake:0},{shake:1,duration:.04,ease:"none",immediateRender:false},9.05);
tl.to(CAM.sB,{shake:0,duration:.45,ease:"power2.out"},9.09);

// ── C · Operra (11.35 – 18.4): the turn from problem to answer ──
pushUp("sB","sC",cue(11.35,"whoosh"));
tl.fromTo(CAM.sC,{push:1},{push:1.08,duration:7,ease:"sine.inOut"},11.2);
capIn("c3",11.7);
tl.fromTo("#fol",{opacity:0,rotationX:38,y:180,filter:"blur(10px) brightness(1)"},{opacity:1,rotationX:0,y:0,filter:"blur(0px) brightness(1)",duration:.9,ease:"power3.out",immediateRender:false},cue(11.8,"card"));
gsap.set(["#fl2v .fb","#foltot .fb"],{yPercent:110});
tl.to("#fl2v .fa",{yPercent:-110,duration:.32,ease:"power2.inOut"},cue(12.9,"flip"));
tl.to("#fl2v .fb",{yPercent:0,duration:.32,ease:"power2.inOut"},12.9);
tl.to("#foltot .fa",{yPercent:-110,duration:.32,ease:"power2.inOut"},cue(13.25,"flip"));
tl.to("#foltot .fb",{yPercent:0,duration:.32,ease:"power2.inOut"},13.25);
tl.fromTo("#matched",{opacity:0,scale:.7,y:24},{opacity:1,scale:1,y:0,duration:.5,ease:"back.out(2)",immediateRender:false},cue(13.7,"match"));
tl.fromTo("#chip1",{opacity:0,x:-80},{opacity:1,x:0,duration:.5,ease:"power3.out",immediateRender:false},cue(14.4,"pop",{i:2}));
tl.fromTo("#chip2",{opacity:0,x:-80},{opacity:1,x:0,duration:.5,ease:"power3.out",immediateRender:false},cue(15.25,"pop",{i:3}));
tl.to("#fol",{y:-12,duration:4,ease:"sine.inOut"},12.8);

// ── D · paid (18.4 – 21.3), then the end card ──
lightLeak("sC","sD",cue(18.4,"whoosh"));
tl.fromTo(CAM.sD,{push:1},{push:1.1,duration:3.6,ease:"sine.inOut"},18.4);
capIn("c4",18.7);
tl.fromTo("#paid",{opacity:0,scale:.7,y:24},{opacity:1,scale:1,y:0,duration:.5,ease:"back.out(2)",immediateRender:false},cue(19.7,"match"));
// final scene: the only place an exit is allowed
tl.to("#sD",{scale:1.12,filter:"blur(18px) brightness(1)",opacity:0,duration:.75,ease:"power2.in"},21.15);
tl.to(["#lock","#eyebrow"],{opacity:0,duration:.4},21.2);
tl.to("#end",{opacity:1,duration:.5,ease:"none"},21.5);
tl.fromTo("#bigLogo",{opacity:0,scale:1.12,filter:"blur(14px) brightness(1)"},{opacity:1,scale:1,filter:"blur(0px) brightness(1)",duration:1.0,ease:"power3.out",immediateRender:false},cue(21.6,"logo"));
tl.fromTo("#sheen",{backgroundPosition:"-600px 0"},{backgroundPosition:"600px 0",duration:1.1,ease:"power2.inOut",immediateRender:false},22.2);
tl.fromTo("#cta",{opacity:0,xPercent:-50,y:40,scale:.9},{opacity:1,xPercent:-50,y:0,scale:1,duration:.55,ease:"back.out(1.7)",immediateRender:false},cue(22.5,"tap"));
tl.fromTo("#site",{opacity:0,y:12},{opacity:1,y:0,duration:.5,immediateRender:false},22.8);

tl.fromTo("#bar",{scaleX:0},{scaleX:1,duration:${DURATION},ease:"none"},0);
tl.set({},{},${DURATION});

window.REEL_DURATION=${DURATION};
window.REEL_CUES=CUES.sort((a,b)=>a.t-b.t);
window.setFrame=(t)=>{tl.seek(t,false);redraw(t);};
window.setFrame(0);
</script></body></html>`;

writeFileSync(new URL("./page.html", import.meta.url), html);
console.log("page.html written");
