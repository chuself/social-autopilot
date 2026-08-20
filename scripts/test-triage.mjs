import { completeJson } from "../src/llm.js";
const cases = [
  "Bei gani kwa hoteli ya vyumba 20?",
  "Hii inafanya kazi bila internet?",
  "Nzuri sana 👏",
  "follow me for free followers",
];
for (const text of cases) {
  const r = await completeJson(`You handle the public comments for Operra, a hotel management system in Tanzania.
A user commented:
"""${text}"""
Return ONLY JSON: { "kind": "lead" | "question" | "praise" | "ignore", "reply": "under 40 words" }
- "lead" = wants pricing, a demo, to buy, or runs a hotel and is interested. Put a note to the owner in "reply".
- "question" = genuine question about Operra. Answer helpfully, invite to WhatsApp. Never invent prices.
- "praise" = compliment. One warm line.
- "ignore" = spam or unrelated.
Reply in the same language they wrote in.`);
  console.log(`"${text}"\n  -> [${r.kind}] ${r.reply}\n`);
}
