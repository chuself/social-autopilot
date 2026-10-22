#!/usr/bin/env node
/**
 * PROTOTYPE — one reel built by hand, to find the level before it becomes a tool.
 * Source post: operra-2026-10-20-13-pain-point (Swahili, Arusha, seasonal agent
 * rates), with its exact published voiceover. Scene cuts sit in the voice's own
 * pauses (ffmpeg silencedetect): 5.89-6.54, 11.04-11.66, 18.16-18.64.
 *
 *   node studio/proto/build.mjs   -> studio/proto/page.html + cues.json
 */
import { writeFileSync } from "node:fs";
import { folio, billLine, ico, UI_CSS, P } from "../lib/ui.mjs";

const DURATION = 24;
const W = 1080, H = 1920;

// ── the motif: Operra's mark is a triangle of three arms around a figure ──
// Equilateral, apex up, centred on the window. Every scene is seen through it,
// and every cut is it opening past the camera.
const C = { x: 540, y: 790 };
const R = 545; // circumradius
const V = [-90, 30, 150].map((a) => ({ x: C.x + R * Math.cos((a * Math.PI) / 180), y: C.y + R * Math.sin((a * Math.PI) / 180) }));

const scene = (id, img, { offset = 0, window = true } = {}) => `
<div class="scene" id="${id}">
  <img class="bgimg" src="media/${img}-blur.jpg">
  <div class="shade"></div>
  ${window ? `<div class="win3" id="${id}-win"><img class="sharp" id="${id}-img" src="media/${img}.jpg" style="top:${offset}px"></div>` : ""}
  <svg class="arms" id="${id}-arms" viewBox="0 0 ${W} ${H}"></svg>
</div>`;

const words = (id, text, mark = []) =>
  `<div class="cap" id="${id}">${text
    .split(" ")
    .map((w) => `<span class="w"><span class="wi${mark.includes(w.replace(/[?.,]/g, "")) ? " mark" : ""}">${w}</span></span>`)
    .join(" ")}</div>`;

// The problem world is paper, the Operra world is the product — never mixed in
// one object (the same rule as the Operra HMS ad's frame.md).
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

const opsCard = folio("fol", {
  title: "FOLIO · SERENGETI TRAILS · HIGH SEASON",
  lines:
    billLine("fl1", "Agent contract rate", "USD 180") +
    billLine("fl2", "Charged at front desk", flipVal("fl2v", "USD 210", "USD 180"), "neg") +
    billLine("fl3", "Nights", "12"),
  totalLabel: "Due from agent",
  total: flipVal("foltot", "USD 2,520", "USD 2,160"),
});

