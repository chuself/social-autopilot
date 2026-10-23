/**
 * The ink & wash engine: any studio brief -> an ink reel page.
 *
 * Same brief as the photo studio (studio/compose.mjs), with style: "ink". The
 * pictures are drawn in code (studio/ink/art.mjs), so an ink reel needs no
 * MOSS images. Numbers come from the same ledger and every on-screen figure
 * is computed; the logo is the brand's own light-ground file.
 *
 * Variety is designed in, not left to the writer: each scene type has several
 * drawn variants, a time-of-day palette, a camera move and a cast, and the
 * choice is made from a hash of the post id and the scene. Two reels about
 * the same thing still look different; one reel re-rendered looks the same.
 *
 * Nothing is ever still between cuts (owner's feedback on v1): every scene
 * has depth layers under a moving camera and a cast moved every frame by
 * life(t), and the ink "boils" like hand-drawn animation.
 */
import { makeLedger, tokens, orderLines, hash } from "../numbers.mjs";
import { ROLE, WEIGHT } from "../scenes.mjs";
import { planCuts } from "../timing.mjs";
import { figure, glass, CITIES, cityKey } from "./art.mjs";

const W = 1080, H = 1920;
const INK = "#1E2350", INK_SOFT = "#5A5F86", RED = "#B8325A", TEAL_INK = "#138476";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const pick = (seed, list) => list[hash(seed) % list.length];

// Time of day sets the sky and the warmth of the washes.
const PALETTES = {
  morning: { sky: "wash-sky", warm: "wash-lilac", glow: "wash-teal" },
  golden: { sky: "wash-rose", warm: "wash-magenta", glow: "wash-lilac" },
  blue: { sky: "wash-blue", warm: "wash-violet", glow: "wash-sky" },
};
const HAIR = ["short", "afro", "braids", "wrap"];
const WEAR = ["kitenge", "collar", "plain"];
const person = (seed, o) => figure({ hair: pick(seed + "h", HAIR), wear: pick(seed + "w", WEAR), ...o });

// ── shared drawings ─────────────────────────────────────────────────────────
const birdActors = (S, n = 3) => Array.from({ length: n }, (_, i) => `<path class="actor" id="${S}-b${i}" d="" stroke-width="1.8"/>`).join("");
const cloudActors = (S) => `<path class="actor" id="${S}-c0" d="M0 0 c20 -18 50 -18 62 -4 c14 -16 48 -12 54 6 c16 -2 24 10 16 18 l-132 0 c-12 -6 -10 -18 0 -20" stroke-width="1.8"/><path class="actor" id="${S}-c1" d="M0 0 c20 -18 50 -18 62 -4 c14 -16 48 -12 54 6 c16 -2 24 10 16 18 l-132 0 c-12 -6 -10 -18 0 -20" stroke-width="2.2"/>`;
const skyLife = `
  [[880,250,58,0],[960,215,66,1.7],[820,300,50,3.1]].forEach(([x0,y0,v,ph],i)=>{const e=g(S+"-b"+i);if(!e)return;
    const x=x0-v*(t-a),y=y0+7*Math.sin(t*2.2+ph),f=Math.sin(t*13+ph*2);
    e.setAttribute("d","M"+x.toFixed(1)+" "+y.toFixed(1)+" q8 "+(-11*f).toFixed(1)+" 16 0 q8 "+(-11*f).toFixed(1)+" 16 0");e.style.opacity=clamp((t-a-1.4)*2)*clamp((x+40)/100);});
  setT(S+"-c0","translate("+(140+14*(t-a)).toFixed(1)+" 170)");setT(S+"-c1","translate("+(760+9*(t-a)).toFixed(1)+" 120) scale(.8)");`;
const sparks = (S, pts) => pts.map(([x, y, s], i) => `<path class="actor spark" id="${S}-k${i}" d="M${x - s} ${y} L${x + s} ${y} M${x} ${y - s} L${x} ${y + s}" stroke-width="2"/>`).join("");
const sparkLife = (n) => `for(let i=0;i<${n};i++){const e=g(S+"-k"+i);if(e){e.style.transform="scale("+(.6+.5*Math.abs(Math.sin(t*2.1+i*1.3))).toFixed(3)+") rotate("+((t*40+i*30)%360).toFixed(0)+"deg)";e.style.opacity=clamp((t-a-1)*2);}}`;
const phoneD = "M330 70 h420 a46 46 0 0 1 46 46 v800 a46 46 0 0 1 -46 46 h-420 a46 46 0 0 1 -46 -46 v-800 a46 46 0 0 1 46 -46 Z";
const tabletD = "M150 160 h780 a30 30 0 0 1 30 30 v600 a30 30 0 0 1 -30 30 h-780 a30 30 0 0 1 -30 -30 v-600 a30 30 0 0 1 30 -30 Z";

