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
  ├─ GitHub Pages     ──▶ chuself.github.io/social-autopilot  (public URL for IG)
  ├─ state/queue.json  status: pending | needs-review
  └─ cli-digest.js    ──▶ Telegram: "12 posts ready, 2 need your eye"

publish     hourly               due + cleared ──▶ Facebook + Instagram
reel        Tue + Fri 10:00 EAT  script ──▶ Swahili voiceover ──▶ 1080x1920 MP4 ──▶ Reels
engage      every 30 min         comments answered, buying signals ──▶ you
listen      every 15 min         your Telegram messages ──▶ state/steer.md
token-check Mon 08:00 EAT        shouts before the token dies
```

Rendering happens at **plan** time, not publish time, because Instagram fetches the
image URL server-side — the poster has to be live on Pages before publish day.

The repo is public so GitHub Pages can host the posters for free with no extra
credentials. No secrets live in the repo; they are all Actions secrets.

### Connecting the review Sheet

Service accounts cannot create Drive files unless the Drive API is enabled, so the
simplest path is to create the Sheet yourself:

1. Make a blank Google Sheet, rename the first tab to `Calendar`.
2. Share it as **Editor** with the service account address in your key file.
3. Set `SHEET_ID` (the id in the Sheet URL) and `GOOGLE_SERVICE_ACCOUNT_JSON` as repo secrets.

The Sheet then stays in your own Drive, which is where you want it.

## Steering it from Telegram

Send the bot a plain message and it becomes a standing instruction the writer obeys
from the next plan onward. No code editing.

> *less formal, write like WhatsApp*
> *stop using the word "seamless"*
> *push the POS module this week*

| Command | Effect |
|---|---|
| `/status` | What is queued, and your current instructions |
| `/pause` / `/resume` | Stop and start publishing |
| `/clear` | Forget the standing instructions |

The inbox is read every 15 minutes and only obeys `TELEGRAM_CHAT_ID` — nobody else
can steer the feed.

## Your weekly loop

1. Sunday evening: Telegram message listing the week.
2. Skim it. Anything wrong → reject it in the Sheet, or tell the bot what to change.
3. Do nothing and `pending` posts go out anyway after 24h. Silence never stops the line.
4. `needs-review` posts (an unapproved figure) **never** auto-post — they wait for you.

## How it improves without you

`cli-metrics.js` reads real engagement from both platforms after every post and writes
two files the planner consumes:

- `state/top-performers.json` — the best headlines, shown to the writer as reference.
- `state/pillar-scores.json` — average engagement per pillar. A pillar that consistently
  underperforms gets thinned out; round-robin remains the floor so the feed never
  collapses into a single note.

You do not have to act on the digest for the writing to get better.

## Guardrails

| Guard | Effect |
|---|---|
| `state/PAUSED` | File exists → publishing exits immediately. The kill switch. |
| `DRY_RUN=1` | Renders and logs every API call, calls nothing. |
| Daily cap | Configured cadence + 1 per platform per day, whatever the queue says. |
| Reply sanitiser | A drafted public reply containing a phone number, price or unapproved figure is withheld entirely and escalated instead. |
| Reel pre-flight | Size, duration and file size are checked before upload, not after a platform rejects it. |
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
`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, and optionally `GOOGLE_SERVICE_ACCOUNT_JSON` + `SHEET_ID`.
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
src/cli-listen.js  reads your Telegram messages into standing instructions
src/sheet.js       two-way Google Sheet sync (service-account JWT, no deps)
src/video.js       deterministic frames via setFrame(t) -> H.264/AAC MP4
src/audio.js       free Edge neural voices incl. sw-TZ; ambient pad fallback
src/cli-engage.js  comment triage, replies, lead escalation
src/config.js      cadence and posting times, steerable from Telegram
scripts/           one-off setup helpers (token exchange, id lookup, telegram)
```

## Reels

`cli-reel.js` turns a queued post into a narrated vertical video:

1. `writeReelScript()` converts the post into 3-4 on-screen beats plus narration.
2. `audio.js` speaks the narration with a free Edge neural voice — **sw-TZ-Rehema**
   or **sw-TZ-Daudi** for Kiswahili, needing no API key.
3. `video.js` renders one frame per timestamp through `setFrame(t)` and encodes
   H.264/AAC with `+faststart`, which Instagram requires.

The video length follows the narration rather than the other way round, so the
voice is never cut off. Nothing animates on its own — seek-safe and reproducible.

## Not built yet

TikTok. The Content Posting API only allows public posts after a TikTok app audit, so it
was deferred rather than blocking the build. `src/publish/index.js` is the seam.
