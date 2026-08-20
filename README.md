# Social Autopilot

Unattended daily social posting for **Operra HMS** — Facebook Page + Instagram.
Runs on GitHub Actions, costs nothing. See [PLAN.md](PLAN.md) for the full design.

**Status: phases 1-2 complete — plan, write, render and publish all verified in dry run.
Waiting only on credentials.**

## How it works

```
cli-plan.js ──▶ brain (Gemini) ──▶ copy + image prompt
                     │
                     ├──▶ background.js ──▶ AI background  (or branded gradient)
                     ├──▶ render.js ──────▶ public/<id>.png ──▶ Cloudflare Pages
                     └──▶ state/queue.json  (status: pending / needs-review)
                                     │
                     cli-publish.js ◀┘  due + cleared ──▶ Facebook + Instagram
```

The two steps are separate **on purpose**: Instagram fetches the image URL server-side,
so the PNG has to be live before publishing. The workflow enforces that ordering.

## Local use

```bash
npm install
npx playwright install chromium

# Plan a week with no API keys at all — canned copy, gradient backgrounds:
MOCK_LLM=1 SKIP_IMAGE=1 node src/cli-plan.js --count 7

# With a Gemini key, real copy and real AI backgrounds:
node src/cli-plan.js --count 7

DRY_RUN=1 npm run publish      # logs every API call, posts nothing
```

Copy `.env.example` to `.env` and fill it in for a real post. **Leave `DRY_RUN=1`
until you have seen a dry run you are happy with.**

## Guardrails

| Guard | Effect |
|---|---|
| `state/PAUSED` | File exists → publishing exits immediately. The kill switch. |
| `DRY_RUN=1` | Renders and logs every API call, calls nothing. |
| Daily cap | Max 2 posts per platform per day, whatever the queue says. |
| Asset check | `HEAD` on the image URL; refuses to publish without a reachable image. |
| Per-platform isolation | Facebook failing never stops Instagram, and vice versa. |
| Fallback background | No AI image → branded gradient. A post never dies for lack of an image. |
| `facts.md` allowlist | Any figure not in `facts.md` → post held as `needs-review`, never auto-approved. |
| Auto-approve timer | `pending` goes out after 24h so silence never stops the line. `needs-review` never does. |
| Provider fallback | Gemini → Groq for copy, Gemini → Cloudflare Flux for images. |

## What you need to set up (see PLAN.md §5)

Repo **secrets**: `FB_PAGE_ID`, `FB_PAGE_ACCESS_TOKEN`, `IG_USER_ID`, `GEMINI_API_KEY`.
Repo **variable**: `PUBLIC_ASSET_BASE` (your Cloudflare Pages URL).
Full list with notes in `.env.example`.

> **Token expiry is the #1 silent-failure mode.** Meta long-lived tokens die at 60 days.
> Phase 3 adds the weekly refresh job and the Telegram alert — until then, diarise it.

## Layout

```
brands/operra/     brand.json (palette from the Operra frame.md), pillars.md,
                   facts.md (the only numbers allowed in a post), templates/, assets/
src/brain.js       prompt, pillar rotation, the invented-figure guard
src/llm.js         Gemini → Groq text, MOCK_LLM=1 for keyless testing
src/background.js  Gemini image → Cloudflare Flux, null on failure
src/queue.js       queue, due-post selection, auto-approve timer
src/render.js      Playwright: AI background + HTML overlay → 1080×1350 PNG
src/publish/       facebook.js, instagram.js, index.js  ← TikTok drops in here
src/guards.js      kill switch, dry run, daily cap, asset reachability
state/             sample post, queue, history (dedupe memory)
```

## Not built yet

Phase 3 — Google Sheet as the review surface, Telegram digest, **token refresh job**, cron on.
Phase 4 — metrics feedback loop, TikTok.

Until the token refresh job exists, diarise the 60-day Meta token expiry by hand.
