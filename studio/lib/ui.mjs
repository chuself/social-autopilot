// Operra product UI, rebuilt as live DOM.
//
// These are faithful reconstructions of the screens in the site captures
// (assets/ui/*.webp is now reference only): same chrome, same tile structure,
// same type hierarchy, brand tokens throughout — but every row, number, chip and
// button is a real element with its own id, so it can be animated, counted,
// flipped or slid on its own. A flat screenshot can do none of that.
//
// Labels are ENGLISH, because that is how the client's app actually ships and
// what a prospect sees in a demo. Only the ad's own captions are Swahili.
// Numbers describe an 18-room property, not the 40+ room demo data in the
// captures.
import fs from 'fs';
import path from 'path';

// The product's own icon set (Lucide — the same package operra-web is built on),
// frozen by scripts/build-icons.mjs. Inline SVG, stroked to match the UI.
const ICONS = JSON.parse(fs.readFileSync(new URL('../assets/icons.json', import.meta.url), 'utf8'));

export const ico = (name, { size = 24, stroke = 2, cls = '' } = {}) => {
  if (!ICONS[name]) throw new Error(`icon not extracted: ${name} (add it to scripts/build-icons.mjs)`);
  return `<svg class="ico ${cls}" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none"
       stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round"
       stroke-linejoin="round">${ICONS[name]}</svg>`;
};

export const P = {
  bg: '#040f13', card: '#0b1820', elev: '#0e1c26', sec: '#162631',
  text: '#f3f5f8', muted: '#8d9aa8', light: '#7d8a97',  // lifted from the site's #5d6a78: fails WCAG AA on card backgrounds at this size
  primary: '#a478ff', glow: '#cf9bff', teal: '#36d2ba', cream: '#fbedd1',
  hair: 'rgba(255,255,255,.08)', neg: '#f94144', whatsapp: '#25D366',
};

/* ── chrome ──────────────────────────────────────────────────────────────── */

// The browser shell every desktop screen sits in.
export const browser = (id, url, inner, { width = 980, extra = '' } = {}) => `
<div id="${id}" class="win" style="width:${width}px;${extra}">
  <div class="winbar">
    <span class="dot" style="background:#ff5f57"></span>
    <span class="dot" style="background:#febc2e"></span>
    <span class="dot" style="background:#28c840"></span>
    <span class="url"><i class="live"></i>${url}</span>
  </div>
  <div class="winbody">${inner}</div>
</div>`;

export const phone = (id, inner, { width = 470, extra = '' } = {}) => `
<div id="${id}" class="phone" style="width:${width}px;${extra}">
  <div class="notch"></div>
  <div class="phonebody">${inner}</div>
</div>`;

/* ── front desk ──────────────────────────────────────────────────────────── */

export const kpi = (id, label, value, sub) => `
<div class="kpi" id="${id}">
  <div class="kpilabel">${label}</div>
  <div class="kpival" id="${id}-v">${value}</div>
  <div class="kpisub">${sub}</div>
</div>`;

export const guestRow = (id, initial, name, room, extra = '') => `
<div class="grow" id="${id}" style="${extra}">
  <span class="ava">${initial}</span>
  <span class="gname">${name}</span>
  <span class="groom">Room ${room}</span>
</div>`;

export const frontDesk = (id, { rows, occupancy = '78%', available = '4', checkins = '0', overlay = '', compact = false }) =>
  browser(id, 'managix.operra.tech/front-desk', `
    <div class="wrow">
      <div class="wtitle"><i class="live"></i>Bahari Hotel &middot; Front Desk</div>
      <div class="wbtns">
        ${compact ? '' : `<span class="wbtn" id="${id}-b1">New Reservation</span>
        <span class="wbtn" id="${id}-b2">Check In</span>`}
        <span class="wchip" id="${id}-net">${ico('wifi', { size: 22 })}Online</span>
        ${overlay}
      </div>
    </div>
    <div class="kpis">
      ${kpi(`${id}-k1`, 'OCCUPANCY', occupancy, 'Live')}
      ${kpi(`${id}-k2`, 'ROOMS FREE', available, 'Live')}
      ${kpi(`${id}-k3`, 'CHECK-INS TODAY', checkins, 'Live')}
    </div>
    <div class="opsbar" id="${id}-ops"><span>Today's Operations</span><span class="opsr">3 departing</span></div>
    <div class="rows">${rows}</div>`);

