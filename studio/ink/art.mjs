/**
 * The ink library's drawings: people, and the five cities' scenery.
 *
 * Everything returns plain SVG path data (drawn on by the engine) plus
 * "actors" (SVG with ids that move every frame) and a life() snippet: JS run
 * by the page for every frame with t (seconds) and the scene's window a..b.
 * Helpers available to snippets: g(id), setT(id, transform), css(id, transform),
 * clamp(x), ease(u). Ids are prefixed with the scene id (S) by the engine.
 *
 * People are always seen from behind or far away: an invented face is the one
 * thing image makers get visibly wrong, and it is not needed to tell a story.
 */

// ── people ──────────────────────────────────────────────────────────────────

/**
 * A person seen from behind, from the hips up.
 * @param o {x, y (shoulder line), s (scale), hair, wear, pose, dir (-1 left / 1 right), id}
 * @returns {{ d: string, fine: string, wash: [string, number, number, number, number, number] | null, hand: [number, number] }}
 */
export function figure({ x, y, s = 1, hair = "short", wear = "plain", pose = "rest", dir = 1 }) {
  const P = (dx, dy) => `${(x + dx * s).toFixed(1)} ${(y + dy * s).toFixed(1)}`;
  const hx = x, hy = y - 62 * s, R = 30 * s;
  const head = `M${P(-30, -62)} a${R} ${R * 1.12} 0 1 0 ${2 * R} 0 a${R} ${R * 1.12} 0 1 0 ${-2 * R} 0`;
  let hairD = "", hairFine = "";
  if (hair === "afro") {
    hairD = Array.from({ length: 11 }, (_, i) => {
      const a0 = Math.PI * (0.95 + (i / 11) * 1.1), a1 = Math.PI * (0.95 + ((i + 1) / 11) * 1.1);
      const r = 44 * s, px = hx + Math.cos(a0) * r, py = hy - 6 * s + Math.sin(a0) * r, qx = hx + Math.cos(a1) * r, qy = hy - 6 * s + Math.sin(a1) * r;
      return `${i ? "" : `M${px.toFixed(1)} ${py.toFixed(1)}`} A${(9 * s).toFixed(1)} ${(9 * s).toFixed(1)} 0 0 1 ${qx.toFixed(1)} ${qy.toFixed(1)}`;
    }).join(" ");
  } else if (hair === "braids") {
    hairD = `M${P(-31, -66)} C${P(-28, -98)} ${P(28, -98)} ${P(31, -66)}`;
    hairFine = [-20, -8, 4, 16].map((dx) => `M${P(dx, -60)} C${P(dx - 2, -30)} ${P(dx + 4, -8)} ${P(dx + 1, 18)}`).join(" ");
  } else if (hair === "wrap") {
    hairD = `M${P(-32, -70)} C${P(-36, -112)} ${P(36, -112)} ${P(32, -70)} M${P(-14, -100)} C${P(-6, -126)} ${P(22, -124)} ${P(18, -98)}`;
    hairFine = `M${P(-26, -82)} C${P(-6, -92)} ${P(10, -92)} ${P(28, -80)} M${P(-22, -94)} C${P(-4, -102)} ${P(12, -102)} ${P(24, -92)}`;
  } else {
    hairD = `M${P(-30, -72)} C${P(-28, -100)} ${P(28, -100)} ${P(30, -72)}`;
    hairFine = `M${P(-24, -78)} L${P(-20, -86)} M${P(-10, -84)} L${P(-6, -92)} M${P(6, -84)} L${P(10, -92)} M${P(20, -78)} L${P(24, -86)}`;
  }
  const body = `M${P(-12, -28)} L${P(-12, -16)} M${P(12, -28)} L${P(12, -16)} M${P(-70, 120)} C${P(-72, 40)} ${P(-52, -6)} ${P(-14, -14)} L${P(14, -14)} C${P(52, -6)} ${P(72, 40)} ${P(70, 120)}`;
  let wearFine = "";
  let wash = null;
  if (wear === "kitenge") {
    wearFine = [10, 34, 58, 82].map((dy) => `M${P(-58, dy)} q${(14.5 * s).toFixed(1)} ${(-10 * s).toFixed(1)} ${(29 * s).toFixed(1)} 0 t${(29 * s).toFixed(1)} 0 t${(29 * s).toFixed(1)} 0 t${(29 * s).toFixed(1)} 0`).join(" ");
    wash = ["wash-magenta", x - 74 * s, y - 20 * s, 148 * s, 150 * s, 0.5];
  } else if (wear === "collar") {
    wearFine = `M${P(-16, -14)} L${P(0, 6)} L${P(16, -14)} M${P(0, 6)} L${P(0, 118)}`;
    wash = ["wash-blue", x - 74 * s, y - 20 * s, 148 * s, 150 * s, 0.45];
  } else {
    wash = ["wash-teal", x - 74 * s, y - 20 * s, 148 * s, 150 * s, 0.4];
  }
  let arms = "", hand = [x, y];
  if (pose === "toast") {
    const sx = x + dir * 54 * s, hx2 = x + dir * 64 * s, hy2 = y - 150 * s;
    arms = `M${sx.toFixed(1)} ${(y + 8 * s).toFixed(1)} C${(sx + dir * 18 * s).toFixed(1)} ${(y - 50 * s).toFixed(1)} ${(hx2 + dir * 6 * s).toFixed(1)} ${(y - 100 * s).toFixed(1)} ${hx2.toFixed(1)} ${hy2.toFixed(1)}`;
    hand = [hx2, hy2];
  } else if (pose === "wave") {
    const sx = x + dir * 54 * s;
    arms = `M${sx.toFixed(1)} ${(y + 8 * s).toFixed(1)} C${(sx + dir * 30 * s).toFixed(1)} ${(y - 40 * s).toFixed(1)} ${(sx + dir * 34 * s).toFixed(1)} ${(y - 90 * s).toFixed(1)} ${(sx + dir * 30 * s).toFixed(1)} ${(y - 130 * s).toFixed(1)} M${(sx + dir * 22 * s).toFixed(1)} ${(y - 140 * s).toFixed(1)} l${(dir * 8 * s).toFixed(1)} ${(-16 * s).toFixed(1)} M${(sx + dir * 32 * s).toFixed(1)} ${(y - 142 * s).toFixed(1)} l${(dir * 4 * s).toFixed(1)} ${(-18 * s).toFixed(1)}`;
  } else if (pose === "bag") {
    arms = `M${P(-44, -6)} C${P(-48, 30)} ${P(-46, 60)} ${P(-40, 80)} M${P(44, -6)} C${P(48, 30)} ${P(46, 60)} ${P(40, 80)} M${P(-40, 6)} h${(80 * s).toFixed(1)} v${(96 * s).toFixed(1)} a${(10 * s).toFixed(1)} ${(10 * s).toFixed(1)} 0 0 1 ${(-10 * s).toFixed(1)} ${(10 * s).toFixed(1)} h${(-60 * s).toFixed(1)} a${(10 * s).toFixed(1)} ${(10 * s).toFixed(1)} 0 0 1 ${(-10 * s).toFixed(1)} ${(-10 * s).toFixed(1)} Z`;
    wearFine += ` M${P(-26, 40)} h${(52 * s).toFixed(1)} M${P(-26, 66)} h${(52 * s).toFixed(1)}`;
  }
  return { d: `${head} ${hairD} ${body} ${arms}`, fine: `${hairFine} ${wearFine}`, wash, hand };
}

