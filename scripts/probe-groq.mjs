const key = process.env.GROQ_API_KEY;
const r = await fetch("https://api.groq.com/openai/v1/models", { headers: { authorization: `Bearer ${key}` } });
const j = await r.json();
if (j.error) { console.log("ERR", j.error.message); process.exit(1); }
const ids = (j.data ?? []).map(m => m.id).filter(id => !/whisper|tts|guard|prompt/i.test(id));
console.log("usable models:", ids.length);
ids.slice(0, 14).forEach(id => console.log("  ", id));
