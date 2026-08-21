for (const u of [
  "https://ai.metricool.com/.well-known/oauth-protected-resource",
  "https://ai.metricool.com/.well-known/oauth-authorization-server",
]) {
  try {
    const r = await fetch(u, { signal: AbortSignal.timeout(20000) });
    console.log(`\n${u}\n  ${r.status}`);
    if (r.ok) {
      const j = await r.json();
      console.log("  " + JSON.stringify(j, null, 1).split("\n").join("\n  ").slice(0, 900));
    }
  } catch (e) { console.log(`${u} — ${e.message}`); }
}