/** A wine glass whose bowl sits at (x, y). */
export const glass = (x, y, s = 1) =>
  `M${x - 26 * s} ${y - 40 * s} C${x - 26 * s} ${y + 10 * s} ${x + 26 * s} ${y + 10 * s} ${x + 26 * s} ${y - 40 * s} Z M${x} ${y + 4 * s} L${x} ${y + 50 * s} M${x - 20 * s} ${y + 54 * s} L${x + 20 * s} ${y + 54 * s}`;

// ── scenery helpers ─────────────────────────────────────────────────────────

const cloud = (x, y, s) => `M${x} ${y} c${20 * s} ${-18 * s} ${50 * s} ${-18 * s} ${62 * s} ${-4 * s} c${14 * s} ${-16 * s} ${48 * s} ${-12 * s} ${54 * s} ${6 * s} c${16 * s} ${-2 * s} ${24 * s} ${10 * s} ${16 * s} ${18 * s} l${-132 * s} 0 c${-12 * s} ${-6 * s} ${-10 * s} ${-18 * s} 0 ${-20 * s}`;
const balusters = (x0, x1, step, yTop, yBot, slope) =>
  Array.from({ length: Math.floor((x1 - x0) / step) + 1 }, (_, i) => {
    const x = x0 + i * step, dy = (x - x0) * slope;
    return `M${x} ${(yTop + dy).toFixed(0)} L${x} ${(yBot + dy).toFixed(0)}`;
  }).join(" ");
