const phone = process.env.CALLMEBOT_PHONE;
const key = process.env.CALLMEBOT_APIKEY;
const text = "Alice hapa. Huu ni ujumbe wa majaribio kutoka Operra Social Autopilot.";
const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(text)}&apikey=${encodeURIComponent(key)}`;
const res = await fetch(url, { signal: AbortSignal.timeout(25000) });
const body = await res.text();
console.log("HTTP", res.status);
console.log(body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 400));
