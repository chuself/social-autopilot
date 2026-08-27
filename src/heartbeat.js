/**
 * The clock Alice can actually rely on.
 *
 * GitHub throttles `schedule:` and, on a bad day, simply stops firing it. On
 * 27 August the crons collapsed: publish ran twice instead of twenty-four
 * times, engage twice instead of forty-eight, and reel not once. Nothing was
 * broken and nothing failed — the runs were never created. Alice posted nothing
 * all day and had no way to know why.
 *
 * The listener, meanwhile, ran nineteen times, because it dispatches its own
 * successor and `workflow_dispatch` is NOT throttled. That is already written
 * down in ARCHITECTURE.md §7; it was just never applied to anything but the
 * listener.
 *
 * So the long-lived listener becomes the heartbeat for everything else. Crons
 * stay exactly as they are, as the resurrection path — if the listener chain
 * ever dies, the schedule still eventually restarts it.
 *
 * Self-correcting on purpose: at shift start it asks GitHub when each workflow
 * genuinely last ran, so a cron that DID fire is never duplicated, and a
 * restart cannot double-fire.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const run = promisify(execFile);
const ROOT = path.resolve(import.meta.dirname, "..");
const REPO = process.env.GITHUB_REPOSITORY ?? "chuself/social-autopilot";

/** How often each job should run, in minutes, when its own condition is met. */
const JOBS = [
  { workflow: "publish", everyMin: 60 },
  { workflow: "engage", everyMin: 30 },
  { workflow: "reel", everyMin: 150, when: reelNeeded },
  { workflow: "plan-week", everyMin: 360, when: planNeeded },
];

/** When each workflow last actually started, straight from GitHub. */
export async function lastRunTimes() {
  const seen = {};
  for (const job of JOBS) {
    try {
      const { stdout } = await run("gh", [
        "run", "list", "-R", REPO, "--workflow", job.workflow,
        "-L", "1", "--json", "createdAt",
      ]);
      const rows = JSON.parse(stdout);
      seen[job.workflow] = rows[0]?.createdAt ? new Date(rows[0].createdAt).getTime() : 0;
    } catch (err) {
      // Not knowing is not a reason to spam dispatches: assume it just ran and
      // let the next tick sort it out.
      console.warn(`heartbeat: could not read last ${job.workflow} run — ${err.message.slice(0, 60)}`);
      seen[job.workflow] = Date.now();
    }
  }
  return seen;
}

/**
 * Dispatch whatever is overdue. Mutates `seen` so one tick cannot fire the
 * same workflow twice.
 *
 * @param {Record<string, number>} seen  workflow -> epoch ms of last run
 */
export async function heartbeat(seen, { dispatch, now = Date.now() } = {}) {
  const fired = [];
  for (const job of JOBS) {
    const last = seen[job.workflow] ?? 0;
    if (now - last < job.everyMin * 60_000) continue;
    if (job.when && !(await job.when(now))) continue;

    const ok = await dispatch(job.workflow);
    // Only mark it as run if the dispatch was accepted; otherwise retry next tick.
    if (ok) {
      seen[job.workflow] = now;
      fired.push(job.workflow);
    }
  }
  return fired;
}

/**
 * Only wake the reel job when a reel actually needs filming — it installs a
 * browser and ffmpeg, so firing it every two hours regardless would burn
 * minutes for nothing.
 */
async function reelNeeded(now) {
  try {
    const { readQueue, MAX_LATE_HOURS } = await import("./queue.js");
    const queue = await readQueue();
    return queue.some((p) => {
      if (p.format !== "reel" || p.reel) return false;
      if (p.status !== "pending" && p.status !== "approved") return false;
      const due = new Date(p.scheduledFor).getTime();
      const hoursLate = (now - due) / 3600_000;
      // Film from three hours before the slot until it is too late to publish.
      return due - now < 3 * 3600_000 && hoursLate < MAX_LATE_HOURS;
    });
  } catch {
    return false;
  }
}

/** Only plan after the evening slot, and only if tomorrow is still empty. */
async function planNeeded(now) {
  try {
    const { readQueue } = await import("./queue.js");
    const { readConfig } = await import("./config.js");
    const eatHour = new Date(now + 3 * 3600_000).getUTCHours();
    if (eatHour < 21) return false;

    const cfg = await readConfig();
    const queue = await readQueue();
    const ahead = queue.filter(
      (p) =>
        p.status !== "posted" &&
        p.status !== "reject" &&
        p.status !== "missed" &&
        new Date(p.scheduledFor).getTime() > now
    );
    return ahead.length < cfg.slots.length;
  } catch {
    return false;
  }
}

export { ROOT };