// ── scene templates ─────────────────────────────────────────────────────────
// Each returns { bg, mid, fg (layers: lines, washes, actors), over (HTML in
// the mid layer), js (timeline), life (per-frame), shows (computed numbers) }.
const SCENE = {
  place(S, s, c) {
    const city = CITIES[c.city], near = city.near(S), pal = PALETTES[c.tod];
    return {
      bg: { lines: city.far.lines, washes: [[pal.sky, -80, 90, 1240, 640, 0.8], ...city.far.washes], actors: cloudActors(S) + birdActors(S) },
      mid: near.mid, fg: near.fg,
      // pinned to the frame, not the moving art, so the camera never carries it out of the safe area
      fixed: s.tag ? `<div class="place" id="${S}-tag" style="top:1112px"><i></i>${esc(s.tag)}</div>` : "",
      js: `draw(S,a+.15,2.3);washes(S,a+.45,.28);words(S,a+.55);${s.tag ? `tl.fromTo("#"+S+"-tag",{opacity:0,x:-30},{opacity:1,x:0,duration:.5,immediateRender:false},cue(a+1.9,"pop",{i:1}));tl.to("#"+S+"-tag",{opacity:0,duration:.3},b-.6);` : ""}`,
      life: skyLife + near.life,
      hide: s.tag ? [`#${S}-tag`] : [],
    };
  },

  "problem-doc"(S, s, c) {
    const v = pick(c.seed + "doc", ["night", "counter"]);
    const rows = (s.doc?.rows ?? []).map(([l, val], i) =>
      i === (s.doc.wrongRow ?? 2)
        ? `<div class="irow big"><span>${esc(l)}</span><span class="rate">${esc(c.fill(val))}<svg class="pen" viewBox="0 0 160 40" preserveAspectRatio="none"><path id="${S}-strike" d="M2 26 C 50 14, 112 28, 158 12"/></svg></span></div>`
        : `<div class="irow"><span>${esc(l)}</span><span>${esc(c.fill(val))}</span></div>`).join("");
    const number = `A-${1000 + (hash(c.seed + S) % 9000)}`;
    const bg = v === "night"
      ? { lines: [{ d: "M700 300 L840 300 L885 410 L655 410 Z", w: 2.8 }, { d: "M735 410 Q770 444 805 410 M770 300 L800 250 L905 330 L905 840 M845 846 L965 846", w: 2.4 }], washes: [["wash-lilac", 540, 240, 460, 440, 0.75]], actors: "" }
      : { lines: [{ d: "M60 330 L1020 330 M60 330 L60 280 M1020 330 L1020 280", w: 2.4 }, { d: "M120 300 h40 M200 300 h40 M280 300 h40 M120 250 l20 30 M200 250 l20 30 M280 250 l20 30", w: 1.6 }], washes: [["wash-blue", 60, 180, 600, 300, 0.4]], actors: "" };
    const midLines = [{ d: "M0 880 L1080 840", w: 3 }, { d: "M0 932 C300 912 700 906 1080 882 M0 976 C300 962 640 952 1080 926", w: 1.4 }];
    midLines.push(v === "night"
      ? { d: "M120 560 L120 660 C120 692 220 692 220 660 L220 560 M120 560 C120 545 220 545 220 560 C220 575 120 575 120 560 M220 590 C256 590 256 642 220 642", w: 2.6 }
      : { d: "M150 760 C150 700 250 700 250 760 Z M140 768 L260 768 M200 700 L200 688 M196 684 a4 4 0 1 0 8 0 a4 4 0 1 0 -8 0", w: 2.6 });
    return {
      bg,
      mid: { lines: midLines, washes: [["wash-blue", 230, 280, 640, 640, 0.45], [c.pal.glow, 70, 500, 220, 230, 0.6]],
        actors: v === "night" ? `<path class="actor" id="${S}-s0" d="" stroke-width="1.6"/><path class="actor" id="${S}-s1" d="" stroke-width="1.6"/>` : "" },
      fg: { lines: [], washes: [], actors: `<g id="${S}-pen"><path d="M820 760 L1000 690 L1008 702 L828 772 Z" stroke-width="2"/><path d="M820 760 L804 772 L828 772" stroke-width="2"/></g>` },
      over: `<div class="invw" id="${S}-invw"><div class="inv paper" id="${S}-inv"><svg class="invb" viewBox="0 0 540 560" preserveAspectRatio="none"><path id="${S}-invb" d="M8 10 L532 4 L536 552 L4 556 Z"/></svg>
        <div class="ihead"><span>${esc(s.doc?.title ?? "")}</span><span>№ ${number}</span></div>${rows}${s.stamp ? `<div class="stamp" id="${S}-stamp">${esc(s.stamp)}</div>` : ""}</div></div>`,
      js: `const STRIKE=a+Math.max(1.7,(b-a)*.38),STAMP=a+Math.max(2.6,(b-a)*.56);
        draw(S,a+.15,1.4);washes(S,a+.3,.35);words(S,a+.25);
        tl.fromTo("#"+S+"-inv",{opacity:0,y:40,rotation:-8},{opacity:1,y:0,rotation:-3,duration:.7,ease:"power3.out",immediateRender:false},cue(a+.7,"card"));
        drawPath("#"+S+"-invb",a+.75,.9);drawPath("#"+S+"-strike",STRIKE,.35,"strike");
        ${s.stamp ? `tl.fromTo("#"+S+"-stamp",{opacity:0,scale:2.2},{opacity:.92,scale:1,duration:.17,ease:"power4.in",immediateRender:false},cue(STAMP,"stamp")-.17);tl.fromTo("#"+S+"-art",{x:0},{x:-7,duration:.05,yoyo:true,repeat:3,ease:"none",immediateRender:false},STAMP);` : ""}
        T_[S]={strike:STRIKE};`,
      life: `{const st=T_[S].strike,rest=[0,0],p1=[-220,-262],p2=[-62,-280];let p=rest;
        if(t>st-.55&&t<st){const u=ease((t-st+.55)/.55);p=[p1[0]*u,p1[1]*u];}else if(t>=st&&t<st+.35){const u=(t-st)/.35;p=[p1[0]+(p2[0]-p1[0])*u,p1[1]+(p2[1]-p1[1])*u];}
        else if(t>=st+.35&&t<st+1){const u=ease((t-st-.35)/.65);p=[p2[0]*(1-u),p2[1]*(1-u)];}
        setT(S+"-pen","translate("+p[0].toFixed(1)+" "+p[1].toFixed(1)+")");const e=g(S+"-pen");if(e)e.style.opacity=clamp((t-a-1.2)*2);}
        css(S+"-invw","rotate("+(.7*Math.sin(t*1.1)).toFixed(3)+"deg) translateY("+(4*Math.sin(t*.9)).toFixed(1)+"px)");
        for(const k of [0,1]){const e=g(S+"-s"+k);if(!e)continue;let d="";const x0=150+k*35;for(let j=0;j<=12;j++){const y=528-j*6,x=x0+7*Math.sin(j*.55-t*3.2+k*2);d+=(j?" L":"M")+x.toFixed(1)+" "+y.toFixed(1);}e.setAttribute("d",d);e.style.opacity=(clamp((t-a-1)*1.2)*(.55+.25*Math.sin(t*2+k))).toFixed(3);}`,
      hide: [`#${S}-inv`, ...(s.stamp ? [`#${S}-stamp`] : [])],
      shows: [number],
    };
  },

  "folio-fix"(S, s, c) {
    const v = pick(c.seed + "fol", ["phone", "tablet"]);
    const T = c.T, flip = (id, x, y) => `<span class="flip" id="${id}"><span class="fa">${esc(x)}</span><span class="fb">${esc(y)}</span></span>`;
    const box = v === "phone" ? "left:316px;top:180px;width:448px" : "left:200px;top:220px;width:680px";
    return {
      bg: { lines: v === "tablet" ? [{ d: "M0 880 L1080 860", w: 2.6 }] : [], washes: [["wash-violet-b", 650, 10, 400, 400, 0.55], ["wash-blue", 30, 620, 380, 380, 0.5]], actors: "" },
      mid: { lines: [{ d: v === "phone" ? phoneD : tabletD, w: 3.2 }, { d: v === "phone" ? "M500 102 L580 102 M312 140 L768 140 M312 880 L768 880" : "M520 186 a8 8 0 1 0 16 0 a8 8 0 1 0 -16 0", w: 1.6 }],
        washes: [["wash-teal", 200, 110, 680, 800, 0.5]], actors: "" },
      fg: { lines: [], washes: [], actors: sparks(S, [[216, 250, 16], [876, 430, 16], [892, 760, 12], [180, 700, 10]]) + `<circle class="ring" id="${S}-r0" cx="540" cy="${v === "phone" ? 660 : 640}" r="40"/><circle class="ring" id="${S}-r1" cx="540" cy="${v === "phone" ? 660 : 640}" r="40"/>` },
      over: `<div class="fol fcard" id="${S}-fol" style="${box}"><div class="fhead">FOLIO · ROOM ${esc(T["{room}"])}</div>
        <div class="frow"><span>Room rate / night</span><span>${esc(T["{rightRate}"])}</span></div>
        <div class="frow"><span>Charged / night</span>${flip(S + "-f1", T["{wrongRate}"], T["{rightRate}"])}</div>
        <div class="frow tot"><span>Due<i>${flip(S + "-f2", T["{wrongSum}"], T["{rightSum}"])}</i></span>${flip(S + "-f3", T["{wrongTotal}"], T["{rightTotal}"])}</div>
        <svg class="tick" viewBox="0 0 120 120" style="left:calc(50% - 60px)"><path id="${S}-tick" d="M60 60 m-40 0 a40 40 0 1 0 80 0 a40 40 0 1 0 -80 0 M40 62 L55 77 L82 46"/></svg>
        <div class="ok" id="${S}-ok">${esc(c.fill(s.okChip ?? "Correct rate applied"))}</div></div>`,
      js: `const TICK=a+Math.max(2.6,(b-a)*.42);
        draw(S,a+.15,1.0);washes(S,a+.25,.35);words(S,a+.25);
        tl.fromTo("#"+S+"-fol .fhead, #"+S+"-fol .frow",{opacity:0,y:16},{opacity:1,y:0,duration:.45,stagger:.15,ease:"power3.out",immediateRender:false},cue(a+.9,"card"));
        gsap.set(["#"+S+"-f1 .fb","#"+S+"-f2 .fb","#"+S+"-f3 .fb"],{yPercent:110});
        [[S+"-f1",TICK-.9,"flip"],[S+"-f2",TICK-.55,null],[S+"-f3",TICK-.55,"flip"]].forEach(([id,t0,cc])=>{tl.to("#"+id+" .fa",{yPercent:-110,duration:.32,ease:"power2.inOut"},cc?cue(t0,cc):t0);tl.to("#"+id+" .fb",{yPercent:0,duration:.32,ease:"power2.inOut"},t0);});
        drawPath("#"+S+"-tick",TICK,.7,"match");tl.fromTo("#"+S+"-ok",{opacity:0,y:10},{opacity:1,y:0,duration:.4,immediateRender:false},TICK+.4);
        T_[S]={tick:TICK};`,
      life: sparkLife(4) + `css(S+"-mid",g(S+"-mid").style.transform+" translateY("+(16*Math.sin(t*1.35)).toFixed(1)+"px) rotate("+(1.2*Math.sin(t*.8)).toFixed(2)+"deg)");
        for(const k of [0,1]){const e=g(S+"-r"+k);if(!e)continue;const s=t-T_[S].tick-.5-k*.7;if(s<0){e.style.opacity=0;continue;}const f=(s/1.4)%1;e.setAttribute("r",(44+90*f).toFixed(1));e.style.opacity=(.65*(1-f)).toFixed(3);}`,
      hide: [`#${S}-fol .fhead`, `#${S}-fol .frow`, `#${S}-ok`],
    };
  },

  "pos-charge"(S, s, c) {
    const v = pick(c.seed + "pos", ["bar", "table"]);
    const lines = orderLines(c.ledger);
    const bg = v === "bar"
      ? { lines: [{ d: "M40 210 L1040 210 M40 330 L1040 330", w: 2.2 }, { d: [100, 190, 280, 760, 850, 940].map((x) => `M${x} 205 C${x - 14} 160 ${x + 14} 160 ${x} 205 M${x} 160 L${x} 140`).join(" ") + " " + [130, 230, 800, 900].map((x) => `M${x} 325 C${x - 12} 290 ${x + 12} 290 ${x} 325`).join(" "), w: 1.6 }],
        washes: [["wash-lilac", 40, 120, 1000, 260, 0.5]], actors: `<g id="${S}-lamp0"><path d="M300 0 L300 70 M260 70 L340 70 L320 110 L280 110 Z" stroke-width="2"/></g><g id="${S}-lamp1"><path d="M780 0 L780 70 M740 70 L820 70 L800 110 L760 110 Z" stroke-width="2"/></g>` }
      : { lines: [{ d: "M80 700 C300 660 780 660 1000 700", w: 2.4 }, { d: "M200 640 a60 22 0 1 0 120 0 a60 22 0 1 0 -120 0 M760 640 a60 22 0 1 0 120 0 a60 22 0 1 0 -120 0 M560 380 C560 340 600 340 600 380 L600 470 L560 470 Z", w: 1.8 }],
        washes: [["wash-rose", 100, 560, 880, 260, 0.45]], actors: "" };
    return {
      bg,
      mid: { lines: v === "bar" ? [{ d: "M0 820 L1080 790 M0 860 L1080 830", w: 3 }, { d: "M160 860 L160 1000 M120 1000 L200 1000 M520 850 L520 1000 M480 1000 L560 1000 M880 840 L880 1000 M840 1000 L920 1000", w: 2 }] : [{ d: "M60 760 L1020 740", w: 3 }],
        washes: [[c.pal.warm, 160, 300, 760, 560, 0.4]], actors: "" },
      fg: { lines: [], washes: [], actors: sparks(S, [[200, 420, 12], [880, 470, 14]]) },
      over: `<div class="fol fcard pos" id="${S}-pos" style="left:250px;top:330px;width:580px"><div class="fhead">POS · BAR &amp; RESTAURANT · ROOM ${esc(c.T["{room}"])}</div>
        ${lines.map((l, i) => `<div class="bline" id="${S}-l${i}"><span>${esc(l.label)}<i class="each">${esc(l.each)} each</i></span><span class="bval">${esc(l.value)}</span></div>`).join("")}
        <div class="btot"><span>Total</span><span class="bval">${esc(c.T["{orderTotal}"])}</span></div>
        <div class="ok" id="${S}-ok" style="position:relative;top:auto;margin-top:22px">${esc(c.fill(s.okChip ?? "Posted to room {room}"))}</div></div>`,
      js: `draw(S,a+.15,1.2);washes(S,a+.25,.3);words(S,a+.25);
        tl.fromTo("#"+S+"-pos",{opacity:0,y:40,rotation:3},{opacity:1,y:0,rotation:-1.5,duration:.7,ease:"power3.out",immediateRender:false},cue(a+.6,"card"));
        ${lines.map((_, i) => `tl.fromTo("#"+S+"-l${i}",{opacity:0,x:30},{opacity:1,x:0,duration:.4,ease:"power3.out",immediateRender:false},cue(a+1.1+${i}*.3,"flip"));`).join("")}
        tl.fromTo("#"+S+"-ok",{opacity:0,scale:.8},{opacity:1,scale:1,duration:.45,ease:"back.out(2)",immediateRender:false},cue(a+Math.max(2.4,(b-a)*.5),"match"));`,
      life: sparkLife(2) + `css(S+"-pos","rotate("+(-1.5+.8*Math.sin(t*1.1)).toFixed(2)+"deg) translateY("+(5*Math.sin(t*.9)).toFixed(1)+"px)");
        for(const k of [0,1]){setT(S+"-lamp"+k,"rotate("+(4*Math.sin(t*1.3+k*1.7)).toFixed(2)+" "+(k?780:300)+" 0)");}`,
      hide: [`#${S}-pos`, `#${S}-ok`, ...lines.map((_, i) => `#${S}-l${i}`)],
      shows: lines.flatMap((l) => [l.label, l.each, l.value]),
    };
  },

  "ui-screen"(S, s, c) {
    const h = hash(c.seed + S);
    if (s.screen === "kitchen") {
      // paper tickets on the pass rail, the last one stamped ready
      const dishes = orderLines(c.ledger).map((l) => l.label);
      const codes = ["T-04", "T-12", `Room ${101 + (h % 9)}`, "Bar 03"];
      const tickets = [0, 1, 2].map((i) => ({ code: codes[(i + (h >>> 3)) % codes.length], items: [dishes[i % dishes.length], dishes[(i + 1) % dishes.length]], age: `0${2 + i * 2}:${String(10 + ((h >>> (i * 4)) % 49)).padStart(2, "0")}` }));
      return {
        bg: { lines: [{ d: "M40 760 L1040 740 M40 800 L1040 780", w: 2.6 }, { d: "M120 740 C120 700 200 700 200 740 M300 736 C300 690 360 690 360 736 M780 726 a40 18 0 1 0 80 0 a40 18 0 1 0 -80 0", w: 1.8 }], washes: [[c.pal.warm, 40, 560, 1000, 300, 0.4]], actors: `<path class="actor" id="${S}-s0" d="" stroke-width="1.6"/><path class="actor" id="${S}-s1" d="" stroke-width="1.6"/>` },
        mid: { lines: [{ d: "M60 200 L1020 200", w: 3.2 }, { d: "M60 200 L60 170 M1020 200 L1020 170", w: 2.4 }], washes: [["wash-teal", 120, 220, 840, 420, 0.3]], actors: "" },
        fg: { lines: [], washes: [], actors: sparks(S, [[150, 640, 12], [960, 600, 14]]) },
        over: tickets.map((t, i) => `<div class="kt" id="${S}-kt${i}" style="left:${140 + i * 270}px"><b>${esc(t.code)}</b>${t.items.map((x) => `<span>${esc(x)}</span>`).join("")}<i>${esc(t.age)}</i>${i === 2 ? `<em id="${S}-ready">READY</em>` : ""}</div>`).join(""),
        js: `draw(S,a+.15,1.0);washes(S,a+.25,.3);words(S,a+.25);
          ${tickets.map((_, i) => `tl.fromTo("#"+S+"-kt${i}",{opacity:0,y:-60,rotation:${i - 1}*6},{opacity:1,y:0,rotation:${(i - 1) * 2},duration:.55,ease:"back.out(1.5)",immediateRender:false},${i ? "" : "cue("}a+.8+${i}*.3${i ? "" : ',"card")'});`).join("")}
          tl.fromTo("#"+S+"-ready",{opacity:0,scale:2},{opacity:.95,scale:1,duration:.17,ease:"power4.in",immediateRender:false},cue(a+Math.min(Math.max(1.9,(b-a)*.6),b-a-.7),"stamp")-.17);`,
        life: sparkLife(2) + `for(let i=0;i<3;i++)css(S+"-kt"+i,"rotate("+((i-1)*2+1.6*Math.sin(t*1.3+i*1.1)).toFixed(2)+"deg)");
          for(const k of [0,1]){const e=g(S+"-s"+k);if(!e)continue;let d="";const x0=160+k*640;for(let j=0;j<=12;j++){const y=700-j*7,x=x0+8*Math.sin(j*.55-t*3.2+k*2);d+=(j?" L":"M")+x.toFixed(1)+" "+y.toFixed(1);}e.setAttribute("d",d);e.style.opacity=(clamp((t-a-1)*1.2)*(.5+.25*Math.sin(t*2+k))).toFixed(3);}`,
        hide: [...tickets.map((_, i) => `#${S}-kt${i}`), `#${S}-ready`],
        shows: tickets.flatMap((t) => [t.code, t.age, ...t.items]),
      };
    }
    if (s.screen === "menu") {
      const lines = orderLines(c.ledger);
      return {
        bg: { lines: [], washes: [["wash-violet-b", 640, 20, 420, 420, 0.5], [c.pal.glow, 20, 600, 420, 400, 0.5]], actors: "" },
        mid: { lines: [{ d: phoneD, w: 3.2 }, { d: "M500 102 L580 102 M370 150 h70 v70 h-70 Z M384 164 h18 v18 h-18 Z M410 190 h18 v18 h-18 Z M384 196 h10 M418 164 h10 v10", w: 1.8 }], washes: [["wash-blue", 220, 120, 640, 780, 0.4]], actors: "" },
        fg: { lines: [], washes: [], actors: sparks(S, [[220, 260, 14], [880, 520, 16]]) },
        over: `<div class="fol fcard pos" id="${S}-menu" style="left:346px;top:250px;width:388px"><div class="fhead">MENU · ROOM ${esc(c.T["{room}"])}</div>
          ${lines.map((l, i) => `<div class="bline" id="${S}-l${i}" style="font-size:21px"><span>${esc(l.label)}<i class="each">${esc(l.each)} each</i></span><span class="bval">${esc(l.value)}</span></div>`).join("")}
          <div class="btot" style="font-size:24px"><span>Total</span><span class="bval">${esc(c.T["{orderTotal}"])}</span></div>
          <div class="ok" id="${S}-ok" style="position:relative;top:auto;margin-top:18px;font-size:20px">Approved · bill to room</div></div>`,
        js: `draw(S,a+.15,.9);washes(S,a+.25,.3);words(S,a+.25);
          ${lines.map((_, i) => `tl.fromTo("#"+S+"-l${i}",{opacity:0,x:24},{opacity:1,x:0,duration:.4,ease:"power3.out",immediateRender:false},${i ? `a+1.0+${i}*.25` : `cue(a+1.0,"tap")`});`).join("")}
          tl.fromTo("#"+S+"-ok",{opacity:0,scale:.8},{opacity:1,scale:1,duration:.45,ease:"back.out(2)",immediateRender:false},cue(a+Math.min(Math.max(1.9,(b-a)*.6),b-a-.7),"match"));`,
        life: sparkLife(2) + `css(S+"-mid",g(S+"-mid").style.transform+" translateY("+(12*Math.sin(t*1.3)).toFixed(1)+"px) rotate("+(1*Math.sin(t*.8)).toFixed(2)+"deg)");`,
        hide: [...lines.map((_, i) => `#${S}-l${i}`), `#${S}-ok`],
        shows: lines.flatMap((l) => [l.label, l.each, l.value]),
      };
    }
    if (s.screen === "housekeeping") {
      // a corridor of doors, each with its status tag; one turns clean
      const base = 100 * (1 + (h % 3)) + 1, states = ["Occupied", "Dirty", "Clean", "Occupied"];
      const doors = [0, 1, 2, 3].map((i) => ({ no: String(base + i), st: states[(i + (h >>> 5)) % 4] }));
      const flip = doors.findIndex((d) => d.st === "Dirty");
      const xs = [150, 360, 570, 780];
      return {
        bg: { lines: [{ d: "M0 260 L1080 240 M0 880 L1080 860", w: 2.4 }], washes: [[c.pal.sky, -60, 100, 1200, 400, 0.4]], actors: "" },
        mid: { lines: [{ d: xs.map((x) => `M${x} 300 h160 v560 h-160 Z M${x + 128} 600 a8 8 0 1 0 16 0 a8 8 0 1 0 -16 0`).join(" "), w: 2.8 }], washes: [[c.pal.warm, 40, 280, 1000, 600, 0.35]], actors: `<circle class="ring" id="${S}-r0" cx="${xs[flip] + 80}" cy="420" r="40"/>` },
        fg: { lines: [], washes: [], actors: `<g id="${S}-cart"><path d="M0 0 h150 v90 h-150 Z M10 90 a14 14 0 1 0 28 0 M112 90 a14 14 0 1 0 28 0 M20 0 v-40 h110 v40" stroke-width="2.4"/></g>` + sparks(S, [[160, 200, 12], [930, 220, 14]]) },
        over: doors.map((d, i) => `<div class="door" id="${S}-d${i}" style="left:${xs[i] + 5}px">${esc(d.no)}${i === flip ? `<span class="flip"><span class="fa">Dirty</span><span class="fb">Clean</span></span>` : `<span>${d.st}</span>`}</div>`).join(""),
        js: `draw(S,a+.15,1.0);washes(S,a+.25,.3);words(S,a+.25);
          tl.fromTo("#"+S+" .door",{opacity:0,y:20},{opacity:1,y:0,duration:.4,stagger:.15,ease:"power3.out",immediateRender:false},cue(a+.8,"card"));
          gsap.set("#"+S+"-d${flip} .fb",{yPercent:110});
          {const at=a+Math.min(Math.max(1.9,(b-a)*.6),b-a-.7);tl.to("#"+S+"-d${flip} .fa",{yPercent:-110,duration:.32,ease:"power2.inOut"},cue(at,"flip"));tl.to("#"+S+"-d${flip} .fb",{yPercent:0,duration:.32,ease:"power2.inOut"},at);T_[S]={at};}`,
        life: sparkLife(2) + `setT(S+"-cart","translate("+(-180+((t-a)*120)%1400).toFixed(1)+" 770)");
          {const e=g(S+"-r0");if(e){const s2=t-T_[S].at;if(s2<0)e.style.opacity=0;else{const f=(s2/1.4)%1;e.setAttribute("r",(40+80*f).toFixed(1));e.style.opacity=(.6*(1-f)).toFixed(3);}}}`,
        hide: [`#${S} .door`],
        shows: doors.map((d) => d.no),
      };
    }
    if (s.screen === "events") {
      const kinds = [["Board meeting", 20], ["Wedding reception", 180], ["Training workshop", 40], ["Product launch", 60], ["Graduation lunch", 120]];
      const times = ["09:00", "12:30", "18:00"];
      const evs = [0, 1, 2].map((i) => ({ time: times[i], name: kinds[(i + (h >>> 2)) % kinds.length][0], pax: kinds[(i + (h >>> 2)) % kinds.length][1], chip: i === 1 ? "Deposit cleared" : "" }));
      return {
        bg: { lines: [], washes: [[c.pal.sky, -60, 60, 1200, 520, 0.45]], actors: cloudActors(S) },
        mid: { lines: [{ d: "M160 180 L920 170 L930 860 L170 870 Z M160 260 L920 250", w: 3 }, { d: "M300 150 v60 M780 140 v60", w: 3 }], washes: [[c.pal.warm, 160, 180, 760, 690, 0.3]], actors: "" },
        fg: { lines: [], washes: [], actors: sparks(S, [[120, 320, 12], [980, 700, 14]]) + `<g id="${S}-bal"><path d="M0 0 C-30 0 -36 -50 0 -64 C36 -50 30 0 0 0 Z M0 0 C6 30 -6 60 4 110" stroke-width="2"/></g>` },
        over: `<div class="evs" id="${S}-evs">${evs.map((e, i) => `<div class="ev" id="${S}-e${i}"><b>${e.time}</b><span>${esc(e.name)}<i>${e.pax} pax</i></span>${e.chip ? `<em>${e.chip}</em>` : ""}</div>`).join("")}</div>`,
        js: `draw(S,a+.15,.9);washes(S,a+.25,.3);words(S,a+.25);
          tl.fromTo("#"+S+" .ev",{opacity:0,x:-30},{opacity:1,x:0,duration:.45,stagger:.25,ease:"power3.out",immediateRender:false},cue(a+.9,"card"));`,
        life: sparkLife(2) + `setT(S+"-bal","translate("+(980+14*Math.sin(t*.9)).toFixed(1)+" "+(500-(t-a)*14+8*Math.sin(t*1.3)).toFixed(1)+") rotate("+(6*Math.sin(t*1.1)).toFixed(2)+")");`,
        hide: [`#${S} .ev`],
        shows: evs.flatMap((e) => [e.time, `${e.pax} pax`]),
      };
    }
    if (s.screen === "reports") {
      return {
        bg: { lines: [], washes: [["wash-violet-b", 640, 20, 420, 420, 0.5], [c.pal.glow, 20, 600, 420, 400, 0.5]], actors: "" },
        mid: { lines: [{ d: phoneD, w: 3.2 }, { d: "M500 102 L580 102", w: 1.6 }], washes: [["wash-blue", 220, 120, 640, 780, 0.45]],
          actors: `<path id="${S}-spark" class="spk" d="M350 330 C390 310 410 322 450 300 C490 276 510 296 550 268 C590 244 620 262 660 236 C700 216 716 222 736 206" stroke-width="3"/>` +
            [0, 1, 2, 3, 4].map((i) => `<rect class="bar" id="${S}-bar${i}" x="${352 + i * 80}" y="470" width="46" height="0"/>`).join("") },
        fg: { lines: [], washes: [], actors: sparks(S, [[220, 260, 14], [880, 520, 16]]) },
        over: `<div class="rep" id="${S}-rep"><div class="fhead">REPORTS</div><div class="rtitle">Reports Hub</div>
          ${["Revenue · today, by outlet", "Occupancy · rooms, live", "Folio audit · every change", "Guests · arrivals"].map((r, i) => `<div class="rrow" id="${S}-rr${i}">${esc(r)}</div>`).join("")}</div>`,
        js: `draw(S,a+.15,.9);washes(S,a+.25,.3);words(S,a+.25);
          drawPath("#"+S+"-spark",a+.9,1.1,"draw");
          ${[0, 1, 2, 3, 4].map((i) => `tl.to("#"+S+"-bar${i}",{attr:{height:${[40, 62, 50, 80, 100][i]},y:${470 - [40, 62, 50, 80, 100][i]}},duration:.6,ease:"power3.out"},a+1.3+${i}*.12);`).join("")}
          tl.fromTo("#"+S+"-rep .rrow",{opacity:0,x:24},{opacity:1,x:0,duration:.4,stagger:.18,ease:"power3.out",immediateRender:false},cue(a+1.9,"card"));`,
        life: sparkLife(2) + `css(S+"-mid",g(S+"-mid").style.transform+" translateY("+(14*Math.sin(t*1.3)).toFixed(1)+"px) rotate("+(1.1*Math.sin(t*.8)).toFixed(2)+"deg)");`,
        hide: [`#${S}-rep .rrow`],
      };
    }
    // front desk on a laptop: every figure computed from one room count
    const r = hash(c.seed + S), rooms = [14, 16, 18, 20, 24][r % 5], occ = Math.round(rooms * (0.62 + ((r >>> 4) % 25) / 100));
    const guests = [["Amina K.", 101], ["Joseph M.", 104], ["Neema S.", 107], ["David O.", 110], ["Rehema J.", 112]].slice((r >>> 8) % 3, ((r >>> 8) % 3) + 3);
    const kpis = [["OCCUPANCY", `${Math.round((occ / rooms) * 100)}%`], ["ROOMS FREE", String(rooms - occ)], ["CHECK-INS", String(guests.length)]];
    return {
      bg: { lines: [{ d: "M0 900 L1080 880", w: 2.6 }], washes: [["wash-blue", 60, 120, 960, 700, 0.4]], actors: "" },
      mid: { lines: [{ d: "M150 160 h780 a20 20 0 0 1 20 20 v520 h-820 v-520 a20 20 0 0 1 20 -20 Z", w: 3 }, { d: "M60 760 L1020 760 L1060 820 L20 820 Z M460 790 h160", w: 2.4 }],
        washes: [[c.pal.glow, 140, 150, 800, 560, 0.45]], actors: "" },
      fg: { lines: [], washes: [], actors: sparks(S, [[120, 300, 14], [980, 260, 16], [1000, 640, 12]]) },
      over: `<div class="desk" id="${S}-desk"><div class="fhead">FRONT DESK · LIVE</div><div class="kpis">${kpis.map(([k, v2], i) => `<div class="kpi" id="${S}-k${i}"><i>${k}</i><b>${v2}</b></div>`).join("")}</div>
        ${guests.map(([n, rm], i) => `<div class="grow" id="${S}-g${i}"><span>${esc(n)}</span><span>Room ${rm}</span></div>`).join("")}</div>`,
      js: `draw(S,a+.15,1.0);washes(S,a+.25,.3);words(S,a+.25);
        tl.fromTo("#"+S+"-desk .kpi",{opacity:0,y:20},{opacity:1,y:0,duration:.45,stagger:.15,ease:"back.out(1.6)",immediateRender:false},cue(a+.9,"card"));
        tl.fromTo("#"+S+"-desk .grow",{opacity:0,x:30},{opacity:1,x:0,duration:.4,stagger:.2,ease:"power3.out",immediateRender:false},a+1.5);`,
      life: sparkLife(3) + `css(S+"-mid",g(S+"-mid").style.transform+" translateY("+(8*Math.sin(t*1.1)).toFixed(1)+"px)");
        {const e=g(S+"-g0");if(e)e.style.background="rgba(54,210,186,"+(.06+.08*Math.abs(Math.sin(t*2))).toFixed(3)+")";}`,
      hide: [`#${S}-desk .kpi`, `#${S}-desk .grow`],
      shows: [...kpis.map((k) => k[1]), ...guests.map((gst) => `Room ${gst[1]}`)],
    };
  },

  checklist(S, s, c) {
    const v = pick(c.seed + "chk", ["note", "clipboard"]);
    const items = (s.items ?? []).slice(0, 4);
    return {
      bg: { lines: [], washes: [[c.pal.sky, -60, 60, 1200, 560, 0.5]], actors: cloudActors(S) },
      mid: { lines: v === "note"
        ? [{ d: "M230 180 L860 160 L880 840 L250 860 Z", w: 3 }, { d: "M540 150 a14 14 0 1 0 28 0 a14 14 0 1 0 -28 0 M554 164 L552 196", w: 2.2 }]
        : [{ d: "M240 200 h600 v680 h-600 Z", w: 3 }, { d: "M440 170 h200 v60 h-200 Z", w: 2.6 }],
        washes: [[c.pal.warm, 200, 200, 700, 680, 0.35]], actors: items.map((_, i) => `<path class="tk" id="${S}-tk${i}" d="M300 ${377 + i * 130} l14 16 l28 -34" stroke-width="4"/>`).join("") },
      fg: { lines: [], washes: [], actors: sparks(S, [[160, 360, 12], [940, 720, 14]]) },
      over: `<div class="note" id="${S}-note">${items.map((x, i) => `<div class="nitem" id="${S}-it${i}">${esc(x)}</div>`).join("")}</div>`,
      js: `draw(S,a+.15,.9);washes(S,a+.25,.3);words(S,a+.25);
        ${items.map((_, i) => `{const at=a+.9+${i}*Math.min(.75,(b-a-1.6)/${items.length});tl.fromTo("#"+S+"-it${i}",{opacity:0,x:-24},{opacity:1,x:0,duration:.4,ease:"power3.out",immediateRender:false},at);drawPath("#"+S+"-tk${i}",at+.15,.35,"pop",{i:${i}});}`).join("")}`,
      life: sparkLife(2) + `css(S+"-mid",g(S+"-mid").style.transform+" rotate("+(.9*Math.sin(t*.9)).toFixed(2)+"deg)");${skyLife.replace(/\[\[880,250,58,0\],\[960,215,66,1\.7\],\[820,300,50,3\.1\]\]\.forEach[\s\S]*?\}\);/, "")}`,
      hide: items.map((_, i) => `#${S}-it${i}`),
    };
  },

  payoff(S, s, c) {
    const v = pick(c.seed + "pay", ["toast", "farewell", "sunrise"]);
    const city = CITIES[c.city];
    const dusk = v !== "sunrise";
    const sky = dusk ? [["wash-dusk", -40, 30, 1160, 620, 0.8], ["wash-rose", 0, 400, 1080, 280, 0.6]] : [["wash-sky", -40, 30, 1160, 620, 0.7], ["wash-lilac", 0, 420, 1080, 260, 0.5]];
    let midLines = [{ d: "M0 700 L1080 680 M0 742 L1080 722", w: 2.6 }], midActors = "", washesMid = [["wash-violet", 0, 640, 1080, 420, 0.4]], extraLife = "";
    if (v === "toast") {
      const a = person(c.seed + "p0", { x: 380, y: 720, s: 1, pose: "toast", dir: 1 }), b = person(c.seed + "p1", { x: 700, y: 700, s: 1, pose: "toast", dir: -1 });
      midActors = `<g id="${S}-fig0"><path d="${a.d}" stroke-width="2.6"/><path d="${a.fine}" stroke-width="1.4"/><path d="${glass(a.hand[0], a.hand[1] - 10)}" stroke-width="2.2"/></g>` +
        `<g id="${S}-fig1"><path d="${b.d}" stroke-width="2.6"/><path d="${b.fine}" stroke-width="1.4"/><path d="${glass(b.hand[0], b.hand[1] - 10)}" stroke-width="2.2"/></g>` +
        `<path class="actor" id="${S}-clk" d="M520 520 L536 502 M532 536 L556 530 M518 508 L524 486" stroke-width="2"/>`;
      washesMid.push(a.wash, b.wash);
      extraLife = `{const cc=t-T_[S].clink,lean=cc<-.35?0:cc<0?ease((cc+.35)/.35):cc<.5?1-ease(cc/.5)*.6:.4;css(S+"-fig0","rotate("+(5*lean).toFixed(2)+"deg)");css(S+"-fig1","rotate("+(-5*lean).toFixed(2)+"deg)");
        const e=g(S+"-clk");if(e){const k=cc<0?0:cc<.6?1-cc/.6:0;e.style.opacity=k.toFixed(3);e.style.transform="scale("+(.8+.6*(1-k)).toFixed(3)+")";}}`;
    } else if (v === "farewell") {
      const a = person(c.seed + "p0", { x: 360, y: 760, s: 0.95, pose: "wave", dir: -1 }), b = person(c.seed + "p1", { x: 640, y: 770, s: 0.9, pose: "bag", dir: 1 });
      midLines = [{ d: "M0 960 C300 930 700 940 1080 920", w: 2.2 }];
      midActors = `<g id="${S}-fig0"><path d="${a.d}" stroke-width="2.6"/><path d="${a.fine}" stroke-width="1.4"/></g><g id="${S}-fig1"><path d="${b.d}" stroke-width="2.6"/><path d="${b.fine}" stroke-width="1.4"/></g>`;
      washesMid = [a.wash, b.wash, ["wash-teal", -60, 820, 1200, 260, 0.45]];
      extraLife = `css(S+"-fig0","translateX("+(-(t-a)*10).toFixed(1)+"px) rotate("+(3*Math.sin(t*4)).toFixed(2)+"deg)");css(S+"-fig1","translate("+((t-a)*14).toFixed(1)+"px,"+(-Math.abs(Math.sin(t*5))*6).toFixed(1)+"px)");`;
    } else {
      const a = person(c.seed + "p0", { x: 470, y: 700, s: 1.05, pose: "rest" });
      midLines = [{ d: "M0 840 L1080 826 M0 872 L1080 858", w: 2.6 }];
      midActors = `<g id="${S}-fig0"><path d="${a.d}" stroke-width="2.6"/><path d="${a.fine}" stroke-width="1.4"/></g><path id="${S}-mug" d="M640 772 L640 822 C640 838 690 838 690 822 L690 772 Z M690 782 C710 782 710 812 690 812" stroke-width="2.2"/>` +
        `<path class="actor" id="${S}-s0" d="" stroke-width="1.6"/>`;
      washesMid.push(a.wash);
      extraLife = `{const e=g(S+"-s0");if(e){let d="";for(let j=0;j<=10;j++){const y=766-j*6,x=665+6*Math.sin(j*.55-t*3);d+=(j?" L":"M")+x.toFixed(1)+" "+y.toFixed(1);}e.setAttribute("d",d);}}css(S+"-fig0","translateY("+(2*Math.sin(t*1.2)).toFixed(1)+"px)");`;
    }
    return {
      bg: { lines: [...city.far.lines.map((l) => ({ ...l, d: l.d })), { d: dusk ? "M846 250 m-46 0 a46 46 0 1 0 92 0 a46 46 0 1 0 -92 0" : "M200 300 m-40 0 a40 40 0 1 0 80 0 a40 40 0 1 0 -80 0", w: 1.8 }],
        washes: [...sky, [dusk ? "wash-magenta" : "wash-sky", dusk ? 740 : 100, dusk ? 150 : 200, 220, 220, 0.8]],
        actors: dusk ? [[150, 110], [300, 70], [470, 120], [640, 60], [960, 150], [1010, 80]].map(([x, y], i) => `<path class="actor spark" id="${S}-st${i}" d="M${x - 7} ${y} L${x + 7} ${y} M${x} ${y - 7} L${x} ${y + 7}" stroke-width="1.6"/>`).join("") : birdActors(S) },
      mid: { lines: midLines, washes: washesMid, actors: midActors },
      fg: { lines: dusk ? [{ d: "M150 770 h60 v90 h-60 Z M160 770 C160 745 200 745 200 770 M870 760 h60 v90 h-60 Z M880 760 C880 735 920 735 920 760", w: 2.2 }] : [],
        washes: dusk ? [["wash-lilac", 120, 730, 140, 150, 0.7], ["wash-lilac", 840, 720, 140, 150, 0.7]] : [],
        actors: dusk ? `<path class="actor flame" id="${S}-f0" d="M180 846 C170 826 176 806 180 792 C184 806 190 826 180 846 Z" stroke-width="1.6"/><path class="actor flame" id="${S}-f1" d="M900 836 C890 816 896 796 900 782 C904 796 910 816 900 836 Z" stroke-width="1.6"/>` +
          Array.from({ length: 8 }, (_, i) => `<circle class="fly" id="${S}-ff${i}" cx="0" cy="0" r="4"/>`).join("") : "" },
      fixed: s.chip ? `<div class="chip" id="${S}-chip" style="top:1080px">${esc(c.fill(s.chip))}</div>` : "",
      js: `const CLINK=a+Math.min(1.2,(b-a)*.4);
        draw(S,a+.1,1.2);washes(S,a+.2,.2);words(S,a+.25);
        ${v === "toast" ? `cue(CLINK,"clink");` : ""}
        ${s.chip ? `tl.fromTo("#"+S+"-chip",{opacity:0,scale:.8},{opacity:1,scale:1,duration:.45,ease:"back.out(2)",immediateRender:false},cue(CLINK+.6,"match"));` : ""}
        T_[S]={clink:CLINK};`,
      life: extraLife + (dusk ? `{const u=clamp((t-a)/(b-a+1));setT(S+"-bg","");}
        for(let i=0;i<6;i++){const e=g(S+"-st"+i);if(!e)continue;const on=clamp((t-a-.6-i*.35)*2);e.style.opacity=(on*(.5+.5*Math.abs(Math.sin(t*3+i)))).toFixed(3);e.style.transform="scale("+(.7+.4*Math.abs(Math.sin(t*2.4+i))).toFixed(3)+")";}
        for(const k of [0,1]){const e=g(S+"-f"+k);if(e)e.style.transform="scaleY("+(.85+.3*Math.abs(Math.sin(t*13+k)*Math.sin(t*7.3+k*2))).toFixed(3)+") scaleX("+(1+.08*Math.sin(t*9+k)).toFixed(3)+")";}
        for(let i=0;i<8;i++){const e=g(S+"-ff"+i);if(!e)continue;const fx=120+(i*137)%840,fy=560+(i*71)%260;e.setAttribute("cx",(fx+30*Math.sin(t*.7+i*1.3)).toFixed(1));e.setAttribute("cy",(fy+18*Math.sin(t*1.1+i*2.6)).toFixed(1));e.style.opacity=(clamp((t-a-.8)*1.5)*(.35+.65*Math.abs(Math.sin(t*2.6+i*1.3)))).toFixed(3);}` : skyLife),
      hide: s.chip ? [`#${S}-chip`] : [],
    };
  },
};