/* ── restaurant POS ──────────────────────────────────────────────────────── */

const NAV = ['Dashboard', 'POS', 'Tables', 'Reservations', 'Active Orders', 'Kitchen', 'Bar', 'Menu', 'Inventory', 'Reports'];

export const posTile = (id, icon, title, sub, active = false) => `
<div class="ptile${active ? ' on' : ''}" id="${id}">
  <span class="picon">${icon}</span>
  <span class="ptitle">${title}</span>
  <span class="psub">${sub}</span>
</div>`;

export const pos = (id) => browser(id, 'managix.operra.tech/pos', `
  <div class="posgrid">
    <div class="nav">
      <div class="navlabel">MODE</div>
      <div class="navmodes"><span>Waiter</span><span>Kitchen</span><span class="on">Bar</span></div>
      ${NAV.map((n, i) => `<div class="navitem${n === 'POS' ? ' sel' : ''}" id="${id}-n${i}">${n}</div>`).join('')}
    </div>
    <div class="posmain">
      <div class="posstats">
        <span class="pstat" id="${id}-s1">Shift <b>23h 47m</b></span>
        <span class="pstat" id="${id}-s2">Cash <b>TSh 85,000</b></span>
        <span class="pstat" id="${id}-s3">Orders <b>2</b></span>
      </div>
      <div class="posq">What kind of order?</div>
      <div class="ptiles">
        ${posTile(`${id}-t1`, ico('utensils', { size: 34 }), 'Dine-In', 'Seat in-house guest', true)}
        ${posTile(`${id}-t2`, ico('bed-double', { size: 34 }), 'Room Service', 'Charge to a guest folio')}
        ${posTile(`${id}-t3`, ico('shopping-bag', { size: 34 }), 'Takeaway', 'Settle at the counter')}
        ${posTile(`${id}-t4`, ico('calendar-days', { size: 34 }), 'Reserve Table', 'Book for an in-house guest')}
        ${posTile(`${id}-t5`, ico('sparkles', { size: 34 }), 'Event', 'Module disabled')}
        ${posTile(`${id}-t6`, ico('wine', { size: 34 }), 'Bar Tab', 'Open tab, settle later')}
      </div>
    </div>
  </div>`, { width: 900 });

/* ── the bar bill / folio ────────────────────────────────────────────────── */

export const billLine = (id, label, value, cls = '') =>
  `<div class="bline ${cls}" id="${id}"><span>${label}</span><span class="bval">${value}</span></div>`;

export const folio = (id, { title, lines, totalLabel, total }) => `
<div class="fcard" id="${id}">
  <div class="fhead">${title}</div>
  ${lines}
  <div class="btot" id="${id}-tot"><span>${totalLabel}</span><span class="bval" id="${id}-totv">${total}</span></div>
</div>`;

/* ── check-in wizard ─────────────────────────────────────────────────────── */

export const field = (id, label, value) =>
  `<div class="fld" id="${id}"><span class="fldl">${label}</span><span class="fldv" id="${id}-v">${value}</span></div>`;

export const wizard = (id, { step, chip, title, body, fields, overlay = '' }) => browser(id, 'managix.operra.tech/front-desk', `
  <div class="wstep"><i class="live"></i>${step}</div>
  <div class="wpill">${chip}</div>
  <div class="wh2">${title}</div>
  <div class="wp">${body}</div>
  <div class="live-action">
    <div class="lahead"><span>Live action</span><span>11:30</span></div>
    <div class="flds">${fields}${overlay}</div>
  </div>`);

export const quickAction = (id, icon, label) =>
  `<div class="qa" id="${id}"><span class="qaicon">${icon}</span>${label}</div>`;

