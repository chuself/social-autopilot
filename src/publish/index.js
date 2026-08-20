import * as facebook from "./facebook.js";
import * as instagram from "./instagram.js";

/**
 * Every publisher exposes { id, publish({ imageUrl, caption, dryRun }) }.
 * TikTok slots in here later without touching any caller.
 */
export const publishers = {
  [facebook.id]: facebook,
  [instagram.id]: instagram,
};

export function publisherFor(platform) {
  const p = publishers[platform];
  if (!p) throw new Error(`No publisher for platform "${platform}"`);
  return p;
}
