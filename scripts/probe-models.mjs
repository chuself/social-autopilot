const r = await fetch("https://image.pollinations.ai/models", { signal: AbortSignal.timeout(20000) });
console.log("status", r.status);
const t = await r.text();
console.log(t.slice(0, 500));
