# Social Autopilot

Unattended daily social posting for **Operra HMS** — Facebook Page + Instagram.
Runs entirely on GitHub Actions. Costs nothing. See [PLAN.md](PLAN.md) for the design.

**Status: live.** First posts published 20 Aug 2026 to
[Facebook](https://www.facebook.com/122140157103351110/posts/122140156947351110) and
[Instagram](https://www.instagram.com/p/DcRcW2nmJkJ/).

## How it works

```
plan-week   Sun 18:00 EAT
  ├─ cli-metrics.js   score last week  ──▶ state/top-performers.json
  ├─ brain (Gemini)   pick pillar, write copy + image prompt
  ├─ background.js    keyless Flux background  (or branded gradient)
  ├─ render.js        HTML overlay ──▶ public/<id>.png
  ├─ wrangler         ──▶ social-autopilot-31s.pages.dev   (public URL for IG)
  ├─ state/queue.json  status: pending | needs-review
  └─ cli-digest.js    ──▶ Telegram: "12 posts ready, 2 need your eye"

publish     09:00 + 17:00 EAT     due + cleared ──▶ Facebook + Instagram
token-check Mon 08:00 EAT         shouts before the token dies
```

Rendering happens at **plan** time, not publish time, because Instagram fetches the
image URL server-side — the poster has to be live on Pages before publish day.

## Your weekly loop

1. Sunday evening: Telegram message listing the week.
2. Skim it. Anything wrong → edit or set `"status": "reject"` in `state/queue.json`.
3. Do nothing and `pending` posts go out anyway after 24h. Silence never stops the line.
4. `needs-review` posts (an unapproved figure) **never** auto-post — they wait for you.

## Guardrails

| Guard | Effect |
|---|---|
| `state/PAUSED` | File exists → publishing exits immediately. The kill switch. |
| `DRY_RUN=1` | Renders and logs every API call, calls nothing. |
| Daily cap | Max 2 posts per platform per day, whatever the queue says. |
| Asset check | `HEAD` on the image URL; refuses to publish without a reachable image. |
| Per-platform isolation | Facebook failing never stops Instagram, and vice versa. |
| `facts.md` allowlist | Any figure not in `brands/operra/facts.md` → held as `needs-review`. |
| Fallback background | No AI image → branded gradient. A post never dies for lack of an image. |
| Provider fallback | Four Gemini models for copy; two image providers. |
| Token watchdog | Weekly check, Telegram alert 14 days before expiry. |

## Local use

```bash
npm install
npx playwright install chromium

# No API keys needed — canned copy, gradient backgrounds:
MOCK_LLM=1 SKIP_IMAGE=1 node src/cli-plan.js --count 7

# Real copy and real backgrounds (reads .env):
node --env-file=.env src/cli-plan.js --count 7
node --env-file=.env src/cli-publish.js       # DRY_RUN=1 in .env by default
```

## Configuration

Repo **secrets**: `FB_PAGE_ID`, `FB_PAGE_ACCESS_TOKEN`, `IG_USER_ID`, `GEMINI_API_KEY`,
`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`.
Repo **variable**: `PUBLIC_ASSET_BASE`. Full notes in `.env.example`.

The Page token **does not expire**. If it is ever invalidated, regenerate a user token in
the Graph API Explorer and re-run:

```bash
node --env-file=.env scripts/exchange-token.js
```

## Layout

```
brands/operra/     brand.json (palette from the Operra frame.md), pillars.md,
                   facts.md (the only figures allowed in a post), templates/, assets/
src/brain.js       prompt, pillar rotation, invented-figure guard, top-performer feedback
src/llm.js         Gemini model chain → Groq; MOCK_LLM=1 for keyless testing
src/background.js  keyless Flux → Cloudflare → gradient
src/render.js      Playwright: background + HTML overlay → 1080×1350 PNG
src/publish/       facebook.js, instagram.js, index.js  ← TikTok drops in here
src/guards.js      kill switch, dry run, daily cap, asset reachability
src/notify.js      Telegram; no-ops when unconfigured
scripts/           one-off setup helpers (token exchange, id lookup, telegram)
```

## Not built yet

TikTok. The Content Posting API only allows public posts after a TikTok app audit, so it
was deferred rather than blocking the build. `src/publish/index.js` is the seam.
