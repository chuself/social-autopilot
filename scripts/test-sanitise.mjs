/** The withhold rules are the safety net for public replies — test them directly. */
import { readFile } from "node:fs/promises";
const facts = await readFile(new URL("../brands/operra/facts.md", import.meta.url), "utf8");
const CTA = "https://wa.me/255700000000";

function sanitiseReply(reply) {
  const text = String(reply).trim();
  if (!text) return null;
  const phoneish = /(\+?\d[\d\s().-]{6,})/;
  const priceish = /(tsh|tzs|usd|\$|shilingi)\s*[\d,.]+/i;
  const approved = new Set(facts.match(/\d[\d.,]*/g) ?? []);
  if (phoneish.test(text) || priceish.test(text)) return null;
  for (const n of text.match(/\d[\d.,]*/g) ?? []) {
    if (!approved.has(n) && !/^\d$/.test(n)) return null;
  }
  return text.includes("wa.me") ? text : `${text}\n${CTA}`;
}

const cases = [
  ["invented phone", "Wasiliana nasi WhatsApp +255 745 500 500 kwa bei nzuri."],
  ["invented price", "Bei ni TSH 250,000 kwa mwezi."],
  ["invented stat", "Operra inapunguza muda kwa 47% ya hoteli zote."],
  ["safe answer", "Habari! Operra inasimamia mapokezi, usafi na bar sehemu moja. Karibu tuongee."],
  ["safe praise", "Asante sana! 🙏"],
];
for (const [name, text] of cases) {
  const out = sanitiseReply(text);
  console.log(`${out === null ? "WITHHELD " : "ALLOWED  "} ${name}`);
  if (out) console.log(`           ${out.replace(/\n/g, " | ")}`);
}
