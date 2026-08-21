const key = process.env.GEMINI_API_KEY;
for (const model of ["gemini-2.5-flash-preview-tts", "gemini-3.1-flash-tts-preview"]) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [{ parts: [{ text: "Karibu Operra. Mfumo wa hoteli." }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } } },
      },
    }),
  });
  const j = await res.json();
  const audio = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  console.log(`${model.padEnd(32)} ${res.status} ${audio ? `AUDIO OK (${audio.inlineData.mimeType})` : (j.error?.message ?? "no audio").slice(0, 90)}`);
}
