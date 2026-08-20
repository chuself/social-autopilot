import { graphPost } from "../graph.js";

export const id = "facebook";

/**
 * Post a photo to a Facebook Page.
 * Needs FB_PAGE_ID and FB_PAGE_ACCESS_TOKEN (a Page token, not a user token).
 */
export async function publish({ imageUrl, caption, dryRun }) {
  const pageId = requireEnv("FB_PAGE_ID");
  const token = requireEnv("FB_PAGE_ACCESS_TOKEN");

  if (dryRun) {
    console.log(`[dry-run] facebook -> POST ${pageId}/photos`);
    console.log(`[dry-run]   url: ${imageUrl}`);
    console.log(`[dry-run]   caption: ${caption.slice(0, 80)}...`);
    return { platform: id, postId: "dry-run", url: null };
  }

  const out = await graphPost(`${pageId}/photos`, {
    url: imageUrl,
    caption,
    published: "true",
    access_token: token,
  });
  return {
    platform: id,
    postId: out.post_id ?? out.id,
    url: out.post_id ? `https://facebook.com/${out.post_id}` : null,
  };
}

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} — see .env.example`);
  return v;
}
