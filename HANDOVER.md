# Alice — Session Handover

**Project:** `chuself/social-autopilot` (public repo)
**Live since:** 20 August 2026 · **This document:** 22 August 2026
**Brand:** Operra HMS · Facebook `Operra.Tech` · Instagram `@operra.tech` · TikTok `@operra.tech`

---

## 1. The core problem

Operate Operra's social media — Facebook, Instagram and TikTok — **completely
unattended**, in Kiswahili and English, at **zero recurring cost**, with the owner
steering by chat rather than by editing anything.

Hard constraints set at the start and never broken:

- **Nothing may cost money.** No servers, no subscriptions, no paid APIs.
- The owner checks in when he wants to, not because the system needs him.
- It must keep running when nobody is watching.

---

## 2. The governing decision

> **Never pay, never run a server, and never be the party that needs approval.**
> Where a gate exists, find whoever is already through it.

Every architectural choice follows from that line:

| Constraint | Route taken |
|---|---|
| Cloud compute costs money | GitHub Actions — **unlimited on a public repo** |
| Asset hosting costs money | GitHub Pages (which the public repo unlocks) |
| TikTok needs an audited app to post publicly | **Ride Metricool's audit**, don't seek our own |
| Gemini image models are paid-only | Keyless Flux endpoint |
| Databases cost money | JSON in the repo + a Google Sheet for humans |
| Postiz needs a 24/7 VM | Don't self-host anything — Actions *is* the runtime |

---

## 3. What exists and works

### Live and proven
- **3 platforms posting automatically**: Facebook, Instagram, TikTok
- **Posters**, **narrated vertical reels**, and **carousels** — all verified against the live API
- **Comment replies** in the commenter's language, with buying signals escalated to the owner
- **Telegram control** (`@AliceOperrabot`) answering in ~3–5 seconds
- **WhatsApp mirror** for alerts (one-way)
- **12 posts published**, 4 today

### Current routine
```
08:00 EAT  carousel
13:00 EAT  reel
16:00 EAT  reel
20:00 EAT  poster
```
TikTok takes **exactly one reel per day**, and a **Kiswahili reel outranks an
English one** for that slot.

### The eleven workflows
| Workflow | Cadence | Job |
|---|---|---|
| `plan` | daily 21:00 EAT | Writes tomorrow only |
| `publish` | hourly | Posts what is due |
| `reel` | 2×/day | Films a reel slot |
| `engage` | 30 min | Answers comments, escalates leads |
| `listen-live` | continuous | Long-polls Telegram, self-chains |
| `listen` | manual | Safety-net inbox check |
| `preflight` | push + daily | **Executes** every path, alerts on failure |
| `looks` | on demand / `/looks` | Renders every visual look |
| `token-check` | weekly | Warns before credentials die |
| `pages` | on push | Deploys static assets |
| `metricool-status` | manual | Asks Metricool what it actually did |

---

## 4. Decisions worth remembering

**Public repo, deliberately.** It buys unlimited Actions minutes and free Pages
hosting. Git history was audited for secrets first; all credentials are Actions
secrets. Nothing sensitive is in the repo.

**Daily planning, not weekly.** A week of queued content is a week of decisions
that cost a full rebuild to change. Planning tomorrow each evening means a change
made today is live tomorrow with nothing wasted.

**Slots, not counts.** A day is a list of `{hour, format}`. "3 posters and 1 reel
at 8, 13, 16 and 20" is four slots. The earlier model kept hours and counts apart
and could not express it.

**Looks describe treatment, not subject.** Six looks rotate every 3 days,
changing accent + composition + tone. The **post** decides what is photographed;
the **look** decides how. Before this, a piece about mountain trekkers landed on
a beach photo.

**Rotating Metricool token lives encrypted in the repo.** `GITHUB_TOKEN` cannot
write secrets, so the token is AES-256-GCM sealed and committed; only the key is
a secret. Ciphertext in a public repo is inert. This avoided needing a PAT.

**Confirmation before harmful changes.** Asking for 2 TikToks/day is *held*, not
applied, with the reason: *"about 60 a month, but the free allowance is 20 —
TikTok would stop around day 10."* Applied only on an explicit yes/ndio.

---

## 5. What failed, and what it taught

### The dominant failure mode: silent no-ops
**Nine of the roughly twenty bugs found were failures that looked exactly like
success.** None threw errors. Most passed `node --check`.

| Bug | Looked like |
|---|---|
| Comment permissions denied | "0 comments" |
| `publishTikTok` imported, never called | TikTok simply skipped, no log line |
| `sendPhoto` imported, never called | "Sending soon…" forever |
| Link-comment code without its variables | Nothing — until it threw at runtime |
| Daily cap resolved to `NaN` | Cap silently never applied |
| Retired Groq model | Fallback that only fails when finally needed |
| TTS `--rate -4%` parsed as a flag | Every voiceover silently used the fallback |
| Dev-mode Meta app | Posts visible to the admin, invisible to everyone else |
| Metricool 403 on token save | Credential destroyed by a read-only check |

