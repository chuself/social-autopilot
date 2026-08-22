/**
 * Put the call-to-action link in the first comment instead of the caption.
 *
 * Instagram in particular is widely observed to suppress reach on posts whose
 * caption carries an outbound link. The link still needs to be one tap away, so
 * it goes in a comment we post ourselves seconds later.
 */
import { graphPost } from "../graph.js";

export async function commentOn(postId, message, { dryRun } = {}) {
  const token = process.env.FB_PAGE_ACCESS_TOKEN;
  if (!token) throw new Error("Missing FB_PAGE_ACCESS_TOKEN");
  if (dryRun) {
    console.log(`  [dry-run] first comment on ${postId}: ${message.slice(0, 60)}`);
    return null;
  }
  const out = await graphPost(`${postId}/comments`, { message, access_token: token });
  return out?.id ?? null;
}
