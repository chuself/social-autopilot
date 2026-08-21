const key = process.env.GROQ_API_KEY;
const prompt = `Write ONE short social post for a hotel system in Tanzania.
Return ONLY JSON: {"headline":"max 8 words","caption":"25 words"}
Write in natural Tanzanian Kiswahili.`;
for (const model of ["openai/gpt-oss-120b", "qwen/qwen3.6-27b", "openai/gpt-oss-20b"]) {
  const t0 = Date.now();
  try {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], response_format: { type: "json_object" }, temperature: 0.8 }),
      signal: AbortSignal.timeout(45000),
    });
    const j = await r.json();
    if (j.error) { console.log(`${model.padEnd(22)} ERR ${j.error.message.slice(0,60)}`); continue; }
    const txt = j.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(txt);
    console.log(`${model.padEnd(22)} ok ${Date.now()-t0}ms  "${(parsed.headline||"").slice(0,44)}"`);
  } catch (e) { console.log(`${model.padEnd(22)} FAIL ${e.message.slice(0,60)}`); }
}
