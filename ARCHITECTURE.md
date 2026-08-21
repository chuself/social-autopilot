# Alice — Architecture & Deployment Guide

An autonomous social media operator. She plans, writes, designs, narrates,
publishes, answers comments and escalates leads across **Instagram, Facebook and
TikTok** — unattended, in two languages, at **zero recurring cost**.

Built and proven live on the Operra HMS account, 20–21 August 2026.

---

## 1. What she actually does

| Cadence | Job | Outcome |
|---|---|---|
| Daily 21:00 | `plan-week` | Writes tomorrow's posts: copy, background, poster render |
| Hourly | `publish` | Posts whatever is due to Instagram + Facebook |
| 2×/day | `reel` | Turns a reel slot into a narrated 1080×1920 video → IG, FB, TikTok |
| Every 30 min | `engage` | Answers comments, escalates buying signals |
| Continuous | `listen-live` | Takes owner instructions over Telegram in ~5 seconds |
| Weekly | `token-check` | Warns before any credential dies |

The owner's entire involvement is a Telegram conversation. Everything else runs
without a server, a subscription, or a person.

---

## 2. The core insight

Every component was chosen against one rule:

> **Never pay, never run a server, and never be the party that needs approval.**

Where a gate exists, find whoever is already through it.

- TikTok requires an audited app to post publicly → **ride Metricool's audit**
- Cloud compute costs money → **GitHub Actions on a public repo is unlimited**
- Asset hosting costs money → **GitHub Pages, which the public repo unlocks**
- Image models cost money → **keyless Flux endpoint**
- Databases cost money → **JSON in the repo, plus a Google Sheet for humans**

The result has no bill and no infrastructure to maintain.

---

## 3. Runtime architecture

```
                    ┌──────────────────────────────────────┐
                    │        GitHub Actions (free)         │
                    │        the entire runtime            │
                    └──────────────────────────────────────┘
                                     │
   ┌─────────────┬───────────────────┼──────────────┬────────────────┐
   │             │                   │              │                │
plan-week     publish              reel          engage         listen-live
   │             │                   │              │                │
   ▼             ▼                   ▼              ▼                ▼
 brain        due posts         script+voice    comments        Telegram
 (LLM)            │              +render           │            long poll
   │              │                   │              │                │
   ├─ background ─┤                   │              ├─ triage ──┐    │
   ├─ render ─────┤                   │              │           │    │
   ▼              ▼                   ▼              ▼           ▼    ▼
 queue.json   IG + FB          IG + FB + TikTok   replies     leads  config
                    │                   │                        │
                    └───────────────────┴────────────────────────┘
                                     │
                          GitHub Pages (public assets)
                          Google Sheet (human review)
                          Telegram + WhatsApp (alerts)
```

**State lives in the repo.** `state/*.json` is the database; every job commits
what it changed. This is why no server is needed — the repo *is* the state store,
and Actions provides the compute.

---

## 4. Module map

### The brain
| File | Responsibility |
|---|---|
| `src/llm.js` | Provider chain: 6 Gemini models → 2 Groq models. Handles fenced-JSON responses |
| `src/brain.js` | Prompt construction, pillar rotation, reel scripts, **invented-figure guard** |
| `src/config.js` | The posting day as slots (`{hour, format}`), validated hard |

### Production
| File | Responsibility |
|---|---|
| `src/background.js` | Keyless Flux image → Cloudflare Flux → branded gradient |
| `src/render.js` | Playwright: background + HTML overlay → 1080×1350 poster PNG |
| `src/video.js` | Deterministic frames via `setFrame(t)` → H.264/AAC MP4 |
| `src/audio.js` | Gemini Aoede → Edge neural (`sw-TZ`) → synthesised ambient pad |

### Distribution
| File | Responsibility |
|---|---|
| `src/publish/facebook.js` | Unpublished photo → `/feed` attachment (real feed post) |
| `src/publish/instagram.js` | Two-step container → publish |
| `src/publish/reels.js` | IG Reels + Facebook `/video_reels` three-phase upload |
| `src/publish/tiktok.js` | Metricool MCP over JSON-RPC, OAuth 2.1 with token rotation |

### Control & safety
| File | Responsibility |
|---|---|
| `src/inbox.js` | Telegram message handling, shared by both listener paths |
| `src/guards.js` | Kill switch, dry run, daily cap, asset reachability |
| `src/queue.js` | Queue, due-post selection |
| `src/secretstore.js` | AES-256-GCM sealed state that CI can write |
| `src/notify.js` | Telegram + WhatsApp mirror, video delivery |
| `src/cli-engage.js` | Comment triage, replies, **reply sanitiser**, lead escalation |
| `src/cli-metrics.js` | Engagement → `top-performers.json` + `pillar-scores.json` |
| `src/sheet.js` | Two-way Google Sheet sync (service-account JWT, no dependencies) |

