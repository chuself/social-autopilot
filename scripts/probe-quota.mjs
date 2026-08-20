const key = process.env.GEMINI_API_KEY;
const models = ["gemini-3.1-flash-lite","gemini-3.5-flash-lite","gemini-flash-lite-latest","gemini-2.5-flash-lite","gemini-3-flash-preview","gemini-3.5-flash","gemini-3.7-flash"];
for (const m of models) {
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: 'Reply with only: OK' }] }] }),
    });
    const j = await res.json();
    const txt = j.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    console.log(m.padEnd(30), res.status, txt ?? (j.error?.message ?? "").split(".")[0].slice(0, 60));
  } catch (e) { console.log(m.padEnd(30), "ERR", e.message.slice(0, 50)); }
}
