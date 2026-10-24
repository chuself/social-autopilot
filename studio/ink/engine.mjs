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
import { makeLedger, tokens, orderLines, hash, money } from "../numbers.mjs";
import { ROLE, WEIGHT } from "../scenes.mjs";
import { planCuts } from "../timing.mjs";
import { figure, glass, CITIES, cityKey, PROPS, CITY_ACCENT } from "./art.mjs";

const W = 1080, H = 1920;
const INK = "#1E2350", INK_SOFT = "#5A5F86", RED = "#B8325A", TEAL_INK = "#138476";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const pick = (seed, list) => list[hash(seed) % list.length];

// Drawn cards speak the reel's language. (The photo studio rebuilds the real
// app screens, which ship in English; a drawing is not a screenshot.)
const SW = {
  "POS · BAR & RESTAURANT · ROOM": "POS · BAA NA MGAHAWA · CHUMBA", each: "kila moja", Total: "Jumla",
  "Posted to room {room}": "Imeingia chumba {room}", "MENU · ROOM": "MENYU · CHUMBA", "Stay PIN": "PIN ya mgeni",
  "Approved · bill to room": "Imeidhinishwa · bili ya chumba", "FOLIO · ROOM": "BILI · CHUMBA", "Room rate / night": "Bei ya chumba / usiku",
  "Charged / night": "Imetozwa / usiku", Due: "Kulipa", "Correct rate applied": "Bei sahihi imewekwa", REPORTS: "RIPOTI", "Reports Hub": "Ripoti",
  "Revenue · today, by outlet": "Mapato · leo, kwa idara", "Occupancy · rooms, live": "Vyumba · hali ya sasa", "Folio audit · every change": "Ukaguzi · kila badiliko",
  "Guests · arrivals": "Wageni · wanaowasili", "FRONT DESK · LIVE": "MAPOKEZI · SASA", OCCUPANCY: "VILIVYOJAA", "ROOMS FREE": "VYUMBA WAZI", "CHECK-INS": "WANAOINGIA",
  Room: "Chumba", READY: "TAYARI", Occupied: "Kuna mgeni", Dirty: "Chafu", Clean: "Safi", pax: "wageni", "Deposit cleared": "Amana imelipwa",
  "Board meeting": "Kikao cha bodi", "Wedding reception": "Sherehe ya harusi", "Training workshop": "Warsha ya mafunzo", "Product launch": "Uzinduzi",
  "Graduation lunch": "Chakula cha mahafali", Seated: "Wapo", Free: "Wazi", Reserved: "Imehifadhiwa", "No-show": "Hajafika", "No-show released": "Haikuja · imeachiwa",
  "Grilled tilapia": "Sato wa kuchoma", "Chicken pilau": "Pilau ya kuku", Chips: "Chipsi", "Fresh juice": "Juisi", Coffee: "Kahawa",
  "Mixed grill": "Nyama choma", "Fruit platter": "Matunda", "Vegetable curry": "Mchuzi wa mboga", "Approved at front desk": "Imeidhinishwa na mapokezi", "Sent · awaiting front desk": "Imetumwa · inasubiri mapokezi", "Revenue today": "Mapato ya leo", "KITCHEN · LIVE": "JIKONI · SASA", "HOUSEKEEPING · LIVE": "USAFI · SASA", "EVENTS · TODAY": "MATUKIO · LEO", "FLOOR · TONIGHT": "MEZA · USIKU HUU", "The restaurant's booking link": "Kiungo cha uhifadhi", "Today's requests": "Maombi ya leo", "Your hotel, live": "Hoteli yako, sasa hivi", "Book a table": "Hifadhi meza", "Party": "Watu",
  "Time": "Saa", "Request a table": "Omba meza", "Confirmed": "Imethibitishwa", "Today": "Leo",
};
const tr = (c, en) => (c.lang === "sw" && SW[en]) || en;
// order lines with the dish names in the reel's language
const localLines = (c) => orderLines(c.ledger).map((l) => {
  const name = l.label.replace(/^\d+\s*×\s*/, "");
  return { ...l, label: l.label.replace(name, tr(c, name)) };
});

