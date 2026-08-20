# Social Autopilot — build plan

**Prepared:** 2026-08-20
**Goal:** an unattended tool that generates and posts branded content daily to a
Facebook Page and an Instagram Business account, with the owner reviewing roughly
once a week. **Zero recurring cost.**
**First brand:** Operra HMS (hotel management system). Built multi-brand from day one.

---

## 1. Decisions made

| Question | Decision | Why |
|---|---|---|
| Image generation | **Hybrid** — AI background + HTML/CSS overlay rendered to PNG | Brand-correct logo, headline and CTA every time; AI only supplies the backdrop. Free tier covers the backdrop; the overlay is deterministic. |
| Runtime | **GitHub Actions cron**, private repo | ~100 of 2,000 free minutes/month. No server, free logs, free history, trivial to debug. |
| Phase-1 platforms | **Facebook Page + Instagram** | Both go through the Meta Graph API. No App Review needed for your own accounts. |
| TikTok | **Phase 2** | Content Posting API requires TikTok audit for public posts. Publisher interface stays generic so it slots in later. |
| Brain | **Gemini 2.5 Flash** (free tier), Groq/Llama fallback | Free, fast, good enough for captions. Fallback prevents a single quota from stopping the line. |
| Database | **Google Sheet** (calendar + human view) + repo JSON (state) | You already use Drive. Editable from your phone. No UI to build. |
| Asset hosting | **Cloudflare Pages** | Instagram requires a public image URL. Unlimited bandwidth, already your stack. |

---

## 2. Architecture

```
GitHub repo (private)                    GitHub Actions cron
├── brands/operra/                        ├── plan-week   Sun 18:00  drafts 7-14 posts
│   ├── brand.json     colors, fonts, logo├── publish     daily 09:00 & 17:00
│   ├── pillars.md     6 content pillars  └── metrics     Mon 08:00  pulls insights
│   └── templates/     4-6 HTML layouts
├── src/
│   ├── brain.ts       Gemini: topic + caption + hashtags + image prompt
│   ├── render.ts      Playwright: AI bg + HTML overlay -> 1080x1350 PNG
│   ├── publish/
│   │   ├── facebook.ts     Graph API /photos
│   │   ├── instagram.ts    container -> publish (2-step)
│   │   └── index.ts        Publisher interface  <- TikTok drops in here
│   ├── sheet.ts       Google Sheets read/write (service account)
│   └── notify.ts      Telegram bot: weekly digest + failure alerts
├── state/
│   ├── queue.json     approved/pending posts
│   └── history.json   last 60 posts -> dedupe memory
└── public/            rendered PNGs -> Cloudflare Pages -> public URL for IG
```

### Data flow, one post

1. **Brain** picks the next pillar (round-robin, skipping anything close to the last 60 posts),
   returns `{ headline, body, caption, hashtags, imagePrompt, template }`.
2. **Render** calls the free image model with `imagePrompt` for a 1080x1350 background,
   then loads `templates/{template}.html` in Playwright with the copy and brand tokens
   injected, screenshots to PNG.
3. PNG commits to `public/` -> Cloudflare Pages serves it at a stable public URL.
4. Row appended to the Google Sheet with status `pending`.
5. On publish day the **publisher** posts to FB and IG, writes the post ID back to the Sheet,
   status -> `posted`.

---

## 3. The weekly loop

- **Sunday 18:00** — drafts the whole week, renders every image, fills the Sheet,
  sends one Telegram message: *"Week of 24 Aug ready — 12 posts. [Review]"*.
- **You** skim the Sheet on your phone. Edit or set status `reject` on any row.
  Doing nothing = auto-approve after 24h, so silence never stops the line.
- **Daily 09:00 & 17:00** — publishes whatever is approved and due.
- **Monday 08:00** — pulls reach/likes/saves into the Sheet, and feeds the top 5
  performers of the last 30 days back into the brain prompt as "what works here".

---

## 4. Guardrails (built in from day one)

- **Kill switch** — `state/PAUSED` file present = publish job exits immediately.
- **Hard daily cap** — max 2 posts/platform/day regardless of queue contents.
- **No naked posts** — refuses to publish a row without a reachable rendered asset.
- **Token watchdog** — IG/FB long-lived tokens expire in 60 days; a job refreshes them
  weekly and Telegrams you if the refresh fails. This is the #1 cause of silent outages.
- **Dedupe memory** — the brain sees the last 60 posts and is told not to repeat an angle.
- **Dry-run mode** — `DRY_RUN=1` renders and logs everything without calling any post API.

---

## 5. Setup you must do yourself (Claude cannot)

| # | Task | Where | Time |
|---|---|---|---|
| 1 | Convert the Operra Instagram account to **Business** and link it to the Facebook Page | IG app -> Settings | 5 min |
| 2 | Create a Meta app (type: Business), keep it in **Development** mode, add yourself as admin | developers.facebook.com | 10 min |
| 3 | Generate a long-lived **Page Access Token** with `pages_manage_posts`, `pages_read_engagement`, `instagram_basic`, `instagram_content_publish` | Graph API Explorer | 10 min |
| 4 | Create a **Google Cloud service account**, enable the Sheets API, share the calendar Sheet with the service account email | console.cloud.google.com | 10 min |
| 5 | Get a **Gemini API key** | aistudio.google.com | 2 min |
| 6 | Create a **Telegram bot** via @BotFather, get the chat ID | Telegram | 5 min |
| 7 | Paste all of the above into **GitHub repo secrets** | repo -> Settings -> Secrets | 5 min |

Nothing above requires a payment method.

---

## 6. Phases

**Phase 1 — spine (build first).**
Render one hardcoded post from a template and publish it to the Facebook Page.
No AI, no Sheet, no cron. Proves the hardest link works.

**Phase 2 — brain + Instagram.**
Gemini writes copy from the pillars; add the IG two-step publisher; add the AI background.

**Phase 3 — calendar + review.**
Google Sheet, weekly planner job, Telegram digest, auto-approve timer.

**Phase 4 — feedback + TikTok.**
Metrics pull, top-performer feedback into the prompt, and either the TikTok audit
application or a Telegram tap-to-post path.

---

## 7. Known risks

- **Meta may prompt for Business Verification** on the app even in dev mode. It is free
  but needs business documents and can take days. Mitigation: the Facebook Page path is
  less likely to trip it, so phase 1 is FB-first.
- **Free image tier caps.** At ~2 backgrounds/day you are far inside Gemini's free daily
  limit, but the renderer falls back to a gradient/pattern background if the call fails —
  a post never dies for lack of an image.
- **Voice drift.** An LLM posting daily unattended will slowly go generic. The pillar file
  plus few-shot examples of real Operra copy is the counterweight; review the tone monthly.