// ── the page ────────────────────────────────────────────────────────────────

function layerHtml(S, name, ly, over = "") {
  const washes = (ly.washes ?? []).filter(Boolean)
    .map(([n, x, y, w, h, o], i) => `<div class="wb" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px"><img class="wash" data-o="${o}" src="TEX/${n}.webp"></div>`).join("");
  const lines = (ly.lines ?? []).map((l, i) => `<path class="ln" d="${l.d}" stroke-width="${l.w}"/>`).join("");
  return `<div class="ly" id="${S}-${name}">${washes}<svg class="ink" viewBox="0 0 1080 1000">${lines}${ly.actors ?? ""}</svg>${over}</div>`;
}

function caption(S, s) {
  const words = String(s.line).trim().split(/\s+/);
  const bare = (w) => w.replace(/[?.,!:;]/g, "").toLowerCase();
  const cls = (w) => ((s.bad ?? []).some((b) => b.toLowerCase() === bare(w)) ? "bad" : (s.good ?? []).some((g) => g.toLowerCase() === bare(w)) ? "good" : "");
  const UL = `<span class="ul"><svg viewBox="0 0 100 12" preserveAspectRatio="none"><path d="M2 8 C 22 3, 48 11, 70 5 S 96 6, 98 6"/></svg></span>`;
  return `<div class="cap" id="${S}-cap" style="font-size:${s.line.length <= 36 ? 74 : s.line.length <= 52 ? 66 : 58}px">${words
    .map((w) => `<span class="w"><span class="wi ${cls(w)}">${esc(w)}${cls(w) ? UL : ""}</span></span>`).join(" ")}</div>`;
}