/* ── reports, on a phone ─────────────────────────────────────────────────── */

export const reportRow = (id, icon, title, sub) => `
<div class="rrow" id="${id}">
  <span class="ricon">${icon}</span>
  <span class="rtext"><b>${title}</b><i>${sub}</i></span>
  <span class="rchev">${ico('chevron-right', { size: 22 })}</span>
</div>`;

export const reportsHub = (id, rows, opts = {}) => phone(id, `
  <div class="rlabel">REPORTS</div>
  <div class="rtitle">Reports Hub</div>
  <div class="rsearch">Search reports...</div>
  <div class="rchips"><span class="on">All</span><span>Finance</span><span>Front Office</span><span>HR</span></div>
  <div class="rrows">${rows}</div>
  <div class="rexport" id="${id}-exp"><span>Export PDF</span><span>Ready</span></div>`, opts);

/* ── pricing ─────────────────────────────────────────────────────────────── */

export const priceCard = (id, { rooms, saveLine, termLine, features, overlay = '' }) => `
<div class="pcard" id="${id}">
  <div class="prow"><span class="plabel">PROPERTY SIZE</span><span class="prooms" id="${id}-rooms">${rooms}</span></div>
  <div class="ptrack"><div class="pfill" id="${id}-fill"></div><div class="phandle" id="${id}-handle"></div></div>
  <div class="pscale"><span>10</span><span>25</span></div>
  <div class="pamount"><span class="pcur">TSh</span><span class="pnum" id="${id}-num">0</span><span class="pper">/mo</span>${overlay}</div>
  <div class="psave" id="${id}-save">${saveLine}</div>
  <div class="pterm" id="${id}-term">${termLine}</div>
  <div class="pfeat">${features}</div>
</div>`;

export const feature = (id, text) =>
  `<div class="pfeature" id="${id}"><span class="ptick">${ico('check', { size: 24, stroke: 2.6 })}</span>${text}</div>`;

/* ── kitchen display ─────────────────────────────────────────────────────── */

// tickets: [{ code, state: "new"|"fired"|"plating"|"delay", items: [..], age }]
export const kitchenBoard = (id, tickets) => browser(id, 'managix.operra.tech/kitchen', `
  <div class="wrow"><div class="wtitle"><i class="live"></i>Kitchen Display &middot; Hot Station</div>
    <span class="wchip">${ico('chef-hat', { size: 22 })}Live</span></div>
  <div class="kgrid">${tickets.map((t, i) => `
    <div class="kt k-${t.state}" id="${id}-t${i}">
      <div class="kth"><b>${t.code}</b><span class="kst">${t.state}</span></div>
      ${t.items.map((x) => `<div class="kti">${x}</div>`).join('')}
      <div class="ktf">${ico('timer', { size: 20 })}<span>${t.age}</span><span class="kready">Ready</span></div>
    </div>`).join('')}</div>`, { width: 920 });

/* ── in-room QR menu, on the guest's phone ───────────────────────────────── */

// lines: orderLines(ledger) — "2 × Coffee", each, value — so the checker can add them up
export const guestMenu = (id, { room, lines, total }) => phone(id, `
  <div class="rlabel">MENU &middot; ROOM ${room}</div>
  <div class="rtitle">Main Restaurant</div>
  <div class="mqr">${ico('qr-code', { size: 22 })}Scanned in room &middot; stay PIN confirmed</div>
  <div class="pos mcart">
    ${lines.map((l, i) => `<div class="bline" id="${id}-l${i}"><span>${l.label}<i class="each">${l.each} each</i></span><span class="bval">${l.value}</span></div>`).join('')}
    <div class="btot"><span>Total</span><span class="bval">${total}</span></div>
  </div>
  <div class="msend" id="${id}-send">Send to kitchen &middot; bill to room</div>
  <div class="mappr" id="${id}-appr">${ico('check', { size: 22, stroke: 2.6 })}Approved at front desk</div>`, { width: 520 });

