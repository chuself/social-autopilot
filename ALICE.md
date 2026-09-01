# Alice

What she is, what she can reach, how she runs, and — the part that matters
most — **how she decides**.

`ARCHITECTURE.md` is the technical and commercial reference. `HANDOVER.md` is
the session history. `WATCHDOG.md` is the review checklist. This file is the
operating manual: read it to understand her behaviour without reading the code.

Brand: **Operra HMS** · Facebook `Operra.Tech` · Instagram `@operra.tech` ·
TikTok `@operra.tech` · Kiswahili and English · **$0/month**.

---

## 1. What she is

An autonomous social media operator. She plans the day, writes the copy,
generates the imagery, renders posters and narrated vertical video, publishes to
three platforms, answers comments, escalates buying signals, and takes
instructions over Telegram.

There is no server. **The repository is the database** and GitHub Actions is the
compute. Every job commits what it changed, so the state and the audit trail are
the same thing.

The owner's entire involvement is a Telegram conversation.

---

## 2. What she has access to

| Service | Used for | Gate |
|---|---|---|
| GitHub Actions | All compute | Free, unlimited on a public repo |
| GitHub Pages | Public asset hosting | Repo must be public |
| Meta Graph API | Facebook Page + Instagram | App must be **Live** |
| Metricool MCP | **TikTok only** | 20 scheduled posts/month, free plan |
| Google AI Studio | Copy, reel scripts, vision, voice | Free tier |
| Groq | LLM fallback | Free |
| image.pollinations.ai | Backgrounds | Free, keyless |
| Microsoft Edge TTS | Voice fallback, real `sw-TZ` | Free, keyless |
| Telegram Bot API | Control channel | Free |
| CallMeBot | WhatsApp alert mirror | Free, one-way |
| Google Sheets | Human review surface | Free |

**Credentials she holds:** `FB_PAGE_ID`, `FB_PAGE_ACCESS_TOKEN` (never expires),
`IG_USER_ID`, `GEMINI_API_KEY`, `GROQ_API_KEY`, `TELEGRAM_BOT_TOKEN`,
`TELEGRAM_CHAT_ID`, `METRICOOL_KEY`, `METRICOOL_OAUTH`, `CALLMEBOT_*`,
`GOOGLE_SERVICE_ACCOUNT_JSON`, `SHEET_ID`.

**What she cannot do:** re-authorise OAuth, connect a new platform account, pass
Meta app review, or spend money.

---

## 3. The day

```
08:00 EAT  carousel
13:00 EAT  reel
16:00 EAT  reel
20:00 EAT  poster
```

Defined in `state/config.json` as **slots** — a list of `{hour, format}`. Counts
are not a separate setting: three posters and one reel is simply four slots.
Changeable from Telegram; validated hard (6–23h, max 6 slots/day, max 2
reels/day).

---

## 4. How she decides

This is the part worth reading.

### What to write about

Six **pillars** rotate round-robin: `feature-spotlight`, `pain-point`,
`number-that-lands`, `client-proof`, `swahili-tip`, `industry-note`.

Round-robin is the floor, so the feed never collapses into one note. On top of
it, `cli-metrics.js` scores each pillar by real engagement: a pillar that
consistently flops **and** was used recently gets skipped once. It is thinned,
never dropped.

### Which language

Fixed per pillar, so the feed leans Kiswahili 4-in-6 — the audience is Tanzanian
hoteliers. English is kept for hard numbers and regional commentary, where it
reads more naturally.

`feature-spotlight` sw · `pain-point` sw · `number-that-lands` **en** ·
`client-proof` sw · `swahili-tip` sw · `industry-note` **en**

### Which city

Rotates by total posts written — Dar es Salaam, Arusha, Zanzibar, Mwanza, Moshi
— so it advances across days rather than resetting each run.

### What the image shows

The **post** decides the subject; the **look** decides the treatment. Six looks
(`goldenhour`, `flatlay`, `macro`, `blueprint`, `daylight`, `nightfall`) rotate
every three days, changing accent, composition and tone.

The look is **recorded on the post**, so a re-render weeks later reproduces the
original rather than today's rotation.

She is also shown the subjects of the **last fourteen backgrounds** and told not
to reuse them. Without that she drew a key on a reception desk six posts running
while the copy ranged across wifi, billing and group arrivals — she was avoiding
repeated *headlines* and had no idea what she had already photographed.

### How a reel moves

Twelve hand-picked motion styles — `steady`, `snap`, `settle`, `sweep`,
`counter`, `bloom`, `focus`, `headline`, `ticker`, `poster`, `drop`, `quiet` —
each a coherent set of choices: how a beat arrives and leaves, how the
background moves, alignment, rule, progress bar, how the CTA lands, and pace
(`snap` arrives in 0.22s, `quiet` takes 0.60s).

Chosen from a **hash of the post id** — never random, never the clock — because
the renderer screenshots `setFrame(t)` and must produce identical frames on
every run. Recorded as `post.reelStyle` so a re-render reproduces it exactly.