/**
 * @param brief  a studio brief (validated), with style "ink"
 * @param voice  timing.pauses() result
 * @param brand  brand.json (+ id)
 * @param urls   { tex, gsap, logo, fonts(weight) } as file:// URLs
 */
export function composeInk(brief, voice, brand, urls) {
  const seed = brief.seed ?? brief.id ?? "reel";
  const ledger = makeLedger(brief.ledger ?? {}, seed, brief.language);
  const T = tokens(ledger);
  const fill = (s) => String(s).replace(/\{[a-zA-Z]+\}/g, (k) => { if (!(k in T)) throw new Error(`unknown number token ${k}`); return T[k]; });
  const roles = brief.scenes.map((s) => ROLE[s.type]);
  const cuts = planCuts(voice, brief.scenes.length, roles.map((r) => WEIGHT[r]));
  const endAt = +(voice.speechEnd - 0.45).toFixed(3);
  const duration = Math.min(59, Math.ceil(voice.speechEnd + 2.2));
  const starts = [0, ...cuts], ends = [...cuts, endAt];
  const city = cityKey(brief.city ?? brief.scenes.find((s) => s.tag)?.tag ?? "");
  const tod = pick(seed + "tod", Object.keys(PALETTES));
  const veils = ["veil", "veil-teal", "veil-blue"].sort((a, b) => (hash(seed + a) % 97) - (hash(seed + b) % 97));

  const ids = brief.scenes.map((_, i) => `s${i}`);
  const built = brief.scenes.map((s, i) => {
    const fn = SCENE[s.type];
    if (!fn) throw new Error(`ink has no scene "${s.type}"`);
    return fn(ids[i], s, { seed: seed + i, city, tod, pal: PALETTES[tod], T, fill, ledger });
  });
  // a camera move per scene: direction and strength vary with the post
  const pans = ids.map((S, i) => {
    const h = hash(seed + S + "pan");
    return { x: ((h % 2) ? 1 : -1) * (44 + (h >>> 3) % 36), y: -(18 + (h >>> 9) % 26), s: 0.07 + ((h >>> 13) % 4) / 100 };
  });

  const scenesHtml = built.map((b, i) => `<div class="scene" id="${ids[i]}"${i ? "" : ' style="opacity:1"'}><div class="art" id="${ids[i]}-art">${layerHtml(ids[i], "bg", b.bg)}${layerHtml(ids[i], "mid", b.mid, b.over)}${layerHtml(ids[i], "fg", b.fg)}</div>${b.fixed ?? ""}${caption(ids[i], brief.scenes[i])}</div>`).join("\n");
  const hide = built.flatMap((b) => b.hide ?? []);
  const allowed = [...Object.values(T), ...built.flatMap((b) => b.shows ?? [])];
  const windows = brief.scenes.map((s, i) => ({ id: ids[i], type: s.type, t0: starts[i], t1: ends[i] }));

  const js = built.map((b, i) => `{const S="${ids[i]}",a=${starts[i]},b=${ends[i]};${b.js}${i ? `veilCut("${ids[i - 1]}","${ids[i]}",a,"${veils[(i - 1) % 3]}");` : ""}}`).join("\n");
  const life = built.map((b, i) => `{const S="${ids[i]}",a=${starts[i]},b=${ends[i]};if(t>a-1&&t<b+1){${b.life}}}`).join("\n");

  const html = PAGE({ urls, scenesHtml, js, life, hide, ids, starts, ends, pans, endAt, duration, brief, brand, lastVeil: veils[(ids.length - 1) % 3] });
  return { html, duration, cuts, joins: cuts.map(() => "veil"), ledger, windows, endAt, allowed, endVeil: true, look: { city, tod, veils, variants: built.length } };
}