// Time of day sets the sky and the warmth of the washes.
const PALETTES = {
  morning: { sky: "wash-sky", warm: "wash-lilac", glow: "wash-teal" },
  golden: { sky: "wash-rose", warm: "wash-magenta", glow: "wash-lilac" },
  blue: { sky: "wash-blue", warm: "wash-violet", glow: "wash-sky" },
  lilac: { sky: "wash-lilac", warm: "wash-rose", glow: "wash-sky" },
  dusk: { sky: "wash-dusk", warm: "wash-blue", glow: "wash-teal" },
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

/** Payoff moments a brief may ask for. */
export { VARIANTS };
export const MOMENTS = ["toast", "farewell", "sunrise", "desk", "dinner", "owner"];

/**
 * A prop from art.mjs as SVG: a paper-coloured fill so the scenery behind does
 * not show through, its watercolour, then the ink lines (class "ln", so they
 * are drawn on with the rest of the scene). Faded in by the scene's timeline.
 */
function propSvg(S, name, cx, cy, scale, key = "p") {
  const p = PROPS[name](cx, cy);
  const [wn, wx, wy, ww, wh] = p.wash;
  return `<g id="${S}-${key}g" style="transform-box:view-box;transform-origin:0 0"><g style="transform-box:view-box;transform-origin:0 0" transform="translate(${cx} ${cy}) scale(${scale}) translate(${-cx} ${-cy})">
    <path class="pfill" d="${p.fill}"/>
    <image class="pwash" href="TEX/${wn}.webp" x="${wx}" y="${wy}" width="${ww}" height="${wh}" preserveAspectRatio="none"/>
    <path class="pl" d="${p.d}" stroke-width="${(3.4 / scale).toFixed(2)}"/><path class="pl" d="${p.fine}" stroke-width="${(1.8 / scale).toFixed(2)}"/></g></g>`;
}

// ── devices: the frame a product screen is drawn in ─────────────────────────
// A screen can appear on several devices, and a reel never repeats one, so two
// reels about the same feature (or two screens in one reel) do not share a
// layout. Coordinates are the art box (1080 x 1000). The outline is an ink
// line drawn on with the scene; the content is HTML laid out for the device.

const rrect = (w, h, r) => `M${r} 0 H${w - r} A${r} ${r} 0 0 1 ${w} ${r} V${h - r} A${r} ${r} 0 0 1 ${w - r} ${h} H${r} A${r} ${r} 0 0 1 0 ${h - r} V${r} A${r} ${r} 0 0 1 ${r} 0 Z`;
const DEVICES = {
  phone: { x: 320, y: 110, w: 440, h: 800, rot: 0, pad: "64px 30px 36px", wide: false, outline: (w, h) => `${rrect(w, h, 48)} M${w / 2 - 40} 28 h80`, family: "phone" },
  phoneTilt: { x: 290, y: 120, w: 430, h: 780, rot: -5, pad: "62px 28px 34px", wide: false, outline: (w, h) => `${rrect(w, h, 46)} M${w / 2 - 40} 28 h80`, family: "phone",
    dress: { lines: [{ d: "M720 980 C716 900 726 860 750 820 L790 750 C800 734 820 740 816 758 L800 820", w: 2.6 }], washes: [] } },
  tablet: { x: 150, y: 200, w: 780, h: 580, rot: 1.5, pad: "32px 46px 26px", wide: true, outline: (w, h) => `${rrect(w, h, 32)} M${w / 2 - 8} 20 a8 8 0 1 0 16 0 a8 8 0 1 0 -16 0`, family: "tablet",
    dress: { lines: [{ d: "M40 860 L1040 850 M40 900 L1040 890", w: 2.4 }], washes: [] } },
  laptop: { x: 160, y: 160, w: 760, h: 530, rot: 0, pad: "34px 40px", wide: true, outline: (w, h) => rrect(w, h, 18), family: "laptop",
    dress: { lines: [{ d: "M60 720 L1020 720 L1060 790 L20 790 Z M460 755 h160", w: 2.6 }, { d: "M960 640 L960 700 C960 716 1010 716 1010 700 L1010 640 Z M1010 652 C1030 652 1030 682 1010 682", w: 2.2 }], washes: [] } },
  board: { x: 150, y: 170, w: 780, h: 660, rot: -1.5, pad: "60px 52px 40px", wide: true, outline: (w, h) => `M4 6 L${w - 6} 0 L${w} ${h - 4} L0 ${h} Z M${w * 0.25 - 10} 18 a10 10 0 1 0 20 0 a10 10 0 1 0 -20 0 M${w * 0.75 - 10} 14 a10 10 0 1 0 20 0 a10 10 0 1 0 -20 0`, family: "board",
    dress: { lines: [{ d: "M0 120 L1080 110 M0 900 L1080 890", w: 2 }], washes: [] } },
  kds: { x: 150, y: 180, w: 780, h: 550, rot: 0, pad: "34px 36px", wide: true, outline: (w, h) => `${rrect(w, h, 14)} M${w / 2 - 50} ${h} V${h + 50} M${w / 2 + 50} ${h} V${h + 50} M${w / 2 - 140} ${h + 50} H${w / 2 + 140}`, family: "kds",
    dress: { lines: [{ d: "M40 860 L1040 840 M40 900 L1040 880", w: 2.4 }, { d: "M150 840 C150 800 230 800 230 840 M820 836 a40 16 0 1 0 80 0 a40 16 0 1 0 -80 0", w: 1.8 }], washes: [] } },
};

// Which devices each screen may use. Legacy full-scene drawings (the pass rail,
// the corridor, the wall calendar, the floor plan) are variants too.
const VARIANTS = {
  frontdesk: ["laptop", "tablet", "phone"],
  reports: ["phone", "tablet", "laptop"],
  menu: ["phone", "phoneTilt", "tablet"],
  booking: ["phoneTilt", "laptop", "phone"],
  kitchen: ["rail", "kds", "board"],
  housekeeping: ["corridor", "board", "phone"],
  events: ["wall", "laptop", "phoneTilt"],
  tables: ["floor", "tablet"],
};
const familyOf = (v) => DEVICES[v]?.family ?? v;
function chooseVariant(screen, c, h, forced) {
  const list = VARIANTS[screen] ?? VARIANTS.frontdesk;
  if (list.includes(forced)) { c.used.push(familyOf(forced)); return forced; }
  for (let k = 0; k < list.length; k++) {
    const v = list[(h + k) % list.length];
    if (!c.used.includes(familyOf(v))) { c.used.push(familyOf(v)); return v; }
  }
  return list[h % list.length];
}

const chart = (S, w = 380) => `<svg class="csv ci" viewBox="0 0 ${w} 150" width="100%" preserveAspectRatio="none">
  <path id="${S}-spark" class="spk" d="M10 70 C${w * 0.12} 58 ${w * 0.18} 66 ${w * 0.28} 52 C${w * 0.38} 38 ${w * 0.44} 50 ${w * 0.55} 34 C${w * 0.66} 20 ${w * 0.74} 30 ${w * 0.84} 18 C${w * 0.9} 12 ${w * 0.95} 14 ${w - 10} 8"/>
  ${[0, 1, 2, 3, 4].map((i) => `<rect class="bar" id="${S}-bar${i}" x="${20 + i * (w - 40) / 5}" y="146" width="${(w - 40) / 5 - 18}" height="0"/>`).join("")}</svg>`;
const stamp = (S, text) => `<div class="stamp2" id="${S}-ok">${text}</div>`;
const flipSpan = (S, a, b) => `<span class="flip" id="${S}-fl"><span class="fa">${a}</span><span class="fb">${b}</span></span>`;

/** The content of a product screen, laid out for a narrow or a wide device. */
function screenContent(S, s, c, h, wide) {
  const sc = s.screen ?? "frontdesk";
  if (sc === "reports") {
    const rows = ["Revenue · today, by outlet", "Occupancy · rooms, live", "Folio audit · every change", "Guests · arrivals"];
    return {
      html: `<div class="fhead ci">${tr(c, "REPORTS")}</div><div class="cols"><div><div class="rtitle ci">${tr(c, "Reports Hub")}</div>
        <div class="rbig ci"><i>${tr(c, "Revenue today")}</i><b>${esc(c.revenue)}</b></div>${chart(S, wide ? 420 : 380)}</div>
        <div>${rows.slice(0, wide ? 4 : 3).map((r) => `<div class="rrow ci">${esc(tr(c, r))}</div>`).join("")}</div></div>`,
      chart: true, shows: [c.revenue],
    };
  }
  if (sc === "menu") {
    const lines = localLines(c);
    return {
      html: `<div class="fhead ci">${tr(c, "MENU · ROOM")} ${esc(c.T["{room}"])}</div><div class="pin ci">${tr(c, "Stay PIN")} <span class="dots">${[0, 1, 2, 3].map((k) => `<i id="${S}-d${k}"></i>`).join("")}</span></div><div class="cols"><div>
        ${lines.map((l) => `<div class="bline ci"><span>${esc(l.label)}<i class="each">${esc(l.each)} ${tr(c, "each")}</i></span><span class="bval">${esc(l.value)}</span></div>`).join("")}
        <div class="btot ci"><span>${tr(c, "Total")}</span><span class="bval">${esc(c.T["{orderTotal}"])}</span></div></div>
        <div>${stamp(S, tr(c, "Sent · awaiting front desk"))}</div></div>`,
      pin: true, stamp: true, shows: lines.flatMap((l) => [l.label, l.each, l.value]),
    };
  }
  if (sc === "booking") {
    const party = 2 + (h % 5), time = ["19:00", "19:30", "20:00", "20:30"][(h >>> 4) % 4];
    return {
      html: `<div class="bklink ci">🔗 ${tr(c, "The restaurant's booking link")}</div><div class="cols"><div>
        <div class="fhead ci">${tr(c, "Book a table")}</div>
        <div class="frow ci"><span>${tr(c, "Party")}</span><b>${party}</b></div>
        <div class="frow ci"><span>${tr(c, "Today")} · ${tr(c, "Time")}</span><b>${time}</b></div>
        <div class="bkbtn ci" id="${S}-btn">${tr(c, "Request a table")}</div>${stamp(S, tr(c, "Confirmed"))}</div>
        <div><div class="fhead ci">${tr(c, "Today's requests")}</div>${[["18:30", 2], ["20:00", 6]].map(([tm, n]) => `<div class="frow ci"><span>${tm}</span><span>${n} ${tr(c, "pax")}</span></div>`).join("")}</div></div>`,
      stamp: true, tap: true, shows: [String(party), time, "18:30", "2", "20:00", "6"],
    };
  }
  if (sc === "kitchen") {
    const dishes = localLines(c).map((l) => l.label);
    const codes = [`${tr(c, "Room")} ${c.T["{room}"]}`, "T-12", "Bar 03", "T-04"];
    const n = 2;
    const tickets = codes.slice(0, n).map((code, i) => ({ code, items: [dishes[i % dishes.length], dishes[(i + 1) % dishes.length]], age: `0${2 + i * 2}:${String(10 + ((h >>> (i * 4)) % 49)).padStart(2, "0")}` }));
    return {
      html: `<div class="fhead ci">${tr(c, "KITCHEN · LIVE")}</div><div class="tks">${tickets.map((t, i) => `<div class="ktk ci"><b>${esc(t.code)}</b>${t.items.map((x) => `<span>${esc(x)}</span>`).join("")}<i>${t.age}</i>${i === 0 ? `<u>✓ ${tr(c, "Approved at front desk")}</u>` : ""}${i === n - 1 ? stamp(S, tr(c, "READY")) : ""}</div>`).join("")}</div>`,
      stamp: true, shows: tickets.flatMap((t) => [t.code, t.age, ...t.items]),
    };
  }
  if (sc === "housekeeping") {
    const base = 100 * (1 + (h % 3)) + 1, states = ["Occupied", "Dirty", "Clean", "Occupied", "Clean", "Dirty", "Occupied", "Clean"];
    const rooms = Array.from({ length: wide ? 8 : 6 }, (_, i) => ({ no: String(base + i), st: states[(i + (h >>> 5)) % states.length] }));
    const flip = rooms.findIndex((r) => r.st === "Dirty");
    return {
      html: `<div class="fhead ci">${tr(c, "HOUSEKEEPING · LIVE")}</div><div class="hks">${rooms.map((r, i) => `<div class="hk ci hk-${i === flip ? "dirty" : r.st.toLowerCase()}"><b>${r.no}</b>${i === flip ? flipSpan(S, tr(c, "Dirty"), tr(c, "Clean")) : `<span>${tr(c, r.st)}</span>`}</div>`).join("")}</div>`,
      flip: true, shows: rooms.map((r) => r.no),
    };
  }
  if (sc === "events") {
    const kinds = [["Board meeting", 20], ["Wedding reception", 180], ["Training workshop", 40], ["Product launch", 60], ["Graduation lunch", 120]];
    const evs = ["09:00", "12:30", "18:00"].map((time, i) => ({ time, name: kinds[(i + (h >>> 2)) % kinds.length][0], pax: kinds[(i + (h >>> 2)) % kinds.length][1], chip: i === 1 ? "Deposit cleared" : "" }));
    return {
      html: `<div class="fhead ci">${tr(c, "EVENTS · TODAY")}</div>${evs.map((e) => `<div class="ev ci"><b>${e.time}</b><span>${esc(tr(c, e.name))}<i>${e.pax} ${tr(c, "pax")}</i></span>${e.chip ? `<em>${tr(c, e.chip)}</em>` : ""}</div>`).join("")}`,
      shows: evs.flatMap((e) => [e.time, `${e.pax} pax`]),
    };
  }
  if (sc === "tables") {
    const tbl = [["T1", "Seated"], ["T2", "Free"], ["T3", "Seated"], ["T4", "Free"], ["T5", "No-show"], ["T6", "Seated"]];
    return {
      html: `<div class="fhead ci">${tr(c, "FLOOR · TONIGHT")}</div><div class="tbs">${tbl.map(([n, st]) => `<div class="htb ci htb-${st === "No-show" ? "ns" : st.toLowerCase()}"><b>${n}</b>${st === "No-show" ? flipSpan(S, tr(c, "No-show"), tr(c, "Free")) : `<span>${tr(c, st)}</span>`}</div>`).join("")}</div>`,
      flip: true, shows: tbl.map(([n]) => n),
    };
  }
  // front desk: every figure computed from one room count
  const rooms = [14, 16, 18, 20, 24][h % 5], occ = Math.round(rooms * (0.62 + ((h >>> 4) % 25) / 100));
  const guests = [["Amina K.", 101], ["Joseph M.", 104], ["Neema S.", 107], ["David O.", 110], ["Rehema J.", 112]].slice((h >>> 8) % 3, ((h >>> 8) % 3) + 3);
  const kpis = [["OCCUPANCY", `${Math.round((occ / rooms) * 100)}%`], ["ROOMS FREE", String(rooms - occ)], ["CHECK-INS", String(guests.length)]];
  return {
    html: `<div class="fhead ci">${tr(c, "FRONT DESK · LIVE")}</div><div class="kpis">${kpis.map(([k, v]) => `<div class="kpi ci"><i>${tr(c, k)}</i><b>${v}</b></div>`).join("")}</div>
      ${guests.map(([n, rm]) => `<div class="grow ci"><span>${esc(n)}</span><span>${tr(c, "Room")} ${rm}</span></div>`).join("")}`,
    shows: [...kpis.map((k) => k[1]), ...guests.map((g2) => `Room ${g2[1]}`)],
  };
}

/** A product screen on a device: outline, content, entrances, the one thing that happens, and life. */
function deviceScreen(S, s, c, h, variant) {
  const d = DEVICES[variant];
  const k = screenContent(S, s, c, h, d.wide);
  const at = `a+Math.min(Math.max(1.9,(b-a)*.62),b-a-.7)`;
  return {
    bg: { lines: d.dress?.lines ?? [], washes: [[c.pal.sky, -60, 60, 1200, 520, 0.4], [c.pal.warm, 40, 600, 1000, 360, 0.5]], actors: "" },
    mid: { lines: [], washes: [[c.pal.glow, d.x + 40, d.y + 40, d.w - 80, d.h - 80, 0.45], ["wash-violet-b", d.x + d.w - 200, d.y - 60, 300, 300, 0.4]], actors: "" },
    fg: { lines: [], washes: [], actors: sparks(S, [[d.x - 40, d.y + 60, 13], [d.x + d.w + 30, d.y + d.h - 80, 15]]) },
    over: `<div class="dev${d.wide ? " wide" : ""} dv-${variant}" id="${S}-dev" style="left:${d.x}px;top:${d.y}px;width:${d.w}px;height:${d.h}px;transform:rotate(${d.rot}deg)">
      <svg class="dsv" viewBox="0 0 ${d.w} ${d.h}" width="${d.w}" height="${d.h}"><path class="ln" d="${d.outline(d.w, d.h)}" stroke-width="3.2"/></svg>
      <div class="dct" style="padding:${d.pad}">${k.html}</div></div>`,
    js: `draw(S,a+.1,.8);washes(S,a+.2,.25);words(S,a+.25);
      {const items=$$("#"+S+"-dev .ci");tl.fromTo(items,{opacity:0,y:16},{opacity:1,y:0,duration:.4,stagger:Math.min(.14,1.1/Math.max(1,items.length)),ease:"power3.out",immediateRender:false},cue(a+.7,"card"));}
      ${k.chart ? `drawPath("#"+S+"-spark",a+1.0,1.0,"draw");${[0, 1, 2, 3, 4].map((i) => `tl.to("#"+S+"-bar${i}",{attr:{height:${[46, 70, 58, 92, 118][i]},y:${146 - [46, 70, 58, 92, 118][i]}},duration:.6,ease:"power3.out"},a+1.2+${i}*.1);`).join("")}` : ""}
      ${k.pin ? `[0,1,2,3].forEach((q)=>tl.to("#"+S+"-d"+q,{backgroundColor:"${TEAL_INK}",scale:1.15,duration:.12,ease:"none"},q?a+1.3+q*.12:cue(a+1.3,"tap")));` : ""}
      ${k.tap ? `tl.to("#"+S+"-btn",{scale:.94,duration:.08,yoyo:true,repeat:1,ease:"none"},cue(a+Math.min(1.8,(b-a)*.45),"tap"));` : ""}
      ${k.stamp ? `tl.fromTo("#"+S+"-ok",{opacity:0,scale:1.8,rotation:-8},{opacity:1,scale:1,rotation:-4,duration:.2,ease:"power4.in",immediateRender:false},cue(${at},"stamp")-.2);` : ""}
      ${k.flip ? `gsap.set("#"+S+"-fl .fb",{yPercent:110});{const at=${at};tl.to("#"+S+"-fl .fa",{yPercent:-110,duration:.32,ease:"power2.inOut"},cue(at,"flip"));tl.to("#"+S+"-fl .fb",{yPercent:0,duration:.32,ease:"power2.inOut"},at);}` : ""}`,
    life: sparkLife(2) + `css(S+"-dev","rotate("+(${d.rot}+.7*Math.sin(t*.8)).toFixed(2)+"deg) translateY("+(8*Math.sin(t*1.2)).toFixed(1)+"px)");`,
    hide: [`#${S}-dev .ci`, ...(k.stamp ? [`#${S}-ok`] : [])],
    shows: k.shows,
    variant,
  };
}

// ── scene templates ─────────────────────────────────────────────────────────
// Each returns { bg, mid, fg (layers: lines, washes, actors), over (HTML in
// the mid layer), js (timeline), life (per-frame), shows (computed numbers) }.
const SCENE = {
  place(S, s, c) {
    const city = CITIES[c.city], near = city.near(S), pal = PALETTES[c.tod];
    // The hook object, large and in front: the city sets the scene, the prop tells the story.
    const prop = PROPS[s.prop] ? s.prop : null;
    // the city's own people step aside so the prop reads alone (an "empty table" must look empty)
    const fg = prop ? { ...near.fg, actors: propSvg(S, prop, 540, 690, prop === "table" ? 1.05 : 1.45) } : near.fg;
    return {
      bg: { lines: city.far.lines, washes: [[pal.sky, -80, 90, 1240, 640, 0.8], ...city.far.washes], actors: cloudActors(S) + birdActors(S) },
      mid: near.mid, fg,
      // pinned to the frame, not the moving art, so the camera never carries it out of the safe area
      fixed: s.tag ? `<div class="place" id="${S}-tag" style="top:1180px"><i></i>${esc(s.tag)}</div>` : "",
      js: `draw(S,a+.15,2.3);washes(S,a+.45,.28);words(S,a+.55);${s.tag ? `tl.fromTo("#"+S+"-tag",{opacity:0,x:-30},{opacity:1,x:0,duration:.5,immediateRender:false},cue(a+.7,"pop",{i:1}));tl.to("#"+S+"-tag",{opacity:0,duration:.3},b-.6);` : ""}
        ${prop ? `drawProp(S,a+.2,.9);tl.fromTo("#"+S+" .pfill",{opacity:0},{opacity:.95,duration:.4,immediateRender:false},a+.15);tl.fromTo("#"+S+" .pwash",{opacity:0},{opacity:.55,duration:.9,immediateRender:false},a+.7);` : ""}`,
      life: skyLife + near.life + (prop ? `setT(S+"-pg","translate(0 "+(7*Math.sin(t*1.3)).toFixed(1)+") rotate("+(1.4*Math.sin(t*.8)).toFixed(2)+" 540 690)");` : ""),
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
      over: `<div class="fol fcard" id="${S}-fol" style="${box}"><div class="fhead">${tr(c, "FOLIO · ROOM")} ${esc(T["{room}"])}</div>
        <div class="frow"><span>${tr(c, "Room rate / night")}</span><span>${esc(T["{rightRate}"])}</span></div>
        <div class="frow"><span>${tr(c, "Charged / night")}</span>${flip(S + "-f1", T["{wrongRate}"], T["{rightRate}"])}</div>
        <div class="frow tot"><span>${tr(c, "Due")}<i>${flip(S + "-f2", T["{wrongSum}"], T["{rightSum}"])}</i></span>${flip(S + "-f3", T["{wrongTotal}"], T["{rightTotal}"])}</div>
        <svg class="tick" viewBox="0 0 120 120" style="left:calc(50% - 60px)"><path id="${S}-tick" d="M60 60 m-40 0 a40 40 0 1 0 80 0 a40 40 0 1 0 -80 0 M40 62 L55 77 L82 46"/></svg>
        <div class="ok" id="${S}-ok">${esc(c.fill(s.okChip ?? tr(c, "Correct rate applied")))}</div></div>`,
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
    const lines = localLines(c);
    const bg = v === "bar"
      ? { lines: [{ d: "M40 210 L1040 210 M40 330 L1040 330", w: 2.2 }, { d: [100, 190, 280, 760, 850, 940].map((x) => `M${x} 205 C${x - 14} 160 ${x + 14} 160 ${x} 205 M${x} 160 L${x} 140`).join(" ") + " " + [130, 230, 800, 900].map((x) => `M${x} 325 C${x - 12} 290 ${x + 12} 290 ${x} 325`).join(" "), w: 1.6 }],
        washes: [["wash-lilac", 40, 120, 1000, 260, 0.5]], actors: `<g id="${S}-lamp0"><path d="M300 70 L300 120 M260 120 L340 120 L320 160 L280 160 Z" stroke-width="2"/></g><g id="${S}-lamp1"><path d="M780 70 L780 120 M740 120 L820 120 L800 160 L760 160 Z" stroke-width="2"/></g>` }
      : { lines: [{ d: "M80 700 C300 660 780 660 1000 700", w: 2.4 }, { d: "M200 640 a60 22 0 1 0 120 0 a60 22 0 1 0 -120 0 M760 640 a60 22 0 1 0 120 0 a60 22 0 1 0 -120 0 M560 380 C560 340 600 340 600 380 L600 470 L560 470 Z", w: 1.8 }],
        washes: [["wash-rose", 100, 560, 880, 260, 0.45]], actors: "" };
    return {
      bg,
      mid: { lines: v === "bar" ? [{ d: "M0 820 L1080 790 M0 860 L1080 830", w: 3 }, { d: "M160 860 L160 1000 M120 1000 L200 1000 M520 850 L520 1000 M480 1000 L560 1000 M880 840 L880 1000 M840 1000 L920 1000", w: 2 }] : [{ d: "M60 760 L1020 740", w: 3 }],
        washes: [[c.pal.warm, 160, 300, 760, 560, 0.4]], actors: "" },
      fg: { lines: [], washes: [], actors: sparks(S, [[200, 420, 12], [880, 470, 14]]) },
      over: `<div class="fol fcard pos" id="${S}-pos" style="left:250px;top:330px;width:580px"><div class="fhead">${esc(tr(c, "POS · BAR & RESTAURANT · ROOM"))} ${esc(c.T["{room}"])}</div>
        ${lines.map((l, i) => `<div class="bline" id="${S}-l${i}"><span>${esc(l.label)}<i class="each">${esc(l.each)} ${tr(c, "each")}</i></span><span class="bval">${esc(l.value)}</span></div>`).join("")}
        <div class="btot"><span>${tr(c, "Total")}</span><span class="bval">${esc(c.T["{orderTotal}"])}</span></div>
        <div class="ok" id="${S}-ok" style="position:relative;top:auto;margin-top:22px">${esc(c.fill(s.okChip ?? tr(c, "Posted to room {room}")))}</div></div>`,
      js: `draw(S,a+.15,1.2);washes(S,a+.25,.3);words(S,a+.25);
        tl.fromTo("#"+S+"-pos",{opacity:0,y:40,rotation:3},{opacity:1,y:0,rotation:-1.5,duration:.7,ease:"power3.out",immediateRender:false},cue(a+.6,"card"));
        ${lines.map((_, i) => `tl.fromTo("#"+S+"-l${i}",{opacity:0,x:30},{opacity:1,x:0,duration:.4,ease:"power3.out",immediateRender:false},cue(a+1.1+${i}*.3,"flip"));`).join("")}
        tl.fromTo("#"+S+"-ok",{opacity:0,scale:.8},{opacity:1,scale:1,duration:.45,ease:"back.out(2)",immediateRender:false},cue(a+Math.max(2.4,(b-a)*.5),"match"));`,
      life: sparkLife(2) + `css(S+"-pos","rotate("+(-1.5+.8*Math.sin(t*1.1)).toFixed(2)+"deg) translateY("+(5*Math.sin(t*.9)).toFixed(1)+"px)");
        for(const k of [0,1]){setT(S+"-lamp"+k,"rotate("+(4*Math.sin(t*1.3+k*1.7)).toFixed(2)+" "+(k?780:300)+" 70)");}`,
      hide: [`#${S}-pos`, `#${S}-ok`, ...lines.map((_, i) => `#${S}-l${i}`)],
      shows: lines.flatMap((l) => [l.label, l.each, l.value]),
    };
  },

  "ui-screen"(S, s, c) {
    const h = hash(c.seed + S);
    const variant = chooseVariant(s.screen ?? "frontdesk", c, h, s.device);
    if (DEVICES[variant]) return deviceScreen(S, s, c, h, variant);
    if (s.screen === "kitchen") {
      // paper tickets on the pass rail, the last one stamped ready
      const dishes = localLines(c).map((l) => l.label);
      const codes = [`${tr(c, "Room")} ${c.T["{room}"]}`, "T-12", "Bar 03", "T-04"];
      const tickets = [0, 1, 2].map((i) => ({ code: codes[i], items: [dishes[i % dishes.length], dishes[(i + 1) % dishes.length]], age: `0${2 + i * 2}:${String(10 + ((h >>> (i * 4)) % 49)).padStart(2, "0")}` }));
      return {
        bg: { lines: [{ d: "M40 760 L1040 740 M40 800 L1040 780", w: 2.6 }, { d: "M120 740 C120 700 200 700 200 740 M300 736 C300 690 360 690 360 736 M780 726 a40 18 0 1 0 80 0 a40 18 0 1 0 -80 0", w: 1.8 }], washes: [[c.pal.warm, 40, 560, 1000, 300, 0.4]], actors: `<path class="actor" id="${S}-s0" d="" stroke-width="1.6"/><path class="actor" id="${S}-s1" d="" stroke-width="1.6"/>` },
        mid: { lines: [{ d: "M60 200 L1020 200", w: 3.2 }, { d: "M60 200 L60 170 M1020 200 L1020 170", w: 2.4 }], washes: [["wash-teal", 120, 220, 840, 420, 0.3]], actors: "" },
        fg: { lines: [], washes: [], actors: sparks(S, [[150, 640, 12], [960, 600, 14]]) },
        over: tickets.map((t, i) => `<div class="kt" id="${S}-kt${i}" style="left:${140 + i * 270}px"><b>${esc(t.code)}</b>${t.items.map((x) => `<span>${esc(x)}</span>`).join("")}<i>${esc(t.age)}</i>${i === 0 ? `<u>✓ ${tr(c, "Approved at front desk")}</u>` : ""}${i === 2 ? `<em id="${S}-ready">${tr(c, "READY")}</em>` : ""}</div>`).join(""),
        js: `draw(S,a+.15,1.0);washes(S,a+.25,.3);words(S,a+.25);
          ${tickets.map((_, i) => `tl.fromTo("#"+S+"-kt${i}",{opacity:0,y:-60,rotation:${i - 1}*6},{opacity:1,y:0,rotation:${(i - 1) * 2},duration:.55,ease:"back.out(1.5)",immediateRender:false},${i ? "" : "cue("}a+.8+${i}*.3${i ? "" : ',"card")'});`).join("")}
          tl.fromTo("#"+S+"-ready",{opacity:0,scale:2},{opacity:.95,scale:1,duration:.17,ease:"power4.in",immediateRender:false},cue(a+Math.min(Math.max(1.9,(b-a)*.6),b-a-.7),"stamp")-.17);`,
        life: sparkLife(2) + `for(let i=0;i<3;i++)css(S+"-kt"+i,"rotate("+((i-1)*2+1.6*Math.sin(t*1.3+i*1.1)).toFixed(2)+"deg)");
          for(const k of [0,1]){const e=g(S+"-s"+k);if(!e)continue;let d="";const x0=160+k*640;for(let j=0;j<=12;j++){const y=700-j*7,x=x0+8*Math.sin(j*.55-t*3.2+k*2);d+=(j?" L":"M")+x.toFixed(1)+" "+y.toFixed(1);}e.setAttribute("d",d);e.style.opacity=(clamp((t-a-1)*1.2)*(.5+.25*Math.sin(t*2+k))).toFixed(3);}`,
        hide: [...tickets.map((_, i) => `#${S}-kt${i}`), `#${S}-ready`],
        shows: tickets.flatMap((t) => [t.code, t.age, ...t.items]),
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
        over: doors.map((d, i) => `<div class="door" id="${S}-d${i}" style="left:${xs[i] + 5}px">${esc(d.no)}${i === flip ? `<span class="flip"><span class="fa">${tr(c, "Dirty")}</span><span class="fb">${tr(c, "Clean")}</span></span>` : `<span>${tr(c, d.st)}</span>`}</div>`).join(""),
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
    if (s.screen === "tables") {
      // the restaurant floor from above: six tables, one reserved; the no-show is released
      const tbl = [["T1", 280, 320, "Seated"], ["T2", 540, 320, "Free"], ["T3", 800, 320, "Seated"], ["T4", 280, 630, "Free"], ["T5", 540, 630, "Reserved"], ["T6", 800, 630, "Seated"]];
      const flip = 4;
      const ring = (x, y, r) => `M${x - r} ${y} a${r} ${r} 0 1 0 ${2 * r} 0 a${r} ${r} 0 1 0 ${-2 * r} 0`;
      const chairs = (x, y) => [[0, -104], [0, 104], [-104, 0], [104, 0]].map(([dx, dy]) => ring(x + dx, y + dy, 18)).join(" ");
      const tint = { Seated: "wash-violet-b", Reserved: c.pal.warm, Free: "wash-teal" };
      return {
        bg: { lines: [{ d: "M120 190 L960 182 L968 790 L112 798 Z", w: 2.6 }, { d: "M112 480 L160 480 M920 470 L968 470", w: 2 }], washes: [[c.pal.sky, 40, 150, 1000, 680, 0.35]], actors: "" },
        mid: { lines: [{ d: tbl.map(([, x, y]) => ring(x, y, 74)).join(" "), w: 3.2 }, { d: tbl.map(([, x, y]) => chairs(x, y)).join(" "), w: 2 }],
          washes: tbl.map(([, x, y, st], i) => [i === flip ? "wash-teal" : tint[st], x - 105, y - 105, 210, 210, i === flip ? 0.9 : 0.45]),
          actors: `<circle class="ring" id="${S}-r0" cx="${tbl[flip][1]}" cy="${tbl[flip][2]}" r="60"/>` },
        fg: { lines: [], washes: [], actors: sparks(S, [[140, 250, 12], [960, 830, 14]]) },
        over: tbl.map(([n, x, y, st], i) => `<div class="tb" id="${S}-t${i}" style="left:${x - 80}px;top:${y - 26}px"><b>${n}</b>${i === flip ? `<span class="flip"><span class="fa">${tr(c, "No-show")}</span><span class="fb">${tr(c, "Free")}</span></span>` : `<span>${tr(c, st)}</span>`}</div>`).join(""),
        js: `draw(S,a+.15,1.0);washes(S,a+.25,.1);words(S,a+.25);
          tl.fromTo("#"+S+" .tb",{opacity:0,scale:.7},{opacity:1,scale:1,duration:.4,stagger:.1,ease:"back.out(1.8)",immediateRender:false},cue(a+.8,"card"));
          gsap.set("#"+S+"-t${flip} .fb",{yPercent:110});
          {const at=a+Math.min(Math.max(1.9,(b-a)*.6),b-a-.7);tl.to("#"+S+"-t${flip} .fa",{yPercent:-110,duration:.32,ease:"power2.inOut"},cue(at,"flip"));tl.to("#"+S+"-t${flip} .fb",{yPercent:0,duration:.32,ease:"power2.inOut"},at);T_[S]={at};}`,
        life: sparkLife(2) + `{const e=g(S+"-r0");if(e){const s2=t-T_[S].at;if(s2<0)e.style.opacity=0;else{const f=(s2/1.4)%1;e.setAttribute("r",(60+70*f).toFixed(1));e.style.opacity=(.6*(1-f)).toFixed(3);}}}
          css(S+"-mid",g(S+"-mid").style.transform+" rotate("+(.6*Math.sin(t*.7)).toFixed(2)+"deg)");`,
        hide: [`#${S} .tb`],
        shows: tbl.map(([n]) => n),
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
        over: `<div class="evs" id="${S}-evs">${evs.map((e, i) => `<div class="ev" id="${S}-e${i}"><b>${e.time}</b><span>${esc(tr(c, e.name))}<i>${e.pax} ${tr(c, "pax")}</i></span>${e.chip ? `<em>${tr(c, e.chip)}</em>` : ""}</div>`).join("")}</div>`,
        js: `draw(S,a+.15,.9);washes(S,a+.25,.3);words(S,a+.25);
          tl.fromTo("#"+S+" .ev",{opacity:0,x:-30},{opacity:1,x:0,duration:.45,stagger:.25,ease:"power3.out",immediateRender:false},cue(a+.9,"card"));`,
        life: sparkLife(2) + `setT(S+"-bal","translate("+(980+14*Math.sin(t*.9)).toFixed(1)+" "+(500-(t-a)*14+8*Math.sin(t*1.3)).toFixed(1)+") rotate("+(6*Math.sin(t*1.1)).toFixed(2)+")");`,
        hide: [`#${S} .ev`],
        shows: evs.flatMap((e) => [e.time, `${e.pax} pax`]),
      };
    }
    return deviceScreen(S, s, c, h, "laptop");
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
    // The brief may name the moment that fits its story; otherwise one is drawn.
    const v = MOMENTS.includes(s.moment) ? s.moment : pick(c.seed + "pay", ["toast", "farewell", "sunrise", "desk", "dinner", "owner"]);
    const city = CITIES[c.city];
    const dusk = !["sunrise", "desk", "owner"].includes(v);
    const sky = dusk ? [["wash-dusk", -40, 30, 1160, 620, 0.8], ["wash-rose", 0, 400, 1080, 280, 0.6]] : [["wash-sky", -40, 30, 1160, 620, 0.7], ["wash-lilac", 0, 420, 1080, 260, 0.5]];
    let ownCard = "";
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
    } else if (v === "desk") {
      // a calm front desk: counter, bell, key rack; a guest leaves happy
      const a = person(c.seed + "p0", { x: 700, y: 770, s: 1, pose: "wave", dir: 1 });
      midLines = [{ d: "M120 700 L960 690 L960 900 M120 700 L120 900 M100 700 L980 688", w: 2.8 }, { d: "M200 330 h300 v150 h-300 Z " + [0, 1, 2, 3, 4].map((i) => `M${236 + i * 56} 352 a5 5 0 1 0 0.1 0 M${236 + i * 56} 357 v10 a7 7 0 1 1 -7 7 M${229 + i * 56} 392 h14 v34 h-14 Z`).join(" "), w: 1.8 }];
      midActors = propSvg(S, "bell", 330, 640, 0.42, "b") + `<g id="${S}-fig0"><path d="${a.d}" stroke-width="2.6"/><path d="${a.fine}" stroke-width="1.4"/></g>` +
        `<path class="actor" id="${S}-ding" d="M262 560 l-22 -22 M330 540 l0 -34 M398 560 l22 -22" stroke-width="2.2"/>`;
      washesMid = [a.wash, ["wash-teal", 100, 640, 900, 300, 0.4], ["wash-lilac", 180, 320, 340, 160, 0.4]];
      extraLife = `css(S+"-fig0","translate("+((t-a)*12).toFixed(1)+"px,"+(-Math.abs(Math.sin(t*5))*5).toFixed(1)+"px)");
        {const e=g(S+"-ding");if(e){const k=((t-T_[S].clink)%1.6+1.6)%1.6;e.style.opacity=(t<T_[S].clink?0:clamp(1-k/.6)).toFixed(3);e.style.transform="scale("+(.8+.5*clamp(k/.6)).toFixed(3)+")";}}`;
    } else if (v === "dinner") {
      // a set table with candles, two diners seen from behind
      const a = person(c.seed + "p0", { x: 360, y: 820, s: 1, pose: "rest" }), b = person(c.seed + "p1", { x: 720, y: 820, s: 1, pose: "toast", dir: -1 });
      midLines = [];
      midActors = propSvg(S, "table", 540, 640, 0.78, "t") +
        `<path class="actor flame" id="${S}-c0" d="M470 560 C462 544 466 528 470 516 C474 528 478 544 470 560 Z" stroke-width="1.6"/><path class="actor flame" id="${S}-c1" d="M610 560 C602 544 606 528 610 516 C614 528 618 544 610 560 Z" stroke-width="1.6"/>` +
        `<g id="${S}-fig0"><path d="${a.d}" stroke-width="2.6"/><path d="${a.fine}" stroke-width="1.4"/></g><g id="${S}-fig1"><path d="${b.d}" stroke-width="2.6"/><path d="${b.fine}" stroke-width="1.4"/><path d="${glass(b.hand[0], b.hand[1] - 10)}" stroke-width="2.2"/></g>`;
      washesMid = [a.wash, b.wash, ["wash-rose", 120, 540, 840, 200, 0.4]];
      extraLife = `for(const k of [0,1]){const e=g(S+"-c"+k);if(e)e.style.transform="scaleY("+(.85+.3*Math.abs(Math.sin(t*12+k)*Math.sin(t*7.1+k))).toFixed(3)+")";}
        css(S+"-fig0","rotate("+(1.5*Math.sin(t*1.1)).toFixed(2)+"deg)");css(S+"-fig1","rotate("+(-2*Math.sin(t*1.3+1)).toFixed(2)+"deg)");`;
    } else if (v === "owner") {
      // the owner away on a terrace, phone raised: today's numbers arrive while the
      // hotel itself sits across the water, running without them
      const a = person(c.seed + "p0", { x: 300, y: 780, s: 1.3, pose: "toast", dir: 1 });
      const [px, py] = a.hand;
      const huts = [820, 880, 940].map((x, i) => `M${x - 24} 600 L${x} ${582 - i * 3} L${x + 24} 600 Z M${x - 18} 600 V616 H${x + 18} V600`).join(" ");
      midLines = [{ d: "M0 820 L1080 806 M0 862 L1080 848", w: 2.6 }, { d: Array.from({ length: 14 }, (_, i) => `M${40 + i * 76} ${818 - i * 1} V${858 - i * 1}`).join(" "), w: 1.4 }, { d: `${huts} M780 620 C840 626 920 626 980 620`, w: 1.8 }];
      midActors = `<g id="${S}-fig0"><path d="${a.d}" stroke-width="2.6"/><path d="${a.fine}" stroke-width="1.4"/>` +
        `<path d="M${px - 34} ${py - 64} h68 a10 10 0 0 1 10 10 v108 a10 10 0 0 1 -10 10 h-68 a10 10 0 0 1 -10 -10 v-108 a10 10 0 0 1 10 -10 Z" stroke-width="2.6"/>` +
        `<path d="M${px - 22} ${py + 30} v-14 M${px - 6} ${py + 30} v-26 M${px + 10} ${py + 30} v-20 M${px + 26} ${py + 30} v-38 M${px - 24} ${py - 30} L${px - 4} ${py - 40} L${px + 12} ${py - 34} L${px + 30} ${py - 50}" stroke-width="2"/></g>` +
        `<path class="actor" id="${S}-buzz" d="M${px + 52} ${py - 40} l18 -10 M${px + 54} ${py} l22 0 M${px + 52} ${py + 40} l18 10" stroke-width="2"/>`;
      washesMid = [a.wash, ["wash-teal", -60, 590, 1200, 220, 0.45], [c.pal.warm, 780, 560, 240, 90, 0.6]];
      extraLife = `{const e=g(S+"-buzz");if(e){const k=((t-a)*1.4)%1;e.style.opacity=(t-a<1?0:k<.5?1-k*2:0).toFixed(3);}}css(S+"-fig0","translateY("+(2*Math.sin(t*1.2)).toFixed(1)+"px)");
        css(S+"-own","translateY("+(6*Math.sin(t*1.5)).toFixed(1)+"px)");`;
      ownCard = `<div class="own" id="${S}-own" style="left:${Math.min(px + 110, 560)}px;top:180px"><i>${tr(c, "Revenue today")}</i><b>${esc(c.revenue)} <span>▲</span></b><u>${tr(c, "Your hotel, live")}</u></div>`;
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
      over: ownCard,
      fg: { lines: dusk ? [{ d: "M150 770 h60 v90 h-60 Z M160 770 C160 745 200 745 200 770 M870 760 h60 v90 h-60 Z M880 760 C880 735 920 735 920 760", w: 2.2 }] : [],
        washes: dusk ? [["wash-lilac", 120, 730, 140, 150, 0.7], ["wash-lilac", 840, 720, 140, 150, 0.7]] : [],
        actors: dusk ? `<path class="actor flame" id="${S}-f0" d="M180 846 C170 826 176 806 180 792 C184 806 190 826 180 846 Z" stroke-width="1.6"/><path class="actor flame" id="${S}-f1" d="M900 836 C890 816 896 796 900 782 C904 796 910 816 900 836 Z" stroke-width="1.6"/>` +
          Array.from({ length: 8 }, (_, i) => `<circle class="fly" id="${S}-ff${i}" cx="0" cy="0" r="4"/>`).join("") : "" },
      fixed: s.chip ? `<div class="chip" id="${S}-chip" style="top:1168px">${esc(c.fill(s.chip))}</div>` : "",
      js: `const CLINK=a+Math.min(1.2,(b-a)*.4);
        draw(S,a+.1,1.2);washes(S,a+.2,.2);words(S,a+.25);
        ${v === "toast" || v === "dinner" ? `cue(CLINK,"clink");` : v === "desk" ? `cue(CLINK,"tap");` : ""}
        ${ownCard ? `tl.fromTo("#"+S+"-own",{opacity:0,scale:.85,y:20},{opacity:1,scale:1,y:0,duration:.5,ease:"back.out(1.8)",immediateRender:false},cue(a+.9,"pop",{i:0}));` : ""}
        ${["desk", "dinner"].includes(v) ? `drawProp(S,a+.2,.8);tl.fromTo("#"+S+" .pfill",{opacity:0},{opacity:.95,duration:.4,immediateRender:false},a+.15);tl.fromTo("#"+S+" .pwash",{opacity:0},{opacity:.5,duration:.8,immediateRender:false},a+.7);` : ""}
        ${s.chip ? `tl.fromTo("#"+S+"-chip",{opacity:0,scale:.8},{opacity:1,scale:1,duration:.45,ease:"back.out(2)",immediateRender:false},cue(CLINK+.6,"match"));` : ""}
        T_[S]={clink:CLINK};`,
      life: extraLife + (dusk ? `{const u=clamp((t-a)/(b-a+1));setT(S+"-bg","");}
        for(let i=0;i<6;i++){const e=g(S+"-st"+i);if(!e)continue;const on=clamp((t-a-.6-i*.35)*2);e.style.opacity=(on*(.5+.5*Math.abs(Math.sin(t*3+i)))).toFixed(3);e.style.transform="scale("+(.7+.4*Math.abs(Math.sin(t*2.4+i))).toFixed(3)+")";}
        for(const k of [0,1]){const e=g(S+"-f"+k);if(e)e.style.transform="scaleY("+(.85+.3*Math.abs(Math.sin(t*13+k)*Math.sin(t*7.3+k*2))).toFixed(3)+") scaleX("+(1+.08*Math.sin(t*9+k)).toFixed(3)+")";}
        for(let i=0;i<8;i++){const e=g(S+"-ff"+i);if(!e)continue;const fx=120+(i*137)%840,fy=560+(i*71)%260;e.setAttribute("cx",(fx+30*Math.sin(t*.7+i*1.3)).toFixed(1));e.setAttribute("cy",(fy+18*Math.sin(t*1.1+i*2.6)).toFixed(1));e.style.opacity=(clamp((t-a-.8)*1.5)*(.35+.65*Math.abs(Math.sin(t*2.6+i*1.3)))).toFixed(3);}` : skyLife),
      hide: [...(s.chip ? [`#${S}-chip`] : []), ...(ownCard ? [`#${S}-own`] : [])],
      shows: ownCard ? [c.revenue] : [],
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
  const when = /(\d{4})-(\d{2})-(\d{2})-(\d{2})/.exec(String(brief.id ?? ""));
  const tods = Object.keys(PALETTES);
  const tod = when ? tods[(Math.floor(Date.UTC(+when[1], +when[2] - 1, +when[3]) / 864e5) + Math.floor(+when[4] / 3)) % tods.length] : pick(seed + "tod", tods);
  const veils = ["veil", "veil-teal", "veil-blue"].sort((a, b) => (hash(seed + a) % 97) - (hash(seed + b) % 97));

  const ids = brief.scenes.map((_, i) => `s${i}`);
  // the city lends its warm accent to every scene; devices are not repeated within a reel
  const pal = { ...PALETTES[tod], warm: CITY_ACCENT[city] ?? PALETTES[tod].warm };
  const used = [];
  const built = brief.scenes.map((s, i) => {
    const fn = SCENE[s.type];
    if (!fn) throw new Error(`ink has no scene "${s.type}"`);
    return fn(ids[i], s, { seed: seed + i, city, tod, pal, used, T, fill, ledger, lang: brief.language, revenue: money(ledger.rightTotal + ledger.orderTotal, ledger.currency) });
  });
  // a camera move per scene: direction and strength vary with the post
  const pans = ids.map((S, i) => {
    const h = hash(seed + S + "pan");
    return { x: ((h % 2) ? 1 : -1) * (44 + (h >>> 3) % 36), y: -(18 + (h >>> 9) % 26), s: 0.04 + ((h >>> 13) % 4) / 100 };
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
.art{position:absolute;left:0;top:160px;width:1080px;height:1000px;transform-origin:540px 0;-webkit-mask-image:linear-gradient(to bottom,#000 0,#000 82%,transparent 99%),linear-gradient(to right,transparent 0,#000 7%,#000 93%,transparent 100%);-webkit-mask-composite:source-in;mask-composite:intersect}
.ly{position:absolute;inset:0}
.wb{position:absolute}
.wash{position:absolute;inset:0;width:100%;height:100%;opacity:0;mix-blend-mode:multiply}
.ink{position:absolute;left:0;top:0;width:1080px;height:1000px;overflow:visible;filter:url(#boil)}
.ink path,.ink circle,.ink ellipse,.ink rect{fill:none;stroke:${INK};stroke-linecap:round;stroke-linejoin:round}
.ink .petal{fill:#B596F0;stroke:none;opacity:0}
.ink .pfill{fill:#FBF8F1;stroke:none;opacity:0}
.ink .pwash{opacity:0;mix-blend-mode:multiply}
.ink .ring{stroke:${TEAL_INK};stroke-width:2.4;opacity:0}
.ink .fly{fill:#F2CF7A;stroke:none;opacity:0}
.ink .flame{fill:rgba(242,190,110,.55)}
.ink .tk{stroke:${TEAL_INK}}
.ink .spk{stroke:${TEAL_INK}}
.ink .bar{fill:rgba(123,84,255,.25);stroke:${INK};stroke-width:2}
.ink .spark,.ink .actor,.ink g{transform-box:fill-box;transform-origin:center}
.ink .flame{transform-origin:center bottom}
.cap{position:absolute;left:80px;top:1275px;width:840px;font-weight:600;line-height:1.14;letter-spacing:-.02em;color:${INK}}
.w{display:inline-block;vertical-align:top}
.wi{display:inline-block;position:relative}
.wi.bad{color:${RED}}
.wi.good{color:${TEAL_INK}}
.ul{position:absolute;left:-2px;right:-2px;bottom:-6px;height:14px;clip-path:inset(0 100% 0 0)}
.ul svg{display:block;width:100%;height:100%;overflow:visible}
.ul path{fill:none;stroke:currentColor;stroke-width:4;stroke-linecap:round;vector-effect:non-scaling-stroke}
.rule{position:absolute;left:80px;top:1242px;width:120px;height:5px;border-radius:5px;background:linear-gradient(90deg,#B23BFF,#3E86FF,#36D2BA);transform-origin:0 50%}
#lock{position:absolute;left:80px;top:96px;height:44px}
.pill{position:absolute;right:80px;top:92px;font-size:23px;font-weight:600;letter-spacing:.12em;color:${INK};border:2px solid ${INK};border-radius:100px;padding:11px 24px}
.place{position:absolute;left:80px;top:950px;font-size:22px;font-weight:700;letter-spacing:.14em;color:${INK};background:rgba(251,248,241,.97);border:1.5px solid rgba(30,35,80,.35);border-radius:100px;padding:8px 14px;display:flex;gap:10px;align-items:center}
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
.bval{white-space:nowrap;margin-left:12px}
.rep{position:absolute;left:330px;top:112px;width:420px}
.rtitle{font-size:30px;font-weight:700;margin-bottom:14px}
.rrow{font-size:20px;padding:14px 16px;margin-bottom:10px;border:1.8px solid ${INK};border-radius:12px;background:rgba(255,253,248,.7)}
.rep{padding-top:0}
.rep .rgap{height:230px}
.rbig{margin:6px 0 0}
.rbig i{display:block;font-style:normal;font-size:17px;letter-spacing:.08em;color:${INK_SOFT}}
.rbig b{display:block;font-size:46px;color:#5B3FD6;line-height:1.1}
.desk{position:absolute;left:190px;top:200px;width:700px}
.kpis{display:flex;gap:14px;margin-bottom:16px}
.kpi{flex:1;border:2px solid ${INK};border-radius:12px;padding:14px 16px;background:rgba(255,253,248,.75)}
.kpi i{display:block;font-style:normal;font-size:15px;letter-spacing:.1em;color:${INK_SOFT}}
.kpi b{display:block;font-size:44px;color:#5B3FD6;margin-top:4px}
.grow{display:flex;justify-content:space-between;font-size:22px;padding:13px 14px;border-bottom:1.5px solid rgba(30,35,80,.2);border-radius:8px}
.note{position:absolute;left:350px;top:310px;width:480px}
.nitem{font-size:32px;font-weight:600;height:130px;display:flex;align-items:center;border-bottom:1.5px dashed rgba(30,35,80,.25)}
.kt{position:absolute;top:210px;width:250px;padding:24px 22px 20px;background:rgba(255,253,248,.95);border:2.6px solid ${INK};border-radius:4px;transform-origin:50% 0;font-size:23px;display:flex;flex-direction:column;gap:8px}
.kt b{font-size:30px}
.kt u{text-decoration:none;font-size:16px;font-weight:700;color:${TEAL_INK};border-top:1.5px dashed rgba(19,132,118,.5);padding-top:6px}
.kt i{font-style:normal;color:${INK_SOFT};font-size:19px;margin-top:6px}
.kt em{position:relative;align-self:flex-end;margin-top:6px;font-style:normal;font-weight:700;font-size:26px;letter-spacing:.08em;color:${TEAL_INK};border:4px double ${TEAL_INK};border-radius:8px;padding:2px 10px;transform:rotate(-10deg);mix-blend-mode:multiply}
.dev{position:absolute;transform-origin:50% 50%}
.dsv{position:absolute;left:0;top:0;overflow:visible;filter:url(#boil)}
.dsv path{fill:rgba(251,248,241,.55);stroke:${INK};stroke-linecap:round;stroke-linejoin:round}
.dct{position:absolute;inset:0;display:flex;flex-direction:column;gap:10px;color:${INK};font-size:21px;overflow:hidden}
.dct>*{zoom:1.12}
.dev.wide .dct>*{zoom:1.2}
.cols{display:flex;flex-direction:column;gap:12px}
.cols>div{display:flex;flex-direction:column;gap:8px}
.dev.wide .cols{flex-direction:row;gap:34px}
.dev.wide .cols>div{flex:1}
.dev.wide .cols>div:first-child{flex:1.8}
.dev.wide .bline{padding:7px 0;font-size:21px}
.dev.wide .btot{padding-top:10px}
.dct .fhead{margin-bottom:4px}
.dct .rtitle{font-size:30px;font-weight:700}
.dct .rbig b{white-space:nowrap}
.dct .rrow{margin:0}
.dct .kpis{gap:12px}
.dev:not(.wide) .kpi{padding:10px 12px}
.dev:not(.wide) .kpi b{font-size:32px}
.dev:not(.wide) .kpi i{font-size:12px}
.dct .grow{font-size:21px}
.csv{display:block;height:130px;overflow:visible}
.csv .spk{fill:none;stroke:${TEAL_INK};stroke-width:3;stroke-linecap:round}
.csv .bar{fill:rgba(123,84,255,.25);stroke:${INK};stroke-width:2}
.stamp2{align-self:center;margin-top:14px;width:fit-content;font-size:22px;font-weight:700;letter-spacing:.04em;color:${TEAL_INK};border:4px double ${TEAL_INK};border-radius:8px;padding:5px 14px;mix-blend-mode:multiply}
.tks{display:flex;gap:16px;align-items:flex-start}
.ktk{flex:1;display:flex;flex-direction:column;gap:6px;padding:16px 16px 14px;border:2.4px solid ${INK};border-radius:4px;background:rgba(255,253,248,.92);font-size:20px}
.ktk b{font-size:26px}
.ktk i{font-style:normal;font-size:16px;color:${INK_SOFT}}
.ktk u{text-decoration:none;font-size:15px;font-weight:700;color:${TEAL_INK}}
.ktk .stamp2{align-self:flex-end;font-size:18px;margin-top:4px}
.dv-board .ktk:nth-child(2){transform:rotate(2deg)}
.dv-board .ktk:nth-child(1){transform:rotate(-2deg)}
.hks{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}
.dev.wide .hks{grid-template-columns:repeat(4,1fr)}
.hk{border:2.4px solid ${INK};border-radius:10px;padding:12px 14px;display:flex;flex-direction:column;gap:4px;background:rgba(255,253,248,.85)}
.hk b{font-size:30px}
.hk span{font-size:17px;font-weight:600;color:${INK_SOFT}}
.hk-clean{background:rgba(64,186,168,.18)}
.hk-dirty{background:rgba(232,172,86,.22)}
.hk .flip{min-width:5.2em;height:1.4em;text-align:left}
.hk .flip span{left:0;right:auto}
.hk .flip .fa{color:#C07A1E}
.tbs{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;justify-items:center}
.htb{width:136px;height:136px;border:3px solid ${INK};border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;background:rgba(255,253,248,.85)}
.htb b{font-size:30px}
.htb span{font-size:16px;font-weight:600;color:${INK_SOFT}}
.htb-seated{background:rgba(150,118,236,.18)}
.htb-free{background:rgba(64,186,168,.15)}
.htb-ns{background:rgba(64,186,168,.32);border-width:4px}
.htb .flip{min-width:5.6em;height:1.4em;text-align:center}
.htb .flip span{left:0;right:0}
.htb .flip .fa{color:#C07A1E}
.dct .ev{padding:16px 4px}
.dev:not(.wide) .ev{flex-wrap:wrap;gap:4px 14px}
.dev:not(.wide) .ev em{margin-left:104px}
.dct .frow b{font-size:30px;color:#5B3FD6}
.own{position:absolute;padding:16px 20px;border:2.6px solid ${INK};border-radius:14px;background:rgba(251,248,241,.95);display:flex;flex-direction:column;gap:2px}
.own i{font-style:normal;font-size:16px;letter-spacing:.08em;color:${INK_SOFT}}
.own b{font-size:40px;color:#5B3FD6}
.own b span{color:${TEAL_INK};font-size:26px}
.own u{text-decoration:none;font-size:16px;font-weight:700;color:${TEAL_INK}}
.bk .frow b{font-size:30px;color:#5B3FD6}
.bklink{display:inline-block;font-size:17px;font-weight:700;color:${TEAL_INK};border:2px solid ${TEAL_INK};border-radius:100px;padding:5px 12px;margin-bottom:14px}
.bkq .frow{font-size:20px;padding:10px 0}
.bkbtn{margin-top:22px;text-align:center;font-size:22px;font-weight:700;color:#FBF8F1;background:${INK};border-radius:14px;padding:16px}
.pin{font-size:19px;font-weight:600;color:${INK};margin:-8px 0 10px;display:flex;align-items:center;gap:12px}
.pin .dots{display:flex;gap:8px}
.pin .dots i{width:16px;height:16px;border-radius:50%;border:2px solid ${INK};display:block}
.tb{position:absolute;width:160px;text-align:center;font-size:36px;font-weight:700;display:flex;flex-direction:column;align-items:center;gap:4px}
.tb>span{font-size:20px;font-weight:600;color:${INK_SOFT};border:2px solid ${INK};border-radius:100px;padding:3px 10px;background:rgba(255,253,248,.92)}
.tb .flip{min-width:6.4em;height:1.6em;text-align:center}
.tb .flip span{left:0;right:0;top:3px}
.tb .flip .fa{color:#C07A1E}
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
.chip{position:absolute;left:80px;font-size:26px;font-weight:700;color:${TEAL_INK};border:2.5px solid ${TEAL_INK};border-radius:100px;padding:12px 26px;background:rgba(251,248,241,.97)}
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
const WASH=.78, CUES=[], T_={};
const cue=(t,type,o={})=>{CUES.push({t:+t.toFixed(3),type,...o});return t;};
const tl=gsap.timeline({paused:true});
const $=(s)=>document.querySelector(s), $$=(s)=>document.querySelectorAll(s);
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const ease=(u)=>.5-.5*Math.cos(Math.PI*clamp(u));
function draw(S,t0,span){const ps=[...$$("#"+S+" .ln")];if(!ps.length)return;const step=span/ps.length;
  ps.forEach((p,i)=>{const L=Math.ceil(p.getTotalLength())+4;gsap.set(p,{strokeDasharray:L,strokeDashoffset:L});tl.to(p,{strokeDashoffset:0,duration:Math.max(.5,step*1.8),ease:"power1.inOut"},t0+i*step);});
  cue(t0,"sketch",{dur:span+.6});}
function drawProp(S,t0,span){[...$$("#"+S+" .pl")].forEach((p,i)=>{const L=Math.ceil(p.getTotalLength())+4;gsap.set(p,{strokeDasharray:L,strokeDashoffset:L});tl.to(p,{strokeDashoffset:0,duration:span,ease:"power1.inOut"},t0+i*.15);});}
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
    css(S+"-art","scale("+(1.04*(1+p.s*u)).toFixed(4)+")");
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
