import { chromium } from "playwright";
import { readFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { lookForDate } from "./brain.js";

const ROOT = path.resolve(import.meta.dirname, "..");

/**
 * Render one poster PNG.
 *
 * @param {object} post   { template, eyebrow, headline, body, cta, backgroundPath? }
 * @param {string} brandId
 * @param {string} outFile  absolute path of the PNG to write
 */
export async function renderPoster(post, brandId = "operra", outFile) {
  const brandDir = path.join(ROOT, "brands", brandId);
  const brand = JSON.parse(await readFile(path.join(brandDir, "brand.json"), "utf8"));
  // Prefer the look recorded on the post: a re-render weeks later must produce
  // the same image, not today's rotation.
  const activeLook =
    (brand.looks ?? []).find((l) => l.name === post.look) ?? lookForDate(brand) ?? null;
  const accent = activeLook?.accent ?? null;
  // A bright background needs less global scrim but a stronger panel behind the
  // text; a near-black one needs the opposite.
  const scrim = activeLook?.scrim;
  const panel = activeLook?.panel;

  const template = post.template ?? "spotlight";
  // A real app screen (studio/screens.mjs) is cut from the committed recording on demand, so any
  // re-render, on any machine, shows exactly the same frame.
  if (post.screen && !post.shotPath && template === "app") {
    const { still } = await import("../studio/screens.mjs");
    post = { ...post, shotPath: path.relative(ROOT, still(post.screen, path.join(ROOT, "state", "frames", "shots"), 896)) };
  }
  const templatePath = path.join(brandDir, "templates", `${template}.html`);
  if (!existsSync(templatePath)) throw new Error(`No template "${template}" for brand ${brandId}`);

  const { width, height } = brand.canvas;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width, height },
      deviceScaleFactor: 1,
    });

    await page.goto(pathToFileURL(templatePath).href, { waitUntil: "load" });

    await page.evaluate(
      ({ brand, post, logoUrl, bgUrl, shotUrl, accent, scrim, panel }) => {
        const root = document.documentElement;
        for (const [key, value] of Object.entries(brand.colors)) {
          root.style.setProperty(`--${key}`, value);
        }
        // The look's accent replaces the primary for this rotation block, so the
        // feed shifts colour with the background style rather than drifting apart.
        if (accent) root.style.setProperty("--primary", accent);
        if (scrim != null) root.style.setProperty("--scrim", String(scrim));
        if (panel != null) root.style.setProperty("--panel", String(panel));
        root.style.setProperty("--pill", brand.radii.pill);
        root.style.setProperty("--card", brand.radii.card);

        const set = (id, text) => {
          const el = document.getElementById(id);
          if (el) el.textContent = text ?? "";
        };
        set("eyebrow", post.eyebrow);
        set("headline", post.headline);
        set("body", post.body);
        set("cta", post.cta);
        // An empty pill is worse than no pill: carousel slides before the last
        // one carry no call to action.
        const ctaEl = document.getElementById("cta");
        if (ctaEl && !String(post.cta ?? "").trim()) ctaEl.style.display = "none";
        set("site", brand.site);

        // Headline never overflows: step the size down as it gets longer.
        const h = document.getElementById("headline");
        if (h) {
          const n = (post.headline ?? "").length;
          if (n > 64) h.classList.add("xlong");
          else if (n > 40) h.classList.add("long");
        }

        document.getElementById("logo").src = logoUrl;

        // The app look (templates/app.html): a real screen of the app, or the photo in a card.
        const shot = document.getElementById("shot");
        if (shot && shotUrl) {
          shot.src = shotUrl;
          document.body.classList.add("has-shot");
          set("step", post.stepLabel ?? "");
        } else if (document.getElementById("photo") && bgUrl) {
          document.getElementById("photo").style.backgroundImage = `url("${bgUrl}")`;
          document.body.classList.add("has-photo");
        }

        // A post never dies for lack of an image — the gradient fallback stands in.
        if (bgUrl) {
          const bg = document.getElementById("bg");
          bg.classList.remove("fallback");
          bg.style.backgroundImage = `url("${bgUrl}")`;
        }
      },
      {
        brand,
        post,
        accent,
        scrim,
        panel,
        // A light ground takes the lockup drawn for light grounds.
        logoUrl: pathToFileURL(path.join(brandDir, template === "app" ? brand.logoLight ?? "assets/logo-light.png" : brand.logo)).href,
        shotUrl: post.shotPath ? pathToFileURL(path.resolve(ROOT, post.shotPath)).href : null,
        bgUrl: post.backgroundPath ? pathToFileURL(path.resolve(ROOT, post.backgroundPath)).href : null,
      }
    );

    await page.evaluate(() => document.fonts.ready);
    // A template that can fit its own words (templates/app.html) does so once the fonts are in.
    const fits = await page.evaluate(() => (window.fit ? window.fit() : true));
    if (!fits) console.warn(`  ${post.id ?? "poster"}: words still crowd the footer after fitting`);
    // Let the background image decode before the shot.
    await page.waitForFunction(() => {
      const imgs = [...document.images].every((i) => i.complete);
      const bg = document.getElementById("photo")?.style.backgroundImage || document.getElementById("bg").style.backgroundImage;
      const m = /url\("(.+)"\)/.exec(bg);
      if (!m) return imgs;
      const img = new Image();
      img.src = m[1];
      return imgs && img.complete;
    }, null, { timeout: 15000 }).catch(() => {});

    await mkdir(path.dirname(outFile), { recursive: true });
    await page.screenshot({ path: outFile, type: "png" });
    return outFile;
  } finally {
    await browser.close();
  }
}

// Direct run: render the sample post so the template can be eyeballed.
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const sample = JSON.parse(await readFile(path.join(ROOT, "state", "sample-post.json"), "utf8"));
  const out = path.join(ROOT, "public", `${sample.id}.png`);
  await renderPoster(sample, sample.brand ?? "operra", out);
  console.log(`rendered -> ${out}`);
}
