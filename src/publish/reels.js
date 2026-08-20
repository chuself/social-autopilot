/**
 * Video publishing. Separate from the image publishers because both platforms
 * treat video as an async upload: you hand over a URL, they fetch and transcode,
 * and publishing before that finishes fails.
 */
import { graphPost, graphGet } from "../graph.js";

export const id = "reels";

/** Instagram Reels: container -> poll until FINISHED -> publish. */
export async function publishInstagramReel({ videoUrl, caption, coverUrl, dryRun }) {
  const igUser = requireEnv("IG_USER_ID");
  const token = requireEnv("FB_PAGE_ACCESS_TOKEN");

  if (dryRun) {
    console.log(`[dry-run] instagram REEL -> ${videoUrl}`);
    return { platform: "instagram", postId: "dry-run" };
  }

  const params = {
    media_type: "REELS",
    video_url: videoUrl,
    caption,
    share_to_feed: "true",
    access_token: token,
  };
  if (coverUrl) params.cover_url = coverUrl;

  const container = await graphPost(`${igUser}/media`, params);
  await waitForContainer(container.id, token);

  const published = await graphPost(`${igUser}/media_publish`, {
    creation_id: container.id,
    access_token: token,
  });
  return { platform: "instagram", postId: published.id };
}

/** Facebook Page video. */
export async function publishFacebookVideo({ videoUrl, caption, dryRun }) {
  const pageId = requireEnv("FB_PAGE_ID");
  const token = requireEnv("FB_PAGE_ACCESS_TOKEN");

  if (dryRun) {
    console.log(`[dry-run] facebook VIDEO -> ${videoUrl}`);
    return { platform: "facebook", postId: "dry-run" };
  }

  const out = await graphPost(`${pageId}/videos`, {
    file_url: videoUrl,
    description: caption,
    access_token: token,
  });
  return { platform: "facebook", postId: out.id };
}

/**
 * Transcoding a 1080x1920 clip takes far longer than an image fetch, so this
 * waits minutes rather than seconds before giving up.
 */
async function waitForContainer(creationId, token, attempts = 40) {
  for (let i = 0; i < attempts; i++) {
    const info = await graphGet(creationId, {
      fields: "status_code,status",
      access_token: token,
    });
    if (info.status_code === "FINISHED") return;
    if (info.status_code === "ERROR" || info.status_code === "EXPIRED") {
      throw new Error(`IG reel container ${info.status_code}: ${info.status ?? ""}`);
    }
    if (i % 5 === 0) console.log(`  transcoding… (${info.status_code})`);
    await new Promise((r) => setTimeout(r, 8000));
  }
  throw new Error(`IG reel container never finished (waited ${(attempts * 8) / 60} min)`);
}

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}
