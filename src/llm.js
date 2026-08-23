/**
 * Text brain. Gemini free tier first, Groq as fallback so a single exhausted
 * quota never stops the line.
 *
 * MOCK_LLM=1 returns a canned post so the whole pipeline can be exercised
 * before any API key exists.
 */
// Tried in order — free-tier models go "high demand" often enough that a single
// model id is a real outage risk for an unattended poster.
// Small, quick jobs go here first — same quota pool trick, far less contention.
const FAST_MODELS = ["gemini-3.1-flash-lite", "gemini-flash-lite-latest", "gemini-3.5-flash"];

const GEMINI_MODELS = process.env.GEMINI_MODEL
  ? [process.env.GEMINI_MODEL]
  : [
      // Full models first for quality, then the lite tier — which draws on a
      // SEPARATE free quota pool, so it keeps working after the others are spent.
      "gemini-3.5-flash",
      "gemini-flash-latest",
      "gemini-3.6-flash",
      "gemini-3-flash-preview",
      "gemini-3.1-flash-lite",
      "gemini-flash-lite-latest",
    ];
// Verified live 2026-08-21. The previously hardcoded llama-3.3-70b-versatile
// had been retired — a fallback that only fails when you finally need it.
const GROQ_MODELS = process.env.GROQ_MODEL
  ? [process.env.GROQ_MODEL]
  : ["openai/gpt-oss-120b", "openai/gpt-oss-20b"];

/**
 * @param {object} opts
 *   fast — put the lite models first. Classification and short replies are easy
 *   work, and the lite tier is far less often overloaded, which is what made
 *   simple questions take 30-50 seconds to answer.
 */
export async function completeJson(prompt, { schemaHint, fast = false } = {}) {
  if (process.env.MOCK_LLM === "1") return mockPost();
  if (fast) return await gemini.run(prompt, schemaHint, FAST_MODELS).catch(() => groq.run(prompt));

  const errors = [];
  for (const provider of [gemini, groq]) {
    if (!provider.available()) continue;
    try {
      return await provider.run(prompt, schemaHint);
    } catch (err) {
      errors.push(`${provider.name}: ${err.message}`);
    }
  }
  throw new Error(
    errors.length
      ? `All LLM providers failed —\n  ${errors.join("\n  ")}`
      : "No LLM configured. Set GEMINI_API_KEY (or GROQ_API_KEY), or run with MOCK_LLM=1."
  );
}

/**
 * Ask about an image. Used to judge what the owner actually sent — you never
 * know whether a photo is the hotel pool, a screenshot of a WhatsApp thread, a
 * blurry receipt, or a logo on white.
 *
 * Vision is Gemini-only here: Groq's chain in this project is text models, so a
 * failure has no fallback and callers must cope with null rather than break.
 * Returns null instead of throwing — a photo we cannot describe is still a
 * photo the owner can place by hand.
 */
export async function describeImage(bytes, mimeType, prompt) {
  if (!process.env.GEMINI_API_KEY) return null;
  const data = Buffer.from(bytes).toString("base64");

  for (const model of ["gemini-3.1-flash-lite", "gemini-3.5-flash"]) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-goog-api-key": process.env.GEMINI_API_KEY,
          },
          body: JSON.stringify({
            contents: [
              { role: "user", parts: [{ text: prompt }, { inlineData: { mimeType, data } }] },
            ],
            generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
          }),
        }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? `HTTP ${res.status}`);
      const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error("empty response");
      return parseJson(text);
    } catch (err) {
      console.warn(`  vision/${model}: ${err.message.slice(0, 90)}`);
    }
  }
  return null;
}

const gemini = {
  name: "gemini",
  available: () => Boolean(process.env.GEMINI_API_KEY),
  async run(prompt, _hint, models = GEMINI_MODELS) {
    let last;
    for (const model of models) {
      // Two goes per model: a transient network blip should not cost a day's post.
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          return await callGemini(model, prompt);
        } catch (err) {
          last = err;
          const transient = /fetch failed|ECONN|ETIMEDOUT|socket|network|high demand|503|429/i.test(err.message);
          console.warn(`  gemini/${model}${attempt > 1 ? " (retry)" : ""}: ${err.message.slice(0, 90)}`);
          if (!transient) break;
          if (attempt === 1) await new Promise((r) => setTimeout(r, 4000));
        }
      }
    }
    throw last;
  },
};

async function callGemini(model, prompt) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": process.env.GEMINI_API_KEY,
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.9 },
        }),
      }
    );
    const json = await res.json();
    if (!res.ok) throw new Error(json.error?.message ?? `HTTP ${res.status}`);
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("empty response");
    return parseJson(text);
}

const groq = {
  name: "groq",
  available: () => Boolean(process.env.GROQ_API_KEY),
  async run(prompt) {
    let last;
    for (const model of GROQ_MODELS) {
      try {
        return await callGroq(model, prompt);
      } catch (err) {
        last = err;
        console.warn(`  groq/${model}: ${err.message.slice(0, 90)}`);
      }
    }
    throw last;
  },
};

async function callGroq(model, prompt) {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.9,
      }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error?.message ?? `HTTP ${res.status}`);
    const text = json.choices?.[0]?.message?.content;
    if (!text) throw new Error("empty response");
    return parseJson(text);
}

/** Models sometimes wrap JSON in a fence despite being told not to. */
function parseJson(text) {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error(`response was not JSON: ${cleaned.slice(0, 200)}`);
  }
}

function mockPost() {
  return {
    eyebrow: "Housekeeping",
    headline: "The room board that stops arguments.",
    body: "Housekeeping marks a room clean, the front desk sees it the same second. No radio call, no guesswork at the counter.",
    cta: "See it work",
    caption:
      "\"Is 204 ready?\" — the question that costs your front desk ten minutes an hour.\n\nIn Operra housekeeping updates the room and the desk sees it instantly. No radio, no walking upstairs to check.\n\noperra.tech",
    hashtags: ["#HotelManagement", "#Hospitality", "#Tanzania", "#Operra"],
    imagePrompt:
      "Soft-focus photograph of a freshly made hotel bed in warm morning light, deep teal and violet colour grade, dark moody background, no text, no people, no logos",
    template: "spotlight",
  };
}