const waves = (y0, n, amp) => Array.from({ length: n }, (_, i) => {
  const y = y0 + i * 34, x0 = (i * 97) % 200;
  return `M${x0} ${y} q30 ${-amp} 60 0 t60 0 M${x0 + 420} ${y + 8} q30 ${-amp} 60 0 t60 0 t60 0`;
});

// Each city: the far view (used by its opening scene and, at dusk, by its payoff),
// plus a near view for the opening.
export const CITIES = {
  arusha: {
    far: { lines: [
      { d: "M40 600 C190 520 290 440 370 360 C420 312 465 252 515 205 C535 188 558 184 578 198 C640 246 702 318 790 398 C880 478 965 528 1050 570", w: 3.4 },
      { d: "M515 205 C505 232 528 246 512 270 M556 190 C566 220 550 238 570 258 M600 222 C596 246 612 256 604 280", w: 1.8 },
      { d: "M0 690 C150 650 280 672 420 640 C560 610 700 650 840 625 C930 610 1010 630 1080 618", w: 1.8 }],
      washes: [["wash-blue", 330, 220, 520, 500, 0.5]] },
    near: (S) => {
      const blossoms = Array.from({ length: 24 }, (_, i) => {
        const a = (i * 2.399) % 6.283, d = 30 + ((i * 37) % 120);
        const x = 255 + Math.cos(a) * d * 1.3, y = 590 + Math.sin(a) * d * 0.8;
        return `M${x.toFixed(0)} ${y.toFixed(0)} a8 5 0 1 0 16 0`;
      }).join(" ");
      const thatch = Array.from({ length: 26 }, (_, i) => { const x = 572 + i * 20, y = 718 - (x - 560) * (80 / 520); return `M${x} ${y.toFixed(0)} l-8 24`; }).join(" ");
      return {
        mid: { lines: [{ d: "M0 770 C200 750 420 780 640 758 C800 744 960 762 1080 754", w: 1.6 }, { d: "M230 1000 C238 905 222 830 250 770 C266 738 256 708 276 676", w: 3.6 },
          { d: "M250 770 C205 732 165 712 120 702 M262 728 C306 698 346 688 388 668 M272 696 C258 650 248 610 258 570 M256 650 C218 628 188 600 178 568 M268 660 C306 630 326 600 336 568", w: 2.4 },
          { d: blossoms, w: 1.6 }],
          washes: [["wash-teal", -120, 700, 820, 400, 0.55], ["wash-lilac", 70, 430, 380, 330, 0.8], ["wash-violet", 170, 500, 200, 190, 0.55]],
          actors: Array.from({ length: 14 }, (_, i) => `<ellipse class="petal" id="${S}-p${i}" cx="0" cy="0" rx="6" ry="3.6"/>`).join("") },
        fg: { lines: [{ d: "M560 720 L1080 640 M560 744 L1080 664", w: 3 }, { d: thatch, w: 1.2 }, { d: "M610 740 L610 1000 M780 714 L780 1000 M950 688 L950 1000", w: 2.8 },
          { d: "M560 880 L1080 846 M560 916 L1080 882", w: 2.2 }, { d: balusters(585, 1065, 40, 880, 916, -34 / 520), w: 1.4 }], washes: [] },
        life: `for(let i=0;i<14;i++){const e=g(S+"-p"+i);if(!e)continue;const px=255+Math.cos(i*2.399)*(40+(i*53)%120)*1.2,py=560+Math.sin(i*2.399)*(40+(i*53)%120)*.7;const run=((t*(38+(i*17)%40)/10+i*28)%260);
          e.setAttribute("cx",(px+18*Math.sin(t*1.6+i)+run*.25).toFixed(1));e.setAttribute("cy",(py+run).toFixed(1));e.style.opacity=(clamp((t-a-1.8)*1.5)*(1-run/260)*.85).toFixed(3);}`,
      };
    },
  },
  moshi: {
    far: { lines: [
      { d: "M0 640 C200 600 330 520 420 452 C470 414 520 396 560 394 L650 396 C710 400 770 432 830 472 C930 540 1000 600 1080 640", w: 3.4 },
      { d: "M470 418 C500 430 530 420 556 428 C590 438 620 426 650 434 C690 444 720 436 760 452 M500 440 C520 450 548 446 570 452", w: 1.8 },
      { d: "M0 700 C180 670 360 690 540 668 C720 646 900 670 1080 656", w: 1.6 }],
      washes: [["wash-blue", 300, 330, 600, 420, 0.5]] },
    near: (S) => {
      const leaf = (x, y, a, l) => { const dx = Math.cos(a) * l, dy = Math.sin(a) * l; return `M${x} ${y} q${(dx * 0.5 - dy * 0.25).toFixed(0)} ${(dy * 0.5 + dx * 0.25).toFixed(0)} ${dx.toFixed(0)} ${dy.toFixed(0)} q${(-dx * 0.5 - dy * 0.15).toFixed(0)} ${(-dy * 0.5 + dx * 0.15).toFixed(0)} ${(-dx).toFixed(0)} ${(-dy).toFixed(0)} M${x} ${y} l${(dx * 0.95).toFixed(0)} ${(dy * 0.95).toFixed(0)}`; };
      const banana = (x, y) => `M${x} 1000 C${x - 6} 900 ${x + 6} 800 ${x} ${y} ` + [-2.6, -2.1, -1.0, -0.5].map((a, i) => leaf(x, y + i * 12, a, 150)).join(" ");
      const f1 = figure({ x: 470, y: 820, s: 0.9, hair: "short", wear: "plain", pose: "bag" }), f2 = figure({ x: 640, y: 800, s: 0.82, hair: "braids", wear: "collar", pose: "bag" });
      return {
        mid: { lines: [{ d: "M0 760 C240 740 480 770 720 748 C880 734 980 746 1080 740", w: 1.6 }, { d: "M0 800 C200 786 420 804 640 790 M0 840 C220 826 460 844 700 830", w: 1.2 }],
          washes: [["wash-teal", -100, 620, 1280, 420, 0.5]], actors: "" },
        fg: { lines: [{ d: banana(140, 640), w: 2.4 }, { d: banana(960, 610), w: 2.4 }],
          washes: [["wash-teal", 20, 520, 280, 300, 0.55], ["wash-teal", 840, 490, 280, 300, 0.55], f1.wash, f2.wash],
          actors: `<g id="${S}-w0"><path d="${f1.d}" stroke-width="2.6"/><path d="${f1.fine}" stroke-width="1.4"/></g><g id="${S}-w1"><path d="${f2.d}" stroke-width="2.6"/><path d="${f2.fine}" stroke-width="1.4"/></g>` },
        life: `for(const k of [0,1]){const w=g(S+"-w"+k);if(w)w.style.transform="translate("+(-(t-a)*(8+k*4)).toFixed(1)+"px,"+(-Math.abs(Math.sin((t+k*.4)*5))*7).toFixed(1)+"px)";}`,
      };
    },
  },
  zanzibar: {
    far: { lines: [{ d: "M0 560 L1080 560", w: 2 }, { d: "M0 600 C300 592 700 604 1080 596", w: 1.2 }], washes: [["wash-sky", -60, 300, 1200, 300, 0.6]] },
    near: (S) => {
      const frond = (x, y, a, l) => { const dx = Math.cos(a) * l, dy = Math.sin(a) * l; return `M${x} ${y} q${(dx * 0.55).toFixed(0)} ${(dy * 0.2 - 40).toFixed(0)} ${dx.toFixed(0)} ${dy.toFixed(0)}` + Array.from({ length: 6 }, (_, i) => { const u = (i + 1) / 7; return ` M${(x + dx * u).toFixed(0)} ${(y + dy * u - 30 * Math.sin(Math.PI * u)).toFixed(0)} l${(-12 + Math.sign(dx) * 4).toFixed(0)} 22`; }).join(""); };
      return {
        mid: { lines: [{ d: waves(640, 5, 10).join(" "), w: 1.4 }, { d: "M0 860 C260 820 560 840 820 812 C920 800 1000 806 1080 800", w: 2 }],
          washes: [["wash-teal", -120, 560, 1320, 300, 0.6], ["wash-rose", 0, 800, 1080, 260, 0.45]],
          actors: `<g id="${S}-dhow"><path d="M520 548 L640 548 L620 566 L540 566 Z M580 548 L580 450 M580 452 L652 540 L560 540 Z" stroke-width="2.2"/></g>` },
        fg: { lines: [{ d: "M880 1000 C870 900 880 760 920 640", w: 3.4 }, { d: [-2.9, -2.4, -1.6, -0.9, -0.3].map((a) => frond(920, 640, a, 170)).join(" "), w: 2 }],
          washes: [["wash-teal", 760, 520, 320, 260, 0.5]], actors: "" },
        life: `css(S+"-mid","translate("+(Math.sin(t*.6)*8).toFixed(1)+"px,0)");
          setT(S+"-dhow","translate("+(-(t-a)*14).toFixed(1)+" "+(Math.sin(t*1.3)*3).toFixed(1)+")");
          {const fg=g(S+"-fg");if(fg)fg.style.transformOrigin="920px 1000px",fg.style.transform+=" rotate("+(Math.sin(t*1.1)*1.6).toFixed(2)+"deg)";}`,
      };
    },
  },
  mwanza: {
    far: { lines: [{ d: "M0 560 C200 540 400 552 600 538 C800 526 960 540 1080 532", w: 1.6 }, { d: "M0 600 L1080 600", w: 2 }], washes: [["wash-sky", -60, 260, 1200, 360, 0.6]] },
    near: (S) => {
      const rock = (x, y, w, h) => `M${x} ${y} C${x - 6} ${y - h * 0.7} ${x + w * 0.2} ${y - h} ${x + w * 0.5} ${y - h} C${x + w * 0.85} ${y - h} ${x + w + 6} ${y - h * 0.6} ${x + w} ${y} Z`;
      return {
        mid: { lines: [{ d: [rock(640, 600, 150, 140), rock(700, 470, 90, 90), rock(560, 600, 90, 70)].join(" "), w: 2.6 }, { d: waves(640, 4, 8).join(" "), w: 1.3 }],
          washes: [["wash-blue", -80, 580, 1240, 360, 0.55], ["wash-lilac", 540, 380, 320, 260, 0.5]],
          actors: `<g id="${S}-boat"><path d="M180 640 C220 662 320 662 360 640 Z M270 640 L270 586" stroke-width="2.2"/></g>` },
        fg: { lines: [{ d: [rock(-20, 1000, 300, 260), rock(820, 1000, 280, 210)].join(" "), w: 3 }, { d: "M300 1000 l10 -40 M330 1000 l-6 -50 M360 1000 l8 -36 M760 1000 l-8 -44 M790 1000 l6 -36", w: 1.6 }],
          washes: [["wash-violet-b", -60, 760, 420, 300, 0.45], ["wash-violet-b", 800, 800, 360, 260, 0.45]], actors: "" },
        life: `setT(S+"-boat","translate("+((t-a)*16).toFixed(1)+" "+(Math.sin(t*1.5)*4).toFixed(1)+") rotate("+(Math.sin(t*1.5)*2).toFixed(2)+")");`,
      };
    },
  },
  dar: {
    far: { lines: [
      { d: "M0 600 L60 600 L60 470 L130 470 L130 600 L170 600 L170 410 L240 410 L240 600 L300 600 L300 520 L370 520 L370 600 L760 600 L760 450 L830 450 L830 600 L880 600 L880 380 L960 380 L960 600 L1080 600", w: 2 },
      { d: "M80 500 h30 M80 530 h30 M190 440 h30 M190 470 h30 M190 500 h30 M900 410 h40 M900 440 h40 M900 470 h40", w: 1.2 }],
      washes: [["wash-sky", -60, 240, 1200, 380, 0.6]] },
    near: (S) => {
      const crane = (x) => `M${x} 600 L${x + 30} 400 L${x + 60} 600 M${x + 30} 400 L${x + 30} 360 L${x + 200} 360 M${x + 30} 360 L${x - 60} 360 M${x + 5} 520 L${x + 52} 520 M${x + 15} 460 L${x + 43} 460 M${x + 150} 360 L${x + 150} 420`;
      return {
        mid: { lines: [{ d: crane(420) + " " + crane(600), w: 2.2 }, { d: waves(640, 5, 8).join(" "), w: 1.3 }],
          washes: [["wash-blue", -80, 600, 1240, 380, 0.55]],
          actors: `<path id="${S}-hook" d="M570 420 L570 470 m-8 0 q8 14 16 0" stroke-width="2"/>` },
        fg: { lines: [{ d: "M0 900 L1080 880 M0 940 L1080 920", w: 2.6 }, { d: balusters(30, 1050, 60, 900, 940, -20 / 1080), w: 1.4 }, { d: "M960 900 L960 700 M940 700 h40 M944 700 c4 -30 28 -30 32 0", w: 2.2 }],
          washes: [["wash-lilac", 900, 640, 140, 140, 0.6]], actors: "" },
        life: `setT(S+"-hook","translate(0 "+(Math.sin(t*.9)*16).toFixed(1)+")");css(S+"-mid",g(S+"-mid").style.transform+" translateX("+(Math.sin(t*.7)*6).toFixed(1)+"px)");`,
      };
    },
  },
};

/** Normalise a city name or tag to a key in CITIES. */
export function cityKey(name = "") {
  const s = String(name).toLowerCase();
  if (s.includes("dar")) return "dar";
  for (const k of Object.keys(CITIES)) if (s.includes(k)) return k;
  return "arusha";
}