### Whether a figure is allowed

Any number in the copy that is not in `brands/operra/facts.md` holds the post at
`needs-review`, which never auto-publishes. This exists because the model
invented plausible `+255` phone numbers when asked about pricing.

Always held: percentages, prices in TZS/USD/shillingi, bare statistics, phone
numbers. Released: years, single digits, the `24/7` idiom, and any number
touching a time word in either language — `masaa 24 kabla`, `within 48 hours`,
`siku 3`. In *"20% off for 3 days"* the `20%` is held and the `3` is not.

### Whether to publish

A post goes out when its slot has arrived **and** its image is live on Pages —
Instagram fetches media server-side, so an unreachable file fails at the last
step. If the file is committed but not served, she asks Pages to redeploy rather
than shrugging.

Guards, in order: kill switch (`state/PAUSED`), daily cap (slots + 1 per
platform), **history receipt** (already in history → never posted twice), asset
reachable.

### How late is too late

| Bound | Default | Meaning |
|---|---|---|
| `MAX_LATE_HOURS` | **6h** | Past this a slot is closed as `missed` rather than posted at the wrong hour |
| `HELD_MAX_HOURS` | **14h** | A post waiting on a human decision. Longer on purpose — people sleep, so an overnight hold survives until morning |
| `UNDO_WINDOW_MIN` | **180m** | How long "cancel that" still refers to the last thing she did |

A **platform outage is not a missed slot**: when every platform refuses with an
auth error, the post is flagged and held rather than closed.

Approving *after* the slot has gone **moves** the post to the next free slot
rather than losing it.

### Which reel goes to TikTok

One per day. A **Kiswahili reel outranks an English one** for that slot — the
audience is Tanzanian and TikTok is where a cold account can still reach them.

> **Metricool is for TikTok. Nothing else. Ever.** The free plan allows 20
> scheduled posts a month across every network it can reach, and TikTok has no
> other route to a public post. `publishTikTok` throws if given a `networks`
> option, and preflight executes that guard every run so it cannot drift back.

### When a change needs confirming

Anything that quietly breaks something later is **held, not applied**, with the
reason — and applied only on an explicit yes:

- more than 1 TikTok/day → *"about 60 a month, but the free allowance is 20 — TikTok would stop around day 10"*
- a campaign taking more than half the day → *"75% of everything you publish. A feed that is mostly one advert loses reach that takes months to win back."*

### Whether a comment gets a reply

Comments are read from **two nested feed reads in one batched call**, covering
the whole account regardless of post count, over a 7-day window.

Then: skip anything already replied to; skip **her own** comments (recognised by
recorded id *and* by content — the CTA number, a `wa.me` link, the brand site);
classify the rest.

- **lead** → escalated to a human, never answered by the bot
- **reply** → passed through the sanitiser
- **ignore** → left alone

The **sanitiser withholds entirely** — never patches — any reply containing a
phone number, price, or figure not in `facts.md`. Max 10 replies per run.

### What a Telegram message means

In order, before anything reaches the classifier:

1. **A pending confirmation** → only `yes`/`ndio` applies it
2. **"Cancel that" / "undo" / "acha" / "ghairi"** → undoes the last reversible action
3. **A rewrite note** → applies to that one post
4. **A slash command** → runs it; an unknown one says so rather than being chatted at
5. **A photo** → downloaded, then handed to a job with the tools
6. Otherwise → classified as `setting`, `campaign`, `instruction`, `preview`, `question` or `chat`

A **standing instruction** is handed to the writer for every future post, so the
bar is high. Anything pointing at something happening right now — *that, this,
it, hii, hiyo* — or a bare timing command is answered, **not written into the
brief**. `"Post it now"` and `"Cancel that use the original post"` had both
become permanent brand voice this way.

### What happens to a photo you send

Nothing trusts the input:

1. `ffprobe` — is it really an image, and at least 700×700
2. **vision** — what is it, can a headline sit over it, is it a screenshot or a document
3. `ffmpeg` — scale to cover, then centre-crop to the post's canvas; never letterboxed, never squashed

Then **two confirmations, and only for that post** — everything else in the
queue carries on automatically:

- *"Use it here?"* → she picks the slot (what you **said** outranks the subject match)
- *"Post it like this?"* → held at `needs-review` until you answer

The vision verdict is **advice, not a veto**: it is your photograph and you may
know better.

---

## 5. How she runs

### The heartbeat

GitHub throttles `schedule:` and on 27 August stopped firing it almost entirely
— publish ran twice instead of twenty-four times and reel not at all, so nothing
was posted all day. Nothing failed; the runs were never created.

**`workflow_dispatch` is not throttled.** The listener already runs around the
clock by dispatching its own successor, so it is now the clock for everything
else:

