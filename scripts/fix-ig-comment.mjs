/** Replace the ugly link comment on the carousel we just posted. */
import { readFile } from "node:fs/promises";
import { ctaComment } from "../src/brain.js";
import { commentOn } from "../src/publish/comment.js";

const t = process.env.FB_PAGE_ACCESS_TOKEN, V = "v21.0";
const mediaId = process.argv[2];
const brand = JSON.parse(await readFile("brands/operra/brand.json", "utf8"));

// remove the old one
const list = await (
  await fetch(`https://graph.facebook.com/${V}/${mediaId}/comments?fields=id,text`, {
    headers: { authorization: `Bearer ${t}` },
  })
).json();
for (const c of list.data ?? []) {
  if ((c.text ?? "").includes("wa.me")) {
    const d = await fetch(`https://graph.facebook.com/${V}/${c.id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${t}` },
    });
    console.log("deleted old link comment:", d.status);
  }
}

const text = ctaComment(brand, null, "instagram");
const id = await commentOn(mediaId, text, {});
console.log("new comment:", text, "->", id);
