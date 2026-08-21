/** An app access token can read the app's own settings, including live mode. */
const id = process.env.FB_APP_ID, secret = process.env.FB_APP_SECRET, V = "v21.0";
const appToken = `${id}|${secret}`;
const fields = "id,name,app_type,link,privacy_policy_url,terms_of_service_url,category";
const r = await fetch(`https://graph.facebook.com/${V}/${id}?fields=${fields}&access_token=${appToken}`);
console.log("APP:", JSON.stringify(await r.json(), null, 1));

// live mode / restrictions
for (const f of ["restrictions", "supported_platforms", "app_domains", "auth_dialog_headline"]) {
  const rr = await fetch(`https://graph.facebook.com/${V}/${id}?fields=${f}&access_token=${appToken}`);
  const j = await rr.json();
  console.log(f.padEnd(22), j.error ? `ERR ${j.error.message.slice(0,60)}` : JSON.stringify(j[f] ?? "(not set)"));
}