Only one runtime dependency: **Playwright**. Everything else is Node built-ins.

---

## 5. External services

| Service | Used for | Cost | Gate |
|---|---|---|---|
| GitHub Actions | All compute | Free (public repo = unlimited) | — |
| GitHub Pages | Public asset hosting | Free | Repo must be public |
| Google AI Studio | Copy + Aoede voice | Free tier | Image models are paid-only |
| Groq | LLM fallback | Free | — |
| image.pollinations.ai | Backgrounds | Free, keyless | — |
| Microsoft Edge TTS | Voice fallback, real `sw-TZ` | Free, keyless | — |
| Meta Graph API | Instagram + Facebook | Free | App must be **Live** |
| Metricool | TikTok (and YouTube, GMB) | Free plan | 20 scheduled posts/month |
| Telegram Bot API | Control channel | Free | — |
| CallMeBot | WhatsApp alerts | Free | One-way only |
| Google Sheets | Human review surface | Free | Sheets API enabled |

**Total: $0/month.**

---

## 6. Deploying for a new brand

### 6.1 Accounts and credentials

1. **GitHub** — fork/copy the repo, make it **public**, enable Pages (`build_type: workflow`)
2. **Meta** — Facebook Page + Instagram Business account linked to it
   - Create an app, add: `pages_manage_posts`, `pages_read_engagement`,
     `pages_read_user_content`, `pages_manage_engagement`, `instagram_basic`,
     `instagram_content_publish`, `instagram_manage_comments`
   - Add a Privacy Policy URL and **switch the app to Live** (critical — see §7)
   - Run `scripts/exchange-token.js` for a Page token that never expires
3. **Google AI Studio** — API key
4. **Groq** — API key (fallback)
5. **Telegram** — bot via @BotFather, then `scripts/telegram-setup.mjs` for the chat id
6. **Metricool** — free account, connect TikTok, then `scripts/metricool-auth.mjs`
7. **CallMeBot** *(optional)* — WhatsApp mirror

### 6.2 Repository configuration

