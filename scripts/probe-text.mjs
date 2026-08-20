const prompt = 'Return ONLY JSON: {"ok":true,"lang":"sw","greeting":"a short Swahili greeting"}';
const url = `https://text.pollinations.ai/${encodeURIComponent(prompt)}?model=openai&json=true`;
try {
  const res = await fetch(url, { signal: AbortSignal.timeout(45000) });
  console.log("GET", res.status, res.headers.get("content-type"));
  const t = await res.text();
  console.log(t.slice(0, 300));
} catch (e) { console.log("GET failed:", e.message); }

try {
  const res = await fetch("https://text.pollinations.ai/openai", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: "openai",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(45000),
  });
  console.log("\nPOST", res.status);
  const j = await res.text();
  console.log(j.slice(0, 400));
} catch (e) { console.log("POST failed:", e.message); }