const html = `<!doctype html><html><head><meta charset="utf-8">
<style>
@font-face{font-family:Inter;font-weight:400;src:url(../../brands/operra/assets/fonts/inter-latin-400-normal.woff2)}
@font-face{font-family:Inter;font-weight:500;src:url(../../brands/operra/assets/fonts/inter-latin-500-normal.woff2)}
@font-face{font-family:Inter;font-weight:600;src:url(../../brands/operra/assets/fonts/inter-latin-600-normal.woff2)}
@font-face{font-family:Inter;font-weight:700;src:url(../../brands/operra/assets/fonts/inter-latin-700-normal.woff2)}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${W}px;height:${H}px;overflow:hidden;background:${P.bg};font-family:Inter,sans-serif;color:${P.text}}
.scene{position:absolute;inset:0;overflow:hidden}
.bgimg{position:absolute;inset:0;width:${W}px;height:${H}px;object-fit:cover}
.shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(4,15,19,.55) 0%,rgba(4,15,19,.25) 30%,rgba(4,15,19,.78) 58%,rgba(4,15,19,.96) 78%)}
.win3{position:absolute;inset:0;clip-path:polygon(${V.map((v) => `${v.x}px ${v.y}px`).join(",")})}
.sharp{position:absolute;left:0;width:${W}px;height:${H}px;object-fit:cover;transform-origin:540px 790px}
.arms{position:absolute;inset:0;width:${W}px;height:${H}px;overflow:visible}
.arms .ray{fill:url(#sweep)}
.arms .node{fill:url(#sweep)}

#chrome{position:absolute;left:0;top:0;width:${W}px;height:200px}
#lock{position:absolute;left:80px;top:96px;height:44px}
.pill{position:absolute;right:80px;top:92px;font-size:24px;font-weight:600;letter-spacing:.12em;color:${P.glow};
      background:rgba(164,120,255,.14);border:1.5px solid rgba(164,120,255,.38);border-radius:100px;padding:12px 26px}
.place{position:absolute;font-size:24px;font-weight:600;letter-spacing:.14em;color:${P.text};
       background:rgba(4,15,19,.72);border:1px solid rgba(255,255,255,.16);border-radius:100px;padding:12px 24px;display:flex;align-items:center;gap:12px}
.place i{width:12px;height:12px;border-radius:50%;background:${P.teal};box-shadow:0 0 12px ${P.teal}}

.cap{position:absolute;left:80px;top:1190px;width:880px;font-size:80px;font-weight:600;line-height:1.1;letter-spacing:-.025em}
.w{display:inline-block;overflow:hidden;vertical-align:top;padding-bottom:.1em;margin-bottom:-.1em}
.wi{display:inline-block}
.wi.mark{color:#ff8a7a}
.wi.good{background:linear-gradient(90deg,${P.glow},${P.teal});-webkit-background-clip:text;color:transparent}
.rule{position:absolute;left:80px;top:1158px;height:6px;width:120px;border-radius:6px;background:linear-gradient(90deg,#B23BFF,#3E86FF,#1FA8F0);transform-origin:0 50%}

.paper{position:absolute;left:520px;top:700px;width:470px;padding:30px 34px 34px;background:#ece5d3;color:#26303a;border-radius:10px;
       box-shadow:0 40px 90px -30px rgba(0,0,0,.9);transform:rotate(-4deg)}
.phead{display:flex;justify-content:space-between;font-size:20px;letter-spacing:.14em;color:#1d3f8c;font-weight:700;border-bottom:2px solid #1d3f8c;padding-bottom:12px;margin-bottom:10px}
.pline{display:flex;justify-content:space-between;font-size:24px;padding:10px 0;border-bottom:1px dashed #b9b09a}
.pline.big{font-size:30px;font-weight:700;border:0;padding-top:16px}
.rate{position:relative;display:inline-block}
.pen{position:absolute;left:-12px;right:-12px;top:0;width:calc(100% + 24px);height:100%;overflow:visible}
.pen path{fill:none;stroke:#d33a2c;stroke-width:6;stroke-linecap:round}
.stamp{position:absolute;left:30px;top:66px;font-size:44px;font-weight:700;letter-spacing:.08em;color:#c8312b;
       border:6px double #c8312b;border-radius:10px;padding:6px 18px;transform:rotate(-14deg);opacity:0;mix-blend-mode:multiply}

${UI_CSS}
#fol{left:110px;top:520px;width:860px}
.bline.neg .flip .fa{color:${P.neg}}
.flip{position:relative;display:inline-block;overflow:hidden;height:1.25em;vertical-align:bottom;min-width:5.6em;text-align:right}
.flip span{position:absolute;right:0;top:0;white-space:nowrap}
.flip .fb{color:${P.teal}}
.chip{position:absolute;display:flex;align-items:center;gap:12px;font-size:28px;font-weight:600;border-radius:100px;padding:16px 28px;white-space:nowrap}
.chip.ok{color:${P.teal};background:rgba(54,210,186,.12);border:1.5px solid rgba(54,210,186,.5)}
.chip.soft{color:${P.text};background:rgba(14,28,38,.92);border:1px solid rgba(255,255,255,.14)}
.chip .ico{flex:none}

#end{position:absolute;inset:0;opacity:0;background:radial-gradient(60% 40% at 50% 42%,rgba(123,84,255,.22),rgba(4,15,19,0) 70%);display:flex;flex-direction:column;align-items:center}
#end .mark{position:absolute;left:390px;top:640px;width:300px;height:300px}
#end .word{position:absolute;top:930px;width:100%;text-align:center;font-size:64px;font-weight:600;letter-spacing:.32em;padding-left:.32em}
#end .cta{position:absolute;top:1100px;left:50%;transform:translateX(-50%);font-size:40px;font-weight:600;color:#0b0620;
          background:linear-gradient(135deg,${P.primary},${P.glow} 50%,${P.teal});border-radius:100px;padding:26px 56px;white-space:nowrap}
#end .site{position:absolute;top:1250px;width:100%;text-align:center;font-size:32px;color:${P.muted};letter-spacing:.04em}
#bar{position:absolute;left:0;bottom:0;height:8px;width:${W}px;background:linear-gradient(90deg,#E01FEE,#7B54FF,#1FA8F0);transform-origin:0 50%}
</style></head><body>
<svg width="0" height="0" style="position:absolute"><defs>
  <linearGradient id="sweep" gradientUnits="userSpaceOnUse" x1="${V[2].x}" y1="0" x2="${V[1].x}" y2="0">
    <stop offset="0" stop-color="#E01FEE"/><stop offset=".3" stop-color="#B23BFF"/><stop offset=".55" stop-color="#7B54FF"/>
    <stop offset=".8" stop-color="#3E86FF"/><stop offset="1" stop-color="#1FA8F0"/></linearGradient>
  <linearGradient id="sweepV" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#E01FEE"/><stop offset=".3" stop-color="#B23BFF"/><stop offset=".55" stop-color="#7B54FF"/>
    <stop offset=".8" stop-color="#3E86FF"/><stop offset="1" stop-color="#1FA8F0"/></linearGradient>
</defs></svg>

${scene("sA", "s1-season", { offset: -420 })}
${scene("sB", "s2-mistake", { offset: -330 })}
${scene("sC", "s3-desk", { window: false })}
${scene("sD", "s4-dusk", { offset: -330 })}

<div class="place" id="placeA" style="left:80px;top:1070px"><i></i>ARUSHA · MSIMU WA SAFARI</div>
${invoice}
${opsCard}
<div class="chip ok" id="matched" style="left:110px;top:885px">${ico("check", { size: 30, stroke: 2.6 })}Matched to contract</div>
<div class="chip soft" id="chip1" style="left:110px;top:1500px">${ico("check", { size: 26, stroke: 2.6 })}Kiswahili na Kiingereza</div>
<div class="chip soft" id="chip2" style="left:110px;top:1600px">${ico("wifi-off", { size: 26 })}Inafanya kazi mtandao ukiwa mdogo</div>
<div class="chip ok" id="paid" style="left:80px;top:1070px">${ico("check", { size: 30, stroke: 2.6 })}Malipo yamepokelewa · USD 2,160</div>

<div class="rule" id="rule"></div>
${words("c1", "Ankara inakataliwa tena msimu huu?")}
${words("c2", "Bei ya wakala imekosewa mapokezi?", ["imekosewa"])}
${words("c3", "Operra inadhibiti viwango na mapokezi.")}
${words("c4", "Malipo ya msimu yanaingia bila usumbufu.")}

<div id="end">
  <svg class="mark" viewBox="0 0 240 240"><defs><linearGradient id="ms" gradientUnits="userSpaceOnUse" x1="26" y1="120" x2="214" y2="120">
    <stop offset="0" stop-color="#E01FEE"/><stop offset=".3" stop-color="#B23BFF"/><stop offset=".55" stop-color="#7B54FF"/><stop offset=".8" stop-color="#3E86FF"/><stop offset="1" stop-color="#1FA8F0"/></linearGradient></defs>
    <g fill="url(#ms)">
    <circle cx="120" cy="24" r="9.5"/><path d="M111.77 28.75 L177.07 125.45 A1.3 1.3 0 0 1 179.32 124.15 L128.23 19.25 Z"/><path d="M111.77 19.25 L60.68 124.15 A1.3 1.3 0 0 1 62.93 125.45 L128.23 28.75 Z"/>
    <circle cx="203.14" cy="168" r="9.5"/><path d="M203.14 158.5 L86.74 166.7 A1.3 1.3 0 0 1 86.74 169.3 L203.14 177.5 Z"/><path d="M211.37 163.25 L146.07 66.55 A1.3 1.3 0 0 1 143.82 67.85 L194.91 172.75 Z"/>
    <circle cx="36.86" cy="168" r="9.5"/><path d="M45.09 172.75 L96.18 67.85 A1.3 1.3 0 0 1 93.93 66.55 L28.63 163.25 Z"/><path d="M36.86 177.5 L153.26 169.3 A1.3 1.3 0 0 1 153.26 166.7 L36.86 158.5 Z"/>
    <g id="fig"><circle cx="120" cy="112" r="13.5"/><rect x="117.4" y="121" width="5.2" height="44" rx="2.6"/><circle cx="120" cy="166" r="6.5"/></g></g></svg>
  <div class="word">OPERRA</div>
  <div class="cta" id="cta">Ona inavyofanya kazi</div>
  <div class="site">operra.tech</div>
</div>

<div id="chrome"><img id="lock" src="../../brands/operra/assets/logo-dark.png"><div class="pill" id="eyebrow">UPANGAJI BEI</div></div>
<div id="bar"></div>

<script src="../assets/gsap.min.js"></script>
<script>
const W=${W},H=${H},C=${JSON.stringify(C)},V=${JSON.stringify(V)};
const NS="http://www.w3.org/2000/svg";
const CUES=[];
// A sound exists only where an animation is placed: cue() returns the time it
// is given, so the tween and its sound share one number.
const cue=(t,type,o={})=>{CUES.push({t:+t.toFixed(3),type,...o});return t;};

// Arm geometry, as in the mark: each node sends two tapered rays along its two
// edges, reaching 72% of the way, so every edge carries two overlapping rays.
const RAYS=[];V.forEach((n,i)=>[V[(i+1)%3],V[(i+2)%3]].forEach(t=>RAYS.push({n,t})));
function buildArms(svg){
  svg.innerHTML="";
  const rays=RAYS.map(()=>{const p=document.createElementNS(NS,"polygon");p.setAttribute("class","ray");svg.appendChild(p);return p;});
  const nodes=V.map(v=>{const c=document.createElementNS(NS,"circle");c.setAttribute("class","node");c.setAttribute("cx",v.x);c.setAttribute("cy",v.y);svg.appendChild(c);return c;});
  return {rays,nodes};
}
const ARMS={};["sA","sB","sC","sD"].forEach(id=>ARMS[id]={...buildArms(document.getElementById(id+"-arms")),draw:0,nodes0:0,scale:1,alpha:1});

const S={irisB:0,irisC:0,irisD:0,openA:0};
function tri(s,cx=C.x,cy=C.y){return V.map(v=>(cx+(v.x-C.x)*s).toFixed(1)+"px "+(cy+(v.y-C.y)*s).toFixed(1)+"px").join(",");}
function drawArms(id){
  const a=ARMS[id], k=a.scale;
  const P=(v)=>({x:C.x+(v.x-C.x)*k,y:C.y+(v.y-C.y)*k});
  RAYS.forEach((r,i)=>{
    const n=P(r.n),t=P(r.t),reach=0.72*Math.max(0,Math.min(1,a.draw*1.15-(i%2)*0.15));
    const tip={x:n.x+(t.x-n.x)*reach,y:n.y+(t.y-n.y)*reach};
    const dx=t.x-n.x,dy=t.y-n.y,L=Math.hypot(dx,dy)||1,nx=-dy/L,ny=dx/L,w=13*k;
    a.rays[i].setAttribute("points",reach<=0?"":[n.x+nx*w,n.y+ny*w,tip.x,tip.y,n.x-nx*w,n.y-ny*w].join(","));
  });
  a.nodes.forEach((c,i)=>{const n=P(V[i]);c.setAttribute("cx",n.x);c.setAttribute("cy",n.y);c.setAttribute("r",Math.max(0,22*k*Math.min(1,Math.max(0,a.nodes0*3-i))));});
  document.getElementById(id+"-arms").style.opacity=a.alpha;
}
function redraw(){
  document.getElementById("sA-win").style.clipPath="polygon("+tri(S.openA)+")";
  document.getElementById("sB").style.clipPath="polygon("+tri(S.irisB)+")";
  document.getElementById("sC").style.clipPath="polygon("+tri(S.irisC)+")";
  document.getElementById("sD").style.clipPath="polygon("+tri(S.irisD)+")";
  Object.keys(ARMS).forEach(drawArms);
}

const tl=gsap.timeline({paused:true});
const words=(id)=>document.querySelectorAll("#"+id+" .wi");
function capIn(id,t){tl.fromTo(words(id),{yPercent:115},{yPercent:0,duration:.55,ease:"power3.out",stagger:.07,immediateRender:false},t);}
function capOut(id,t){tl.to(words(id),{yPercent:-115,duration:.32,ease:"power2.in",stagger:.025},t);}
gsap.set(".wi",{yPercent:115});
gsap.set(["#placeA","#inv","#fol","#matched","#chip1","#chip2","#paid"],{opacity:0});
gsap.set("#sB,#sC,#sD",{clipPath:"polygon(0 0,0 0,0 0)"});

// ── A · the season (0 – 6.2) ──
tl.to(S,{openA:1,duration:1.0,ease:"power3.out"},0);
cue(0.62,"whoosh");
tl.fromTo("#sA-img",{scale:1.16},{scale:1.0,duration:6.4,ease:"none"},0);
tl.fromTo("#sA .bgimg",{opacity:0},{opacity:1,duration:.8},0);
tl.fromTo(ARMS.sA,{draw:0},{draw:1,duration:1.1,ease:"power2.inOut",immediateRender:false},cue(0.35,"draw",{dur:1.1}));
tl.fromTo(ARMS.sA,{nodes0:0},{nodes0:1,duration:.5,ease:"none",immediateRender:false},1.1);
[1.1,1.27,1.43].forEach((t,i)=>cue(t,"node",{i}));
tl.fromTo("#lock",{opacity:0,y:-10},{opacity:1,y:0,duration:.6},0.3);
tl.fromTo("#eyebrow",{opacity:0,scale:.8},{opacity:1,scale:1,duration:.4,ease:"back.out(2)",immediateRender:false},cue(0.9,"pop",{i:0}));
tl.fromTo("#placeA",{opacity:0,x:-30},{opacity:1,x:0,duration:.45,ease:"power3.out",immediateRender:false},cue(1.7,"pop",{i:1}));
tl.fromTo("#rule",{scaleX:0},{scaleX:1,duration:.6,ease:"power3.out"},0.4);
capIn("c1",0.45);
tl.to("#placeA",{opacity:0,duration:.3},5.6);
capOut("c1",5.7);

// ── B · the mistake (6.2 – 11.35) ──
tl.to(S,{irisB:5.2,duration:.75,ease:"power2.in"},cue(6.2,"whoosh")-0.55);
tl.fromTo("#sB-img",{scale:1.12},{scale:1.0,duration:5.6,ease:"none"},5.9);
tl.set(ARMS.sB,{draw:1,nodes0:1},5.6);
tl.fromTo("#inv",{opacity:0,x:260,rotation:6},{opacity:1,x:0,rotation:-4,duration:.6,ease:"power3.out",immediateRender:false},cue(6.95,"card"));
capIn("c2",6.6);
const strike=document.getElementById("inv-strike"),SL=Math.ceil(strike.getTotalLength())+4;
gsap.set(strike,{strokeDasharray:SL,strokeDashoffset:SL});
tl.to(strike,{strokeDashoffset:0,duration:.35,ease:"power1.inOut"},cue(8.0,"strike"));
tl.fromTo("#inv-stamp",{opacity:0,scale:2.2},{opacity:.92,scale:1,duration:.16,ease:"power4.in",immediateRender:false},cue(9.05,"stamp")-0.16);
tl.fromTo("#inv",{x:0},{x:-8,duration:.05,yoyo:true,repeat:3,ease:"none",immediateRender:false},9.05);
tl.to("#inv",{opacity:0,x:-120,duration:.35,ease:"power2.in"},10.95);
capOut("c2",11.0);

// ── C · Operra (11.35 – 18.4) ──
tl.to(S,{irisC:5.2,duration:.75,ease:"power2.in"},cue(11.35,"whoosh")-0.55);
tl.set(ARMS.sC,{draw:1,nodes0:1,alpha:.3},10.8);
tl.fromTo("#fol",{opacity:0,y:120},{opacity:1,y:0,duration:.6,ease:"power3.out",immediateRender:false},cue(11.75,"card"));
gsap.set(["#fl2v .fb","#foltot .fb"],{yPercent:110});
capIn("c3",11.7);
tl.to("#fl2v .fa",{yPercent:-110,duration:.3,ease:"power2.inOut"},cue(12.9,"flip"));
tl.to("#fl2v .fb",{yPercent:0,duration:.3,ease:"power2.inOut"},12.9);
tl.to("#foltot .fa",{yPercent:-110,duration:.3,ease:"power2.inOut"},cue(13.25,"flip"));
tl.to("#foltot .fb",{yPercent:0,duration:.3,ease:"power2.inOut"},13.25);
tl.fromTo("#matched",{opacity:0,scale:.85,y:10},{opacity:1,scale:1,y:0,duration:.4,ease:"back.out(1.8)",immediateRender:false},cue(13.7,"match"));
tl.fromTo("#chip1",{opacity:0,x:-40},{opacity:1,x:0,duration:.4,ease:"power3.out",immediateRender:false},cue(14.4,"pop",{i:2}));
tl.fromTo("#chip2",{opacity:0,x:-40},{opacity:1,x:0,duration:.4,ease:"power3.out",immediateRender:false},cue(15.25,"pop",{i:3}));
tl.to(["#fol","#matched","#chip1","#chip2"],{opacity:0,y:-30,duration:.35,ease:"power2.in",stagger:.04},17.85);
capOut("c3",17.9);

// ── D · paid, then the mark (18.4 – 24) ──
tl.to(S,{irisD:5.2,duration:.75,ease:"power2.in"},cue(18.4,"whoosh")-0.55);
tl.set(ARMS.sD,{draw:1,nodes0:1},17.8);
tl.fromTo("#sD-img",{scale:1.1},{scale:1.0,duration:4,ease:"none"},18.1);
capIn("c4",18.7);
tl.fromTo("#paid",{opacity:0,scale:.85,y:10},{opacity:1,scale:1,y:0,duration:.4,ease:"back.out(1.8)",immediateRender:false},cue(19.7,"match"));
// end card: the window's arms close in on the centre and become the mark
tl.to(["#paid"],{opacity:0,duration:.3},21.0);
capOut("c4",21.0);
gsap.set([],{});tl.set("#sA,#sB,#sC",{visibility:"hidden"},19.5);
tl.to(ARMS.sD,{scale:.22,duration:.9,ease:"power3.inOut"},21.25);
tl.to("#sD .win3,#sD .bgimg,#sD .shade",{opacity:0,duration:.6},21.3);
tl.to(["#rule","#eyebrow","#lock"],{opacity:0,duration:.4},21.2);
cue(21.7,"logo");
tl.to("#end",{opacity:1,duration:.01},22.05);
tl.to(ARMS.sD,{alpha:0,duration:.25},22.05);
tl.fromTo("#end .mark",{scale:1.05},{scale:1,duration:.8,ease:"power2.out",immediateRender:false},22.05);
tl.fromTo("#end .word",{opacity:0,letterSpacing:".6em"},{opacity:1,letterSpacing:".32em",duration:.8,ease:"power3.out",immediateRender:false},22.15);
tl.fromTo("#cta",{opacity:0,y:30},{opacity:1,y:0,duration:.45,ease:"back.out(1.6)",immediateRender:false},cue(22.55,"tap"));
tl.fromTo("#end .site",{opacity:0},{opacity:1,duration:.5,immediateRender:false},22.8);

tl.fromTo("#bar",{scaleX:0},{scaleX:1,duration:${DURATION},ease:"none"},0);
tl.set({}, {}, ${DURATION});

window.REEL_DURATION=${DURATION};
window.REEL_CUES=CUES.sort((a,b)=>a.t-b.t);
window.setFrame=(t)=>{tl.seek(t,false);redraw();};
window.setFrame(0);
</script></body></html>`;

writeFileSync(new URL("./page.html", import.meta.url), html);
console.log("page.html written");