**Secrets:** `FB_PAGE_ID`, `FB_PAGE_ACCESS_TOKEN`, `IG_USER_ID`, `GEMINI_API_KEY`,
`GROQ_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `METRICOOL_KEY`,
`METRICOOL_OAUTH`, `CALLMEBOT_PHONE`, `CALLMEBOT_APIKEY`,
`GOOGLE_SERVICE_ACCOUNT_JSON`, `SHEET_ID`

**Variables:** `PUBLIC_ASSET_BASE`, `WHATSAPP_CTA_NUMBER`, `METRICOOL_BLOG_ID`,
`METRICOOL_USER_ID`

### 6.3 Brand pack

Everything brand-specific lives in `brands/<id>/`:

```
brand.json        colours, fonts, logo, canvas size
pillars.md        content pillars + voice rules
facts.md          the ONLY figures the writer may state
templates/        spotlight.html (poster), reel.html (video)
assets/           logo, vendored fonts
```

**Porting to a new client is authoring this folder.** No code changes.

---

## 7. Hard-won knowledge

These cost real debugging time. They are the difference between a working
deployment and a week of confusion.

### Meta
- **A Development-mode app publishes content only visible to people with a role
  on that app.** Everything looks perfect in the API and to the admin; nobody
  else sees anything. Take the app **Live**.
- `/{page}/photos` creates an album story, **not a feed post**. Upload the photo
  unpublished, then attach it to `/{page}/feed`.
- `/{page}/videos` produces a video post that merely gets a `/reel/` URL and
  never appears in the Reels tab. Native Reels need the three-phase
  `/video_reels` upload.
- **Asking for `from` on Page comments fails the entire request.** Meta blocks
  commenter identity; request it and you get `(#200) Missing Permissions` for
  everything. Track your own reply ids instead.
- Graph Explorer tokens are short-lived. Exchange via App Secret for a Page
  token that never expires.
- The id in post permalinks differs from the Page id under the new Pages
  experience. Both are real; use the Page id for the API.

### Instagram / TikTok
- Instagram fetches media **server-side**. The file must be publicly live
  *before* publishing — hence render and publish are separate jobs.
- TikTok's own API forces `SELF_ONLY` until the app passes their audit.
  Self-hosting a scheduler does **not** bypass this; only a provider whose app is
  already audited can post publicly on your behalf.

### Metricool
- **Refresh tokens rotate on every use.** Each works once and returns its
  replacement. *Any* job that touches Metricool — including a read-only status
  check — must be able to persist the replacement, or it destroys the credential
  just by looking at it. Every such workflow needs `permissions: contents: write`.
- `info` is a JSON **string**, not an object. `publicationDate` is required
  inside it *as well as* the top-level `date`. TikTok demands its own `title`.

### LLM providers
- Gemini **image** models are paid-only (free quota is literally 0).
- Gemini `-lite` text models draw on a **separate quota pool** — they keep working
  after the main tier is exhausted. Put them at the tail of the chain.
- Model ids retire silently. `llama-3.3-70b-versatile` had been removed; a
  fallback pointing at it would fail only when finally needed. **Verify the live
  model list, don't trust documentation.**
- `edge-tts` needs `--rate=-4%`. The bare `--rate -4%` form is parsed as another
  flag and every voiceover fails silently into the fallback.

### Video
- ffmpeg `-shortest` trims the video to the narration and cuts the closing CTA.
  Pad the audio with `-af apad` and drive length with `-t`.
- Instagram requires `+faststart`; without it the moov atom sits at the end and
  upload validation fails.
- Render deterministically: the page exposes `setFrame(t)` and nothing animates
  on its own. Reproducible, and always matches the audio length.

### GitHub Actions
- `schedule:` is throttled — a 15-minute cron really runs every ~45 minutes.
  **`workflow_dispatch` is not throttled.** A long-lived job that dispatches its
  own successor has no gap; keep the cron only as a resurrection path.
- Runners are **UTC**. `setHours(8)` schedules 08:00 UTC = 11:00 EAT. Convert
  explicitly.
- `GITHUB_TOKEN` cannot write repo secrets. To persist rotating credentials,
  encrypt them and commit the ciphertext — the key stays a secret, and ciphertext
  in a public repo is inert.
- Every job that commits must `git pull --rebase` first; concurrent pushes
  otherwise destroy work.

---

## 8. Safety design

An unattended writer publishing under a brand's name is the real risk. Five
layers address it:

| Guard | Prevents |
|---|---|
| `facts.md` allowlist | Invented statistics. Any figure not listed → post held for review |
| Reply sanitiser | **Gemini invented plausible `+255` phone numbers when asked about pricing.** Replies containing a phone number, price, or unapproved figure are *withheld entirely*, never patched |
| Lead escalation | Buying signals go to a human, never answered by a bot |
| Daily cap | Cadence + 1 per platform per day, whatever the queue says |
| Kill switch | `state/PAUSED` stops everything; `/pause` over Telegram |

Plus: dry-run mode, per-platform isolation (one failing never blocks the other),
and pre-flight checks on video size, duration and reachability before upload.

**Design principle learned the hard way:** most failures here are *silent
no-ops* — a denied permission that reads as "no comments", a patch that inserted
nothing, a skipped block with no log line, a 403 that ate a token. None throw
errors. All look like success. Log the "nothing happened" path explicitly.

---

## 9. Self-improvement

`cli-metrics.js` reads real engagement after every post and writes two files the
planner consumes:

- `top-performers.json` — best headlines, shown to the writer as reference
- `pillar-scores.json` — average engagement per pillar; a consistently weak
  pillar gets thinned out, with round-robin as the floor so the feed never
  collapses into one note

The owner does not have to act on anything for the writing to improve.

---

## 10. Limits

**Structural:**
- Metricool free: 20 scheduled posts/month (only reels use it — ~4–8)
- Gemini free tier: fine at ~8 calls/day steady state; heavy replanning burns it
- Telegram → WhatsApp mirror is one-way; control stays in Telegram

**Requires a human:**
- Any OAuth re-authorisation (browser only)
- Connecting a new platform account
- Meta app review or business verification

**Not solvable by engineering:**
- Organic reach on a cold account. A new Page with one follower gets almost no
  distribution regardless of content quality.

---

## 11. Commercial notes

**What a buyer is actually getting:** not the code — the *knowledge in §7*. Any
competent developer can write a scheduler. What takes a week to discover is that
a Development-mode app is invisible, that `/photos` doesn't create a feed post,
that asking for a commenter's name breaks the whole request, and that a
read-only status check can destroy your credentials.

**Per-client cost: $0.** Margin is whatever you charge.

**Onboarding a client:** author `brands/<id>/`, run the credential scripts, set
secrets. No code changes. A second brand is a folder.

**The honest pitch:** it will not make a dead account famous. It removes the
labour of showing up every day in two languages across three platforms, answers
the people who reply, and puts buying signals in front of a human within
seconds.
