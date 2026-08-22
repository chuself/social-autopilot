import { graphPost, graphGet } from "../graph.js";

export const id = "instagram";

/**
 * Two-step publish: create a media container, then publish it.
 * imageUrl MUST be publicly reachable — Instagram fetches it server-side.
 */
export async function publish({ imageUrl, caption, dryRun }) {
  const igUser = requireEnv("IG_USER_ID");
  const token = requireEnv("FB_PAGE_ACCESS_TOKEN");

  if (dryRun) {
    console.log(`[dry-run] instagram -> POST ${igUser}/media then media_publish`);
    console.log(`[dry-run]   url: ${imageUrl}`);
    console.log(`[dry-run]   caption: ${caption.slice(0, 80)}...`);
    return { platform: id, postId: "dry-run", url: null };
  }

  const container = await graphPost(`${igUser}/media`, {
    image_url: imageUrl,
    caption,
    access_token: token,
  });

  await waitForContainer(container.id, token);

  const published = await graphPost(`${igUser}/media_publish`, {
    creation_id: container.id,
    access_token: token,
  });
  return { platform: id, postId: published.id, url: null };
}

/** Instagram downloads the image asynchronously; publishing too early fails. */
async function waitForContainer(creationId, token, attempts = 12) {
  for (let i = 0; i < attempts; i++) {
    const info = await graphGet(creationId, {
      fields: "status_code,status",
      access_token: token,
    });
    if (info.status_code === "FINISHED") return;
    if (info.status_code === "ERROR" || info.status_code === "EXPIRED") {
      throw new Error(`IG container ${creationId} ${info.status_code}: ${info.status ?? ""}`);
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error(`IG container ${creationId} never finished processing`);
}

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} — see .env.example`);
  return v;
}

/**
 * Carousel: every slide gets its own child container, then a parent that ties
 * them together. Instagram will not accept the parent until each child has
 * finished downloading, so children are created first and awaited.
 */
export async function publishCarousel({ imageUrls, caption, dryRun }) {
  const igUser = requireEnv("IG_USER_ID");
  const token = requireEnv("FB_PAGE_ACCESS_TOKEN");

  if (dryRun) {
    console.log(`[dry-run] instagram CAROUSEL -> ${imageUrls.length} slides`);
    return { platform: "instagram", postId: "dry-run" };
  }

  const children = [];
  for (const url of imageUrls) {
    const child = await graphPost(`${igUser}/media`, {
      image_url: url,
      is_carousel_item: "true",
      access_token: token,
    });
    children.push(child.id);
  }
  for (const id of children) await waitForContainer(id, token);

  const parent = await graphPost(`${igUser}/media`, {
    media_type: "CAROUSEL",
    children: children.join(","),
    caption,
    access_token: token,
  });
  await waitForContainer(parent.id, token);

  const published = await graphPost(`${igUser}/media_publish`, {
    creation_id: parent.id,
    access_token: token,
  });
  return { platform: "instagram", postId: published.id, slides: imageUrls.length };
}