function PAGE({ urls, scenesHtml, js, life, hide, ids, starts, ends, pans, endAt, duration, brief, brand, lastVeil }) {
  const f = urls.fonts;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${[400, 500, 600, 700].map((w) => `@font-face{font-family:Inter;font-weight:${w};src:url(${f(w)})}`).join("\n")}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${W}px;height:${H}px;overflow:hidden;background:#F9F5EE;font-family:Inter,sans-serif;color:${INK}}
#paper{position:absolute;inset:0;width:${W}px;height:${H}px}
.scene{position:absolute;inset:0;opacity:0}
.art{position:absolute;left:0;top:170px;width:1080px;height:1000px;transform-origin:540px 520px}
.ly{position:absolute;inset:0}
.wb{position:absolute}
.wash{position:absolute;inset:0;width:100%;height:100%;opacity:0;mix-blend-mode:multiply}
.ink{position:absolute;left:0;top:0;width:1080px;height:1000px;overflow:visible;filter:url(#boil)}
.ink path,.ink circle,.ink ellipse,.ink rect{fill:none;stroke:${INK};stroke-linecap:round;stroke-linejoin:round}
.ink .petal{fill:#B596F0;stroke:none;opacity:0}
.ink .ring{stroke:${TEAL_INK};stroke-width:2.4;opacity:0}
.ink .fly{fill:#F2CF7A;stroke:none;opacity:0}
.ink .flame{fill:rgba(242,190,110,.55)}
.ink .tk{stroke:${TEAL_INK}}
.ink .spk{stroke:${TEAL_INK}}
.ink .bar{fill:rgba(123,84,255,.25);stroke:${INK};stroke-width:2}
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
.place{position:absolute;left:80px;top:950px;font-size:22px;font-weight:600;letter-spacing:.14em;color:${INK_SOFT};background:rgba(249,245,238,.8);border-radius:100px;padding:8px 14px;display:flex;gap:10px;align-items:center}
.place i{width:10px;height:10px;border-radius:50%;background:${TEAL_INK}}
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
.fol{position:absolute;color:${INK}}
.fhead{font-size:19px;font-weight:600;letter-spacing:.12em;color:${INK_SOFT};margin-bottom:20px}
.frow{display:flex;justify-content:space-between;align-items:flex-end;font-size:23px;padding:14px 0;border-bottom:1.5px solid rgba(30,35,80,.18)}
.frow.tot{font-size:27px;font-weight:700;border:0;padding-top:20px}
.frow.tot>span:first-child{display:flex;flex-direction:column}
.frow.tot i{font-style:normal;font-weight:500;font-size:18px;color:${INK_SOFT};margin-top:6px}
.flip{position:relative;display:inline-block;overflow:hidden;height:1.25em;min-width:7.4em;text-align:right;vertical-align:bottom}
.flip span{position:absolute;right:0;top:0;white-space:nowrap}
.frow.tot i .flip{text-align:left;min-width:8.6em}
.frow.tot i .flip span{left:0;right:auto}
.frow .flip .fa{color:${RED}}
.frow.tot .flip .fa{color:${INK}}
.flip .fb{color:${TEAL_INK}}
.tick{position:absolute;top:420px;width:120px;height:120px;overflow:visible}
.tick path{fill:none;stroke:${TEAL_INK};stroke-width:5;stroke-linecap:round;stroke-linejoin:round}
.ok{position:absolute;left:0;top:560px;width:100%;text-align:center;font-size:24px;font-weight:600;color:${TEAL_INK}}
.pos{padding:30px 34px;background:rgba(255,253,248,.88);border:2.6px solid ${INK};border-radius:8px}
.bline{display:flex;justify-content:space-between;align-items:flex-end;font-size:24px;padding:12px 0;border-bottom:1.5px dashed rgba(30,35,80,.3)}
.bline>span:first-child{display:flex;flex-direction:column}
.each{font-style:normal;font-size:17px;color:${INK_SOFT};margin-top:4px}
.btot{display:flex;justify-content:space-between;font-size:28px;font-weight:700;padding-top:16px}
.btot .bval{color:${TEAL_INK}}
.rep{position:absolute;left:330px;top:150px;width:420px}
.rtitle{font-size:30px;font-weight:700;margin-bottom:14px}
.rrow{font-size:20px;padding:14px 16px;margin-bottom:10px;border:1.8px solid ${INK};border-radius:12px;background:rgba(255,253,248,.7)}
.rep{padding-top:0}
.rep .rrow:first-of-type{margin-top:250px}
.desk{position:absolute;left:190px;top:200px;width:700px}
.kpis{display:flex;gap:14px;margin-bottom:16px}
.kpi{flex:1;border:2px solid ${INK};border-radius:12px;padding:14px 16px;background:rgba(255,253,248,.75)}
.kpi i{display:block;font-style:normal;font-size:15px;letter-spacing:.1em;color:${INK_SOFT}}
.kpi b{display:block;font-size:44px;color:#5B3FD6;margin-top:4px}
.grow{display:flex;justify-content:space-between;font-size:22px;padding:13px 14px;border-bottom:1.5px solid rgba(30,35,80,.2);border-radius:8px}
.note{position:absolute;left:350px;top:310px;width:480px}
.nitem{font-size:32px;font-weight:600;height:130px;display:flex;align-items:center;border-bottom:1.5px dashed rgba(30,35,80,.25)}
.kt{position:absolute;top:210px;width:250px;padding:22px 22px 18px;background:rgba(255,253,248,.92);border:2.4px solid ${INK};border-radius:4px;transform-origin:50% 0;font-size:21px;display:flex;flex-direction:column;gap:8px}
.kt b{font-size:28px}
.kt i{font-style:normal;color:${INK_SOFT};font-size:19px;margin-top:6px}
.kt em{position:absolute;right:14px;bottom:12px;font-style:normal;font-weight:700;font-size:26px;letter-spacing:.08em;color:${TEAL_INK};border:4px double ${TEAL_INK};border-radius:8px;padding:2px 10px;transform:rotate(-10deg);mix-blend-mode:multiply}
.door{position:absolute;top:330px;width:150px;font-size:34px;font-weight:700;text-align:center;display:flex;flex-direction:column;gap:6px;align-items:center}
.door>span{font-size:19px;font-weight:600;color:${INK_SOFT};border:2px solid ${INK};border-radius:100px;padding:4px 12px;background:rgba(255,253,248,.85)}
.door .flip{min-width:4.6em;height:1.6em;text-align:center}
.door .flip span{left:0;right:0;top:4px}
.door .flip .fa{color:#C07A1E}
.evs{position:absolute;left:200px;top:290px;width:690px}
.ev{display:flex;align-items:center;gap:20px;padding:20px 8px;border-bottom:1.8px dashed rgba(30,35,80,.3);font-size:24px}
.ev b{font-size:26px;color:#5B3FD6;width:90px}
.ev span{flex:1;display:flex;flex-direction:column;font-weight:600}
.ev i{font-style:normal;font-weight:500;font-size:18px;color:${INK_SOFT};margin-top:4px}
.ev em{font-style:normal;font-size:17px;color:${TEAL_INK};border:2px solid ${TEAL_INK};border-radius:100px;padding:5px 12px}
.chip{position:absolute;left:80px;font-size:26px;font-weight:600;color:${TEAL_INK};border:2px solid ${TEAL_INK};border-radius:100px;padding:12px 26px;background:rgba(249,245,238,.9)}
.veil{position:absolute;left:-160px;top:260px;width:1400px;height:1400px;opacity:0;transform-origin:700px 700px;mix-blend-mode:multiply}
#end{position:absolute;inset:0;opacity:0}
#endwash{position:absolute;left:190px;top:520px;width:700px;height:560px;opacity:.55;mix-blend-mode:multiply}
.epetal{position:absolute;left:0;top:0;width:20px;height:12px;border-radius:50%;background:#B596F0;opacity:0}
#bigLogo{position:absolute;left:270px;top:740px;width:540px;opacity:0}
#cta{position:absolute;left:50%;top:1000px;font-size:38px;font-weight:600;color:#F9F5EE;background:${INK};border-radius:100px;padding:24px 54px;white-space:nowrap;opacity:0}
#site{position:absolute;top:1140px;width:100%;text-align:center;font-size:30px;color:${INK_SOFT};opacity:0}
#bar{position:absolute;left:0;bottom:0;height:7px;width:${W}px;background:linear-gradient(90deg,#E01FEE,#7B54FF,#1FA8F0);transform-origin:0 50%}
</style></head><body>
<svg width="0" height="0" style="position:absolute"><filter id="boil" x="-3%" y="-3%" width="106%" height="106%">
  <feTurbulence id="turb" type="fractalNoise" baseFrequency="0.024" numOctaves="2" seed="1"/>
  <feDisplacementMap in="SourceGraphic" scale="3.2" xChannelSelector="R" yChannelSelector="G"/></filter></svg>
<img id="paper" src="${urls.tex}/paper.webp">
${scenesHtml.replaceAll("TEX/", urls.tex + "/")}
<div class="rule" id="rule"></div>
<img class="veil" id="veil" src="${urls.tex}/veil.webp"><img class="veil" id="veil-teal" src="${urls.tex}/veil-teal.webp"><img class="veil" id="veil-blue" src="${urls.tex}/veil-blue.webp">
<div id="end"><img id="endwash" src="${urls.tex}/wash-lilac.webp">${Array.from({ length: 16 }, (_, i) => `<div class="epetal" id="e-p${i}"></div>`).join("")}<img id="bigLogo" src="${urls.logo}">
  <div id="cta">${esc(brief.cta ?? "")}</div><div id="site">${esc(brand.site ?? "")}</div></div>
<img id="lock" src="${urls.logo}">${brief.eyebrow ? `<div class="pill" id="eyebrow">${esc(brief.eyebrow.toUpperCase())}</div>` : ""}
<div id="bar"></div>
<script src="${urls.gsap}"></script>
<script>
const IDS=${JSON.stringify(ids)}, STARTS=${JSON.stringify(starts)}, ENDS=${JSON.stringify(ends)}, PAN=${JSON.stringify(pans)}, END=${endAt}, DUR=${duration};
const WASH=.62, CUES=[], T_={};
const cue=(t,type,o={})=>{CUES.push({t:+t.toFixed(3),type,...o});return t;};
const tl=gsap.timeline({paused:true});
const $=(s)=>document.querySelector(s), $$=(s)=>document.querySelectorAll(s);
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const ease=(u)=>.5-.5*Math.cos(Math.PI*clamp(u));
function draw(S,t0,span){const ps=[...$$("#"+S+" .ln")];if(!ps.length)return;const step=span/ps.length;
  ps.forEach((p,i)=>{const L=Math.ceil(p.getTotalLength())+4;gsap.set(p,{strokeDasharray:L,strokeDashoffset:L});tl.to(p,{strokeDashoffset:0,duration:Math.max(.5,step*1.8),ease:"power1.inOut"},t0+i*step);});
  cue(t0,"sketch",{dur:span+.6});}
function drawPath(sel,t,dur,c,o){const p=$(sel);if(!p)return;const L=Math.ceil(p.getTotalLength())+4;gsap.set(p,{strokeDasharray:L,strokeDashoffset:L});tl.to(p,{strokeDashoffset:0,duration:dur,ease:"power1.inOut"},c?cue(t,c,o||{}):t);}
function washes(S,t0,gap){[...$$("#"+S+" .wash")].forEach((w,i)=>tl.fromTo(w,{opacity:0,scale:.8},{opacity:+w.dataset.o*WASH,scale:1,duration:1.4,ease:"power2.out",immediateRender:false},t0+i*gap));}
function words(S,t){const ws=[...$$("#"+S+"-cap .wi")];
  ws.forEach((w,i)=>tl.fromTo(w,{y:60-i*5,opacity:0,filter:"blur(8px)"},{y:0,opacity:1,filter:"blur(0px)",duration:.5,ease:"power3.out",immediateRender:false},t+i*.055));
  $$("#"+S+"-cap .ul").forEach((u,k)=>tl.fromTo(u,{clipPath:"inset(0% 100% 0% 0%)"},{clipPath:"inset(0% 0% 0% 0%)",duration:.45,ease:"power2.inOut",immediateRender:false},t+ws.length*.055+.45+k*.2));}
function veilCut(a,b,T,v){
  tl.fromTo("#"+v,{opacity:0,scale:.12,rotation:-8},{opacity:.92,scale:1.6,rotation:0,duration:.5,ease:"power2.in",immediateRender:false},T-.5);
  tl.to("#"+v,{scale:3.2,duration:.55,ease:"power2.out"},T);
  tl.set("#"+a,{opacity:0},T); if(b) tl.set("#"+b,{opacity:1},T);
  tl.to("#"+v,{opacity:0,duration:.6,ease:"power1.out"},T+.08);
  cue(T,"bloom");}
gsap.set(".wi",{opacity:0});
${hide.length ? `gsap.set(${JSON.stringify(hide)},{opacity:0});` : ""}
tl.fromTo("#lock",{opacity:0},{opacity:1,duration:.6,immediateRender:false},.3);
${brief.eyebrow ? `tl.fromTo("#eyebrow",{opacity:0,y:-10},{opacity:1,y:0,duration:.5,immediateRender:false},cue(.9,"pop",{i:0}));` : ""}
tl.fromTo("#rule",{scaleX:0},{scaleX:1,duration:.7,ease:"power3.out",immediateRender:false},.5);
${js}
veilCut(IDS[IDS.length-1],null,END,"${lastVeil}");
tl.to(["#rule","#eyebrow","#lock"].filter(s=>$(s)),{opacity:0,duration:.3},END);
tl.set("#end",{opacity:1},END);
tl.fromTo("#endwash",{opacity:0,scale:.8},{opacity:.55,scale:1,duration:1.2,ease:"power2.out",immediateRender:false},END+.05);
tl.fromTo("#bigLogo",{opacity:0,y:20},{opacity:1,y:0,duration:.7,ease:"power3.out",immediateRender:false},cue(END+.35,"logo"));
tl.fromTo("#cta",{opacity:0,xPercent:-50,y:30},{opacity:1,xPercent:-50,y:0,duration:.45,ease:"back.out(1.6)",immediateRender:false},cue(END+.9,"tap"));
tl.fromTo("#site",{opacity:0},{opacity:1,duration:.4,immediateRender:false},END+1.1);
tl.to("#bigLogo",{scale:1.05,duration:Math.max(.5,DUR-END-1),ease:"sine.inOut"},END+1);
tl.fromTo("#bar",{scaleX:0},{scaleX:1,duration:DUR,ease:"none"},0);
tl.set({},{},DUR);

const el={};const g=(id)=>el[id]??=document.getElementById(id);
const setT=(id,v)=>{const e=g(id);if(e)e.setAttribute("transform",v);};
const css=(id,v)=>{const e=g(id);if(e)e.style.transform=v;};
const WB=[...$$(".wb")];
function life(t){
  IDS.forEach((S,i)=>{const a=STARTS[i],b=ENDS[i],p=PAN[i],u=ease((t-a)/(b-a+.9));
    const cx=p.x*u+Math.sin(t*.5+a)*12,cy=p.y*u+Math.sin(t*.37+a)*8;
    css(S+"-art","scale("+(1+p.s*u).toFixed(4)+")");
    css(S+"-bg","translate("+(cx*.35).toFixed(1)+"px,"+(cy*.35).toFixed(1)+"px)");
    css(S+"-mid","translate("+(cx*.6).toFixed(1)+"px,"+(cy*.6).toFixed(1)+"px)");
    css(S+"-fg","translate("+(cx*1.35).toFixed(1)+"px,"+(cy*1.35).toFixed(1)+"px)");
    css(S+"-cap","translateY("+(-16*u).toFixed(1)+"px)");});
  g("turb").setAttribute("seed",String(1+Math.floor(t*8)%7));
  WB.forEach((w,i)=>{w.style.transform="scale("+(1+.05*Math.sin(t*.8+i*1.7)).toFixed(4)+") translate("+(11*Math.sin(t*.6+i)).toFixed(1)+"px,"+(6*Math.sin(t*.45+i*2)).toFixed(1)+"px) rotate("+(2*Math.sin(t*.3+i)).toFixed(2)+"deg)";});
  ${life}
  {const w=g("endwash");if(w&&t>END+1.3)w.style.transform="scale("+(1+.06*Math.sin((t-END)*1.3)).toFixed(4)+") rotate("+(3*Math.sin((t-END)*.7)).toFixed(2)+"deg)";}
  {const b=g("cta");if(b&&t>END+1.4)b.style.marginTop=(5*Math.sin((t-END)*3)).toFixed(1)+"px";}
  for(let i=0;i<16;i++){const e=g("e-p"+i);if(!e)continue;const s=t-END-.2;if(s<0){e.style.opacity=0;continue;}
    const x=100+(i*131)%880+30*Math.sin(t*1.4+i),y=300+((s*120+i*83)%1150);
    e.style.transform="translate("+x.toFixed(1)+"px,"+y.toFixed(1)+"px) rotate("+(50*Math.sin(t*2+i)).toFixed(0)+"deg)";e.style.opacity=(.7*clamp(s*2)).toFixed(3);}
}
window.REEL_DURATION=DUR;
window.REEL_CUES=CUES.sort((a,b)=>a.t-b.t);
window.setFrame=(t)=>{tl.seek(t,false);life(t);};
window.setFrame(0);
</script></body></html>`;
}
