/**
 * Every figure a reel shows is computed here, never written by the model.
 *
 * The brief may only REFER to numbers through tokens ({nights}, {rightTotal}…);
 * a digit typed into any line, chip or document field is rejected. The model
 * is a poor calculator, and a viewer who sees 12 × 180 = 2,520 stops
 * believing everything else in the ad.
 *
 * These are example figures inside a mock screen or invoice, not claims about
 * Operra. Claims (percentages, client results) come only from facts.md.
 */

function lcg(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

export function hash(str) {
  let h = 2166136261;
  for (const ch of String(str)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

const pick = (r, list) => list[Math.floor(r() * list.length)];

// Plausible ranges for Tanzanian properties.
const PROFILES = {
  USD: { rates: [90, 110, 120, 140, 150, 160, 180, 200, 220, 240], over: [15, 20, 25, 30, 40], nights: [3, 4, 5, 6, 7, 8, 10, 12] },
  TSh: { rates: [85000, 95000, 110000, 120000, 135000, 150000, 180000], over: [10000, 15000, 20000, 25000], nights: [3, 4, 5, 6, 7] },
};

/** "USD 2,160" / "TSh 450,000" */
export function money(n, currency) {
  if (!Number.isFinite(n)) throw new Error(`not a number: ${n}`);
  return `${currency} ${Math.round(n).toLocaleString("en-US")}`;
}

/**
 * One ledger per reel, shared by every scene, so the invoice in scene 2 and
 * the folio in scene 3 and the payment in scene 4 can never disagree.
 *
 * The currency follows the language and nothing else: a Swahili reel speaks
 * to a local owner in TSh, an English one in USD. Mixing them (a Swahili
 * voice over a USD invoice) reads as an ad made for somebody else.
 *
 * @param {object} want  optional {nights, rightRate, wrongRate, party}
 * @param {string} seed  the post id, so a re-render shows the same numbers
 * @param {"sw"|"en"} language
 */
export const currencyFor = (language) => (language === "sw" ? "TSh" : "USD");

export function makeLedger(want = {}, seed = "operra", language = "en") {
  const currency = currencyFor(language);
  if (want.currency && want.currency !== currency) {
    throw new Error(`ledger: a ${language} reel shows ${currency}, not ${want.currency}`);
  }
  const prof = PROFILES[currency];
  const r = lcg(hash(seed));
  const nights = want.nights ?? pick(r, prof.nights);
  const rightRate = want.rightRate ?? pick(r, prof.rates);
  const wrongRate = want.wrongRate ?? rightRate + pick(r, prof.over);
  const party = want.party ?? `AG-${String(10 + Math.floor(r() * 80)).padStart(2, "0")}`;

  for (const [k, v] of Object.entries({ nights, rightRate, wrongRate })) {
    if (!Number.isInteger(v) || v <= 0) throw new Error(`ledger.${k} must be a positive whole number, got ${v}`);
  }
  if (nights > 30) throw new Error(`ledger.nights ${nights} is not a believable stay`);
  if (wrongRate === rightRate) throw new Error("ledger: the wrong rate must differ from the right one");

  const L = {
    currency, party, nights, rightRate, wrongRate,
    rightTotal: nights * rightRate,
    wrongTotal: nights * wrongRate,
  };
  L.difference = L.wrongTotal - L.rightTotal;
  return reconcile(L);
}

/** Recompute from the inputs and refuse anything that does not add up. */
export function reconcile(L) {
  const checks = [
    [L.rightTotal, L.nights * L.rightRate, "rightTotal = nights × rightRate"],
    [L.wrongTotal, L.nights * L.wrongRate, "wrongTotal = nights × wrongRate"],
    [L.difference, L.wrongTotal - L.rightTotal, "difference = wrongTotal − rightTotal"],
  ];
  for (const [got, want, rule] of checks) if (got !== want) throw new Error(`ledger does not reconcile: ${rule} (${got} ≠ ${want})`);
  return L;
}

/** The strings a scene may show, all derived from the ledger. */
export function tokens(L) {
  const m = (n) => money(n, L.currency);
  return {
    "{party}": L.party,
    "{nights}": String(L.nights),
    "{rightRate}": m(L.rightRate),
    "{wrongRate}": m(L.wrongRate),
    "{rightTotal}": m(L.rightTotal),
    "{wrongTotal}": m(L.wrongTotal),
    "{difference}": m(L.difference),
    "{rightSum}": `${L.nights} × ${m(L.rightRate)}`,
    "{wrongSum}": `${L.nights} × ${m(L.wrongRate)}`,
  };
}

/** Replace tokens; an unknown token is an error, not a blank. */
export function fill(text, T) {
  return String(text).replace(/\{[a-zA-Z]+\}/g, (k) => {
    if (!(k in T)) throw new Error(`unknown number token ${k}`);
    return T[k];
  });
}

/** Model-written text may not carry its own digits. */
export function assertNoDigits(text, where) {
  const bare = String(text).replace(/\{[a-zA-Z]+\}/g, "");
  if (/\d/.test(bare)) throw new Error(`${where}: "${text}" has a typed number — use a {token} so the code computes it`);
}