/* ── housekeeping board ──────────────────────────────────────────────────── */

const HK = { clean: 'Clean', dirty: 'Dirty', occupied: 'Occupied', maintenance: 'Maintenance', out: 'Out' };

// rooms: [{ no, state }]; the room at index `flip` turns from dirty to clean on screen
export const housekeepingBoard = (id, rooms, flip) => browser(id, 'managix.operra.tech/housekeeping', `
  <div class="wrow"><div class="wtitle"><i class="live"></i>Housekeeping &middot; Floor board</div>
    <span class="wchip">${ico('spray-can', { size: 22 })}Live</span></div>
  <div class="hklegend">${Object.entries(HK).map(([k, v]) => `<span><i class="hk-${k}"></i>${v}</span>`).join('')}</div>
  <div class="hkgrid">${rooms.map((r, i) => `
    <div class="hkt hk-${r.state}" id="${id}-r${i}"><b>${r.no}</b>${i === flip
      ? `<span class="hkflip"><span class="fa">Dirty</span><span class="fb">Clean</span></span>`
      : `<span>${HK[r.state]}</span>`}</div>`).join('')}</div>`, { width: 920 });

/* ── public table booking, on the guest's phone ──────────────────────────── */

export const bookingPhone = (id, { party, time }) => phone(id, `
  <div class="rlabel">BOOK A TABLE</div>
  <div class="rtitle">Main Restaurant</div>
  <div class="fld" id="${id}-f0" style="margin-bottom:12px"><span class="fldl">PARTY SIZE</span><span class="fldv">${party}</span></div>
  <div class="fld" id="${id}-f1" style="margin-bottom:16px"><span class="fldl">TODAY</span><span class="fldv">${time}</span></div>
  <div class="msend" id="${id}-send">Request reservation</div>
  <div class="mappr" id="${id}-appr">${ico('check', { size: 22, stroke: 2.6 })}Confirmed by the restaurant</div>`, { width: 470 });

/* ── restaurant floor ────────────────────────────────────────────────────── */

// tables: [{ name, seats, state: "seated"|"free"|"reserved" }]; the one at `flip` is a
// reservation that turns free on screen (a no-show released)
export const floorPlan = (id, tables, flip) => browser(id, 'managix.operra.tech/tables', `
  <div class="wrow"><div class="wtitle"><i class="live"></i>Main Restaurant &middot; Floor</div>
    <span class="wchip">${ico('utensils', { size: 22 })}Live</span></div>
  <div class="flgrid">${tables.map((t, i) => `
    <div class="flt fl-${t.state}" id="${id}-t${i}"><span class="fltop"><b>${t.name}</b></span>
      <i>${t.seats} seats</i>${i === flip
        ? `<span class="hkflip"><span class="fa">Reserved</span><span class="fb">Free</span></span>`
        : `<span class="flst">${t.state[0].toUpperCase() + t.state.slice(1)}</span>`}</div>`).join('')}</div>`, { width: 920 });

/* ── events calendar ─────────────────────────────────────────────────────── */

// events: [{ time, name, pax, venue, chip }]
export const eventsDay = (id, events) => browser(id, 'managix.operra.tech/events', `
  <div class="wrow"><div class="wtitle"><i class="live"></i>Events &middot; Today</div>
    <span class="wchip">${ico('calendar-check', { size: 22 })}Day view</span></div>
  ${events.map((e, i) => `
    <div class="evrow" id="${id}-e${i}">
      <span class="evtime">${e.time}</span>
      <span class="evtext"><b>${e.name}</b><i>${e.venue} &middot; ${e.pax} pax</i></span>
      ${e.chip ? `<span class="evchip">${e.chip}</span>` : ''}
    </div>`).join('')}`, { width: 920 });

/* ── shared stylesheet ───────────────────────────────────────────────────── */