**Three of these came from one bad habit of mine**: patching files with text
replacement whose anchor didn't match, silently inserting nothing. Fixed by
editing files directly and — critically — **running the code path** rather than
trusting a syntax check.

### The answer: `scripts/preflight.mjs`
Runs on every push and daily. **Executes** rather than inspects:
modules load · **dead-import audit** · config valid · **daily cap is a number** ·
queued assets present · **publish path executes** · brain responds · poster
renders · Meta token · **comment scopes** · Telegram · Metricool.

It caught three real problems within an hour of existing, including one that
would have stopped all posting.

### Other hard-won platform knowledge
- A **Development-mode Meta app** shows content only to people with a role on the
  app. Everything looks perfect in the API. **Take the app Live.**
- `/{page}/photos` creates an album story, **not a feed post**. Upload unpublished,
  attach to `/{page}/feed`.
- `/{page}/videos` gets a `/reel/` URL but never appears in the Reels tab. Native
  Reels need the three-phase `/video_reels` upload.
- Asking for `from` on Page comments **fails the entire request**.
- **Metricool rotates its refresh token on every call** — including a read-only
  status check. Any job touching it needs `contents: write` or it destroys the
  credential just by looking.
- GitHub throttles `schedule:` (a 15-minute cron ran every ~45). **`workflow_dispatch`
  is not throttled** — hence the self-chaining listener.
- Runners are UTC. `setHours(8)` scheduled 11:00 EAT.
- Gemini `-lite` models draw on a **separate quota pool** — they keep working after
  the main tier is spent.
- ffmpeg `-shortest` trims video to the narration and cuts the closing CTA.

### Safety incidents
- **Gemini invented `+255` phone numbers** when asked about pricing. Public replies
  are now withheld entirely if they contain a phone number, price, or figure not in
  `facts.md`.
- My own wildcard cleanup **deleted a live post's asset**. Preflight now catches it.

---

## 6. Known limits

**Structural**
- Metricool free: **20 scheduled posts/month** — only TikTok uses it (~30/month at
  1/day, so it will run out near month end). Watch this.
- Image generator caps at **~0.6 MP** regardless of requested size. `flux` and
  `sana` are the same model. Mitigated with correct aspect + lanczos + grain.
- Gemini free tier is fine at steady state (~8 calls/day); heavy replanning burns it.
- WhatsApp mirror is **one-way**; control stays in Telegram.

**Needs a human**
- Any OAuth re-authorisation (browser only)
- Connecting a new platform account
- Meta app review / business verification

**Not solvable by engineering**
- Organic reach on a cold account. The Facebook Page has **1 follower**; content
  quality cannot compensate for that. This is the real bottleneck, not the pipeline.

---

## 7. Exact next steps

### Immediate — verification still owed
1. **Watch tomorrow's 08:00 carousel** — the format is proven manually but has
   never run through the scheduled path.
2. **Test comment replies end to end** — leave a comment on any post (e.g.
   *"Bei gani?"*). Expect it escalated as a **lead** to WhatsApp within 30 minutes,
   **not** bot-answered.
3. **Answer the open lead** — someone asked *"How can I get this?"* on Facebook and
   it is still unanswered by a human.

### Short-term improvements
4. **Cloudflare Workers AI token** — the only route to genuinely sharper
   backgrounds (~1024² native vs 686×858). The provider slot already exists; it
   needs one API token from the dashboard. Low priority: backgrounds sit under a
   scrim with text over them.
5. **Metricool month-end** — decide whether TikTok goes quiet for the last ~10 days
   of each month, or reels drop to one a day.
6. **Facebook Page username** — set `facebook.com/operra.tech` if not already done;
   it is the cheapest findability win available.
7. **Google Business Profile** — Metricool supports `gmb` as a network. This
   sidesteps Google's API approval entirely and was never wired up.

### Larger, and higher value than any of the above
8. **The prospect pipeline.** Alice solves *production*; she does not solve
   *distribution*. The highest-value remaining build is the one discussed but never
   started:
   - Scrape Tanzanian hotels from **OpenStreetMap Overpass** (free, no key)
   - Auto-generate a **personalised demo asset per prospect** ("Operra kwa
     [Hotel Name]") using the existing renderer
   - Hand each to the owner to send by hand — automated blasting risks the number

   This is what would actually get Operra clients. The content pipeline is
   already well ahead of the audience it reaches.

---

## 8. Key files

```
ARCHITECTURE.md          full technical + commercial documentation
scripts/preflight.mjs    the test suite that executes every path
src/brain.js             prompts, pillars, looks, figure guard
src/config.js            slots, tiktokPerDay, confirmation gate
src/inbox.js             Telegram handling (shared by both listeners)
src/publish/             facebook · instagram · reels · tiktok · comment
brands/operra/           brand.json · pillars.md · facts.md · templates/
state/                   queue · history · config · leads · sealed token
```

**Porting to a new client is authoring `brands/<id>/`.** No code changes.
Marginal cost per client: **$0**.
