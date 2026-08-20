for (const url of process.argv.slice(2)) {
  try {
    const res = await fetch(url, { method: "HEAD" });
    console.log(res.status, (res.headers.get("content-type") ?? "?").padEnd(12), res.headers.get("content-length") ?? "?", url);
  } catch (e) { console.log("ERR", e.message, url); }
}
