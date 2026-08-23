# Watchdog checklist

What an automated reviewer should check twice a day, and what counts as a fault.

**Report only.** Never edit, commit, push, dispatch a workflow, or message anyone.
Describe what is wrong; do not fix it. A watchdog that changes things is another
thing that can break production.

**No credentials.** Anything needing a Meta, Telegram or Metricool token will
fail. That is expected and is not a finding.

---

## 1. Preflight

```
node scripts/preflight.mjs --quick
```

Always `--quick`. **Never run preflight without `--skip=metricool`** — every
Metricool call rotates a shared refresh token, and a rotation that is not
committed breaks production for real. `--quick` already skips it; do not
override that.

Report every `FAIL` and `WARN` verbatim.

## 2. The schedule — `state/queue.json`

Times stored are UTC; the owner thinks in EAT (UTC+3). Flag:

- `pending` more than 90 minutes past `scheduledFor`
- `reel.status: ready` and past its slot — filmed but never published
- `needs-review` sitting more than 24 hours — a decision nobody made
- `missed` — a slot closed unpublished
- slots configured in `state/config.json` with nothing queued against them today
  or tomorrow

## 3. What actually went out — `state/history.json`

This is the receipt, **one row per platform**, so one post to Facebook and
Instagram is two rows.

- the same `id` + `platform` twice with **different** `postId` is a double-post
- count **distinct** ids in the last 24h and compare against the configured
  slots

## 4. People waiting

- `state/leads.json` — unanswered buying signals, and how old
- `state/alerts.json` — outstanding alerts and when each was last sent

## 5. Churn

```
git log --since='36 hours ago' --oneline
```

Note the rate of change, and whether commits look like repeated attempts at the
same problem. Repeated fixes to one area are themselves a finding.

---

## Invariants — a violation is serious

These are the rules the system is supposed to guarantee. Preflight executes most
of them; check that the checks themselves still exist.

| Invariant | Why |
|---|---|
| **Metricool is for TikTok only** | The free plan is 20 posts/month and TikTok has no other route to a public post. Another network on that call starves TikTok mid-month, silently. |
| **A reconciler must never die for one item** | `publish` runs hourly and must survive any single unpublishable post. One transient 503 once took down a whole run and reported "Publishing FAILED" as though nothing had gone out. |
| **Nothing publishes without a reachable asset** | Instagram fetches media server-side; an unreachable file fails at the last step. |
| **No post publishes twice** | History is the receipt. A lost state commit once caused two real double-posts. |
| **Every skip is recorded** | A slot that passes must leave a reason on the row. Silence is the dominant failure mode here. |

---

## Report format

Lead with anything actually wrong. If nothing is wrong, say so in one line and
give the one-line state of the day. Do not pad. The reader is deciding whether
they need to act in the next few hours, not reading a report.