export const UI_CSS = `
  .win{position:absolute;border-radius:22px;overflow:hidden;background:${P.card};
       border:1px solid rgba(255,255,255,.09);
       box-shadow:0 60px 140px -40px rgba(0,0,0,.95),0 30px 90px -30px rgba(164,120,255,.42)}
  .winbar{display:flex;align-items:center;gap:10px;padding:16px 22px;background:#070f14;
          border-bottom:1px solid ${P.hair}}
  .dot{width:14px;height:14px;border-radius:50%;display:inline-block}
  .url{margin:0 auto;display:flex;align-items:center;gap:10px;background:#0d1b23;
       border-radius:100px;padding:8px 26px;font-size:20px;color:${P.muted}}
  .live{width:10px;height:10px;border-radius:50%;background:${P.teal};display:inline-block;
        box-shadow:0 0 12px ${P.teal}}
  .winbody{padding:26px 28px 30px}

  .wrow{display:flex;align-items:center;justify-content:space-between;margin-bottom:24px}
  .wtitle{display:flex;align-items:center;gap:12px;font-size:26px;color:${P.text};font-weight:600}
  .wbtns{display:flex;align-items:center;gap:12px}
  .wbtn{font-size:20px;color:${P.muted};border:1px solid ${P.hair};border-radius:100px;padding:9px 20px}
  .wchip{display:inline-flex;align-items:center;gap:9px;font-size:20px;color:${P.teal};
         border:1.5px solid rgba(54,210,186,.42);border-radius:100px;padding:9px 20px}
  .wchip .ico{color:${P.teal}}

  .kpis{display:flex;gap:16px;margin-bottom:22px}
  .kpi{flex:1;background:${P.elev};border:1px solid ${P.hair};border-radius:16px;padding:22px 24px}
  .kpilabel{font-size:19px;letter-spacing:.10em;color:${P.light}}
  .kpival{font-size:60px;font-weight:600;color:${P.primary};line-height:1.1;margin-top:6px}
  .kpisub{font-size:17px;color:${P.light};margin-top:4px}

  .opsbar{display:flex;justify-content:space-between;align-items:center;
          background:rgba(164,120,255,.09);border:1.5px solid rgba(164,120,255,.34);
          border-radius:100px;padding:14px 26px;font-size:22px;color:${P.text}}
  .opsr{color:${P.primary};font-size:20px}
  .rows{margin-top:14px}
  .grow{display:flex;align-items:center;gap:18px;padding:16px 14px;border-bottom:1px solid ${P.hair}}
  .ava{width:44px;height:44px;border-radius:50%;background:rgba(164,120,255,.18);color:${P.glow};
       font-size:20px;display:flex;align-items:center;justify-content:center;flex:none}
  .gname{font-size:26px;color:${P.text};flex:1}
  .groom{font-size:22px;color:${P.muted}}

  .posgrid{display:flex;gap:0;margin:-26px -28px -30px}
  .nav{width:210px;flex:none;background:#070f14;border-right:1px solid ${P.hair};padding:22px 0 30px}
  .navlabel{font-size:16px;letter-spacing:.14em;color:${P.light};padding:0 22px 10px}
  .navmodes{display:flex;gap:6px;padding:0 16px 16px;flex-wrap:wrap}
  .navmodes span{font-size:15px;color:${P.muted};border:1px solid ${P.hair};border-radius:6px;padding:4px 9px}
  .navmodes .on{color:${P.teal};border-color:rgba(54,210,186,.5)}
  .navitem{font-size:20px;color:${P.muted};padding:12px 22px}
  .navitem.sel{color:${P.text};background:rgba(164,120,255,.14);
               box-shadow:inset 3px 0 0 ${P.primary}}
  .posmain{flex:1;padding:22px 26px 26px}
  .posstats{display:flex;gap:10px;margin-bottom:22px}
  .pstat{font-size:17px;color:${P.muted};background:${P.elev};border:1px solid ${P.hair};
         border-radius:10px;padding:10px 14px}
  .pstat b{color:${P.text};font-weight:600;display:block;font-size:19px}
  .posq{text-align:center;font-size:30px;color:${P.text};margin-bottom:20px}
  .ptiles{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
  .ptile{background:${P.elev};border:1px solid ${P.hair};border-radius:14px;
         padding:20px 12px;text-align:center;display:flex;flex-direction:column;gap:6px}
  .ptile.on{border-color:rgba(164,120,255,.6);background:rgba(164,120,255,.1)}
  .ico{display:block;flex:none}
  .picon{color:${P.glow};display:flex;justify-content:center}
  .ptile.on .picon{color:${P.text}}
  .ptitle{font-size:21px;color:${P.text};font-weight:600}
  .psub{font-size:15px;color:${P.light};line-height:1.3}

  .fcard{position:absolute;background:${P.card};border:1px solid ${P.hair};border-radius:22px;
         padding:26px 30px;box-shadow:0 50px 120px -40px rgba(0,0,0,.95)}
  .fhead{font-size:21px;letter-spacing:.1em;color:${P.light};margin-bottom:16px}
  .bline{display:flex;justify-content:space-between;padding:14px 0;font-size:27px;color:${P.text};
         border-bottom:1px solid ${P.hair}}
  .bval{color:${P.text}}
  .btot{display:flex;justify-content:space-between;padding-top:20px;font-size:32px;
        font-weight:600;color:${P.text}}
  .btot .bval{color:${P.primary}}

  .wstep{display:flex;align-items:center;gap:12px;font-size:21px;color:${P.muted};margin-bottom:16px}
  .wpill{display:inline-block;font-size:21px;color:${P.glow};background:rgba(164,120,255,.14);
         border-radius:100px;padding:9px 22px;margin-bottom:18px}
  .wh2{font-size:38px;color:${P.text};font-weight:600;margin-bottom:12px}
  .wp{font-size:24px;color:${P.muted};line-height:1.45;margin-bottom:24px}
  .live-action{background:${P.elev};border:1px solid ${P.hair};border-radius:16px;padding:20px 22px}
  .lahead{display:flex;justify-content:space-between;font-size:19px;color:${P.light};margin-bottom:16px}
  .flds{display:flex;gap:14px}
  .fld{flex:1;background:#08131a;border:1px solid ${P.hair};border-radius:12px;padding:16px 18px}
  .fldl{display:block;font-size:17px;letter-spacing:.1em;color:${P.light}}
  .fldv{display:block;font-size:28px;color:${P.text};margin-top:6px}

  .qa{position:absolute;width:450px;display:flex;align-items:center;gap:18px;background:${P.card};
      border:1px solid ${P.hair};border-radius:18px;padding:26px 30px;font-size:32px;
      font-weight:600;color:${P.text};box-shadow:0 30px 70px -28px rgba(0,0,0,.9)}
  .qaicon{color:${P.glow};display:flex}

  .phone{position:absolute;border-radius:46px;background:#050d12;padding:16px;
         border:1px solid rgba(255,255,255,.12);
         box-shadow:0 70px 150px -40px rgba(0,0,0,.95),0 30px 90px -30px rgba(164,120,255,.4)}
  .notch{width:120px;height:16px;border-radius:100px;background:#0b1820;margin:6px auto 12px}
  .phonebody{background:${P.card};border-radius:34px;padding:24px 20px 20px}
  .rlabel{font-size:16px;letter-spacing:.16em;color:${P.light}}
  .rtitle{font-size:30px;color:${P.text};font-weight:600;margin:4px 0 16px}
  .rsearch{background:${P.elev};border:1px solid ${P.hair};border-radius:12px;padding:14px 16px;
           font-size:19px;color:${P.light}}
  .rchips{display:flex;gap:8px;margin:14px 0 12px}
  .rchips span{font-size:16px;color:${P.muted};background:${P.elev};border-radius:100px;padding:7px 14px}
  .rchips .on{background:rgba(164,120,255,.2);color:${P.glow}}
  .rrow{display:flex;align-items:center;gap:14px;background:${P.elev};border:1px solid ${P.hair};
        border-radius:14px;padding:14px 16px;margin-bottom:10px}
  .ricon{width:44px;height:44px;border-radius:11px;background:rgba(164,120,255,.16);color:${P.glow};
         display:flex;align-items:center;justify-content:center;flex:none}
  .rtext{flex:1;display:flex;flex-direction:column}
  .rtext b{font-size:21px;color:${P.text};font-weight:600}
  .rtext i{font-size:16px;color:${P.light};font-style:normal;margin-top:2px}
  .rchev{color:${P.light};display:flex}
  .rexport{display:flex;justify-content:space-between;align-items:center;margin-top:14px;
           background:rgba(164,120,255,.16);border-radius:12px;padding:14px 18px;
           font-size:19px;color:${P.glow}}

  .pcard{position:absolute;background:${P.card};border:1.5px solid rgba(164,120,255,.34);
         border-radius:26px;padding:34px 38px;
         box-shadow:0 60px 140px -40px rgba(0,0,0,.95),0 0 90px -20px rgba(164,120,255,.35)}
  /* anchored overlays: positioned by their parent element, not by scene coords */
  .wbtns,.flds,.pamount,.ptiles{position:relative}
  .ringfit{position:absolute;inset:-10px -14px;border:3px solid ${P.glow};border-radius:18px;
           box-shadow:0 0 34px rgba(164,120,255,.55);opacity:0;pointer-events:none}
  .tag{position:absolute;white-space:nowrap}
  .pill.sm{padding:14px 26px;font-size:30px}
  .pill.sm .sub{font-size:22px}

  .prow{display:flex;justify-content:space-between;align-items:baseline}
  .plabel{font-size:21px;letter-spacing:.12em;color:${P.light}}
  .prooms{font-size:28px;color:${P.text};font-weight:600}
  .ptrack{position:relative;height:10px;border-radius:100px;background:${P.sec};margin:20px 0 10px}
  .pfill{position:absolute;left:0;top:0;height:10px;border-radius:100px;
         background:linear-gradient(90deg,${P.primary},${P.glow});width:0}
  .phandle{position:absolute;top:-11px;left:0;width:32px;height:32px;border-radius:50%;
           background:${P.text};border:3px solid ${P.primary};margin-left:-16px}
  .pscale{display:flex;justify-content:space-between;font-size:19px;color:${P.light}}
  .pamount{display:flex;align-items:baseline;gap:12px;margin-top:22px}
  .pcur{font-size:34px;color:${P.muted}}
  .pnum{font-size:96px;font-weight:600;color:${P.text};line-height:1}
  .pper{font-size:30px;color:${P.muted}}
  .psave{font-size:22px;color:${P.glow};margin-top:8px}
  .pterm{font-size:20px;color:${P.light};margin-top:10px;padding-bottom:22px;
         border-bottom:1px solid ${P.hair}}
  .pfeat{margin-top:20px}
  .pfeature{display:flex;gap:14px;font-size:23px;color:${P.text};padding:9px 0;line-height:1.35}
  .ptick{color:${P.primary};display:flex;padding-top:2px}

  .kgrid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
  .kt{background:${P.elev};border:1.5px solid ${P.hair};border-radius:16px;padding:18px 20px;
      border-top:6px solid ${P.teal}}
  .kt.k-new{border-top-color:${P.glow}}
  .kt.k-plating{border-top-color:${P.teal}}
  .kt.k-delay{border-top-color:#f8a43a}
  .kth{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
  .kth b{font-size:28px;color:${P.text}}
  .kst{font-size:17px;letter-spacing:.08em;text-transform:uppercase;color:${P.muted};
       border:1px solid ${P.hair};border-radius:100px;padding:5px 12px}
  .k-delay .kst{color:#f8a43a;border-color:rgba(248,164,58,.5)}
  .kti{font-size:23px;color:${P.text};padding:5px 0}
  .ktf{display:flex;align-items:center;gap:8px;margin-top:10px;font-size:20px;color:${P.muted}}
  .kready{margin-left:auto;color:${P.teal};border:1.5px solid rgba(54,210,186,.45);
          border-radius:100px;padding:5px 14px;font-size:17px}

  .mqr{display:flex;align-items:center;gap:10px;font-size:17px;color:${P.teal};margin-bottom:14px}
  .mcart{background:${P.elev};border:1px solid ${P.hair};border-radius:16px;padding:6px 18px 16px}
  .mcart .bline{font-size:22px}
  .mcart .btot{font-size:26px}
  .msend{margin-top:16px;text-align:center;font-size:20px;font-weight:600;color:${P.bg};
         background:linear-gradient(90deg,${P.primary},${P.glow});border-radius:14px;padding:16px}
  .mappr{display:flex;align-items:center;justify-content:center;gap:10px;margin-top:12px;
         font-size:20px;color:${P.teal};border:1.5px solid rgba(54,210,186,.45);border-radius:14px;padding:13px}

  .hklegend{display:flex;gap:18px;flex-wrap:wrap;font-size:18px;color:${P.muted};margin-bottom:18px}
  .hklegend span{display:flex;align-items:center;gap:8px}
  .hklegend i{width:14px;height:14px;border-radius:4px;display:inline-block}
  .hkgrid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
  .hkt{border-radius:14px;padding:16px 16px 14px;display:flex;flex-direction:column;gap:4px;
       background:${P.elev};border:1.5px solid ${P.hair};font-size:17px;color:${P.muted}}
  .hkt b{font-size:30px;color:${P.text}}
  .hklegend .hk-clean{background:rgba(54,210,186,.9)} .hkt.hk-clean{background:rgba(54,210,186,.12);border-color:rgba(54,210,186,.5)}
  .hklegend .hk-dirty{background:rgba(248,164,58,.9)} .hkt.hk-dirty{background:rgba(248,164,58,.1);border-color:rgba(248,164,58,.45)}
  .hklegend .hk-occupied{background:${P.primary}} .hkt.hk-occupied{background:rgba(164,120,255,.12);border-color:rgba(164,120,255,.45)}
  .hklegend .hk-maintenance{background:#7d8a97} .hklegend .hk-out{background:${P.neg}}
  .hkt.hk-maintenance{border-color:rgba(125,138,151,.6)} .hkt.hk-out{border-color:rgba(249,65,68,.5);opacity:.7}
  .hkflip{position:relative;display:block;height:1.3em;overflow:hidden}
  .hkflip span{position:absolute;left:0;top:0}
  .hkflip .fa{color:#f8a43a}
  .hkflip .fb{color:${P.teal};font-weight:600}

  .flgrid{display:grid;grid-template-columns:repeat(3,210px);justify-content:space-around;row-gap:18px}
  .flt{border-radius:50%;aspect-ratio:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;
       background:${P.elev};border:2px solid ${P.hair};font-size:18px;color:${P.muted}}
  .flt b{font-size:32px;color:${P.text}}
  .flt i{font-style:normal;font-size:16px;color:${P.light}}
  .flt.fl-seated{background:rgba(164,120,255,.14);border-color:rgba(164,120,255,.5)}
  .flt.fl-free{background:rgba(54,210,186,.1);border-color:rgba(54,210,186,.5)}
  .flt.fl-reserved{background:rgba(248,164,58,.1);border-color:rgba(248,164,58,.5)}
  .flt .hkflip{width:6em;text-align:center}
  .flt .hkflip span{left:0;right:0}
  .evrow{display:flex;align-items:center;gap:20px;background:${P.elev};border:1px solid ${P.hair};
         border-left:6px solid ${P.primary};border-radius:14px;padding:18px 20px;margin-bottom:14px}
  .evtime{font-size:22px;color:${P.glow};width:190px;flex:none}
  .evtext{flex:1;display:flex;flex-direction:column}
  .evtext b{font-size:26px;color:${P.text};font-weight:600}
  .evtext i{font-style:normal;font-size:19px;color:${P.muted};margin-top:4px}
  .evchip{font-size:18px;color:${P.teal};border:1.5px solid rgba(54,210,186,.45);border-radius:100px;
          padding:7px 14px;white-space:nowrap}
`;