| Job | Cadence | Condition |
|---|---|---|
| `publish` | 60m | — |
| `engage` | 30m | — |
| `reel` | 150m | only when a reel actually needs filming |
| `plan-week` | 360m | only after 21:00 EAT and only if tomorrow is empty |

Seeded from GitHub's real run history at shift start, so a cron that *did* fire
is never duplicated. **One queue writer per tick** — publish, reel and plan share
a lock and GitHub cancels a displaced pending run. Crons stay as the
resurrection path.

### The workflows

`plan` · `publish` · `reel` · `engage` · `listen-live` · `listen` · `photo` ·
`rewrite` · `preflight` · `looks` · `pages` · `token-check` · `metricool-status`

### State

`queue.json` (the schedule) · `history.json` (the receipt, one row **per
platform**) · `config.json` · `campaigns.json` · `leads.json` · `steer.md`
(standing instructions) · `actions.json` (button tokens) · `last-action.json`
(what is undoable) · `alerts.json` (what has already been said) ·
`metricool.enc` (AES-256-GCM sealed) · `media/` · `photo-queue.json`

---

## 6. Talking to her

```
/status      what is out, what is not, and why
/watchdog    run every check and report the faults   (= /preflight /check /doctor)
/campaigns   what is running and until when
/looks       every visual look side by side
/replan      rebuild the schedule now
/pause  /resume
/clear       forget my standing instructions
```

Plain text works: *less formal, write like WhatsApp* · *3 posters and 1 reel at
8, 13, 16 and 20* · *run an Eid offer, 20% off, five days from Friday* · **send a
photo** and she puts it on the right post.

Replies lead with the answer, stay under 35 words, and give times in EAT.

---

## 7. The invariants

Rules every change must preserve. Most are **executed** by preflight on every
run, because a rule nobody checks is a rule that drifts.

| Invariant | Why |
|---|---|
| **Metricool is for TikTok only** | 20/month is TikTok's lifeline; another network starves it silently mid-month |
| **A reconciler must never die for one item** | One transient 503 on one MP4 once took down a whole publish run |
| **Nothing publishes without a reachable asset** | Instagram fetches media server-side |
| **No post publishes twice** | History is the receipt; a lost state commit once caused two real double-posts |
| **Every skip is recorded** | Silence is the dominant failure mode here |
| **A passing remark never becomes a permanent rule** | The brand brief is handed to the writer for every future post |
| **A held post has working buttons** | A post nobody can approve is a post that cannot go out |
| **Determinism in rendering** | `setFrame(t)` must produce the same frame every run |

**36 preflight checks** run on every push, daily, and on demand from Telegram.

---

## 8. Why it fails, when it fails

> Most failures here are **silent no-ops**. A denied permission reads as "no
> comments". A patch whose anchor did not match inserts nothing. A cap that
> resolves to `NaN` is never applied. A cron that does not fire leaves no trace.
> None of them throw. All of them look like success.

Everything in this system follows from that: preflight **executes** rather than
inspects, every skip writes down its reason, and an alert says the same thing
once rather than every thirty minutes.

### Hard-won specifics

- A **Development-mode Meta app** shows content only to people with a role on it. Everything looks perfect in the API and nobody else sees anything.
- `/{page}/photos` creates an album story, **not a feed post**.
- `/{page}/videos` never appears in the Reels tab; native Reels need the three-phase `/video_reels` upload.
- Asking for `from` on Page comments **fails the entire request**.
- **Metricool rotates its refresh token on every call**, including a read-only status check. Any rotation that is not committed breaks production — including one on a laptop.
- Runners are **UTC**; the owner thinks in **EAT (UTC+3)**.
- Gemini `-lite` models draw on a **separate quota pool** and keep working after the main tier is spent.
- `edge-tts` needs `--rate=-4%`; the bare form is parsed as another flag and every voiceover fails silently into the fallback.
- ffmpeg `-shortest` trims the video to the narration and cuts the closing CTA.
- Telegram allows **64 bytes** of `callback_data` and drops the whole message above it — hence short tokens resolved from state.
- A job checks out the repo when it **starts** and commits when it **finishes**, so anything long-running writes against a stale base.

---

## 9. Known limits

**Structural**
- Metricool free: 20 scheduled posts/month — TikTok only, ~30/month at 1/day, so it runs out near month end
- Backgrounds cap at ~0.6 MP whatever size is requested
- Gemini free tier is fine at steady state; heavy replanning burns it
- WhatsApp mirror is one-way; control stays in Telegram

**Needs a human**
- Any OAuth re-authorisation · connecting a new platform · Meta app review

**Not solvable by engineering**
- Organic reach on a cold account. The Page has 2 followers. Content quality cannot compensate for that, and it remains the real bottleneck.

---

## 10. Porting to another brand

Author `brands/<id>/` — `brand.json`, `pillars.md`, `facts.md`, `templates/`,
`assets/`. No code changes. Marginal cost per client: **$0**.

The thing a buyer is actually getting is not the code — it is §8.
