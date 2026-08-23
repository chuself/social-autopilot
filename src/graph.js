const VERSION = process.env.GRAPH_VERSION ?? "v21.0";
const BASE = `https://graph.facebook.com/${VERSION}`;

/** POST to the Graph API and throw a readable error on failure. */
export async function graphPost(edge, params) {
  const body = new URLSearchParams(params);
  const res = await fetch(`${BASE}/${edge}`, { method: "POST", body });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    const e = json.error ?? {};
    throw new Error(
      `Graph POST ${edge} failed (${res.status}): ${e.message ?? "unknown"}` +
        (e.code ? ` [code ${e.code}${e.error_subcode ? `/${e.error_subcode}` : ""}]` : "")
    );
  }
  return json;
}

/**
 * Many reads in one HTTP request.
 *
 * Comment polling was one connection per post, every thirty minutes: on a Page
 * with 34 recent posts that is ~1,300 requests a day, almost all returning
 * nothing, from data-centre IPs. That is indistinguishable from scraping, and
 * this developer account was flagged for "unusual activity" three days in.
 *
 * Meta counts each sub-request against the rate limit, so this is not a way to
 * do the same work invisibly — the caller still has to ask for less. What it
 * removes is the connection storm.
 *
 * @param {Array<{relative_url: string, name?: string}>} requests  max 50
 * @returns {Array<{ok: boolean, body: object, error?: string}>}  same order in
 *   as out; a failed sub-request never throws, because one dead post must not
 *   cost us every other post's comments.
 */
export async function graphBatch(requests, accessToken) {
  if (!requests.length) return [];
  if (requests.length > 50) throw new Error(`graphBatch takes at most 50, got ${requests.length}`);

  const body = new URLSearchParams({
    access_token: accessToken,
    include_headers: "false",
    batch: JSON.stringify(requests.map((r) => ({ method: "GET", relative_url: r.relative_url }))),
  });

  const res = await fetch(`${BASE}/`, { method: "POST", body });
  const json = await res.json().catch(() => null);

  // A failure of the batch ITSELF (auth, block, malformed) is a real error.
  if (!res.ok || json?.error || !Array.isArray(json)) {
    throw new Error(`Graph batch failed (${res.status}): ${json?.error?.message ?? "unexpected response"}`);
  }

  return json.map((entry) => {
    if (!entry) return { ok: false, body: {}, error: "empty sub-response" };
    let parsed = {};
    try {
      parsed = entry.body ? JSON.parse(entry.body) : {};
    } catch {
      return { ok: false, body: {}, error: "sub-response was not JSON" };
    }
    if (entry.code >= 400 || parsed.error) {
      return { ok: false, body: parsed, error: parsed.error?.message ?? `HTTP ${entry.code}` };
    }
    return { ok: true, body: parsed };
  });
}

export async function graphGet(edge, params) {
  const qs = new URLSearchParams(params);
  const res = await fetch(`${BASE}/${edge}?${qs}`);
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    throw new Error(`Graph GET ${edge} failed (${res.status}): ${json.error?.message ?? "unknown"}`);
  }
  return json;
}
