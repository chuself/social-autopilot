#!/usr/bin/env bash
#
# Commit state and get it pushed, even when another job pushes at the same time.
#
# Every workflow here commits to the same branch, so a plain `git push` after a
# plain `git pull --rebase` loses whenever a second job lands in the gap. That
# failure is not cosmetic: publish.yml records "this post went out" in the same
# commit, so a lost push means the queue still says pending and the next hourly
# run publishes the same post a second time.
#
# A job checks the repo out when it STARTS and commits when it FINISHES, so a
# job that runs for eight minutes is always writing against a stale base. The
# reel job proved it: it filmed a reel while publish marked that same post
# `missed`, and `git pull --rebase` hit a content conflict in state/queue.json.
# The old loop then retried five times on top of a half-finished rebase, each
# attempt failing differently, and left the runner on a detached HEAD with the
# built video committed nowhere.
#
# So a conflict is no longer merged textually. State here is DERIVED: the queue
# is rebuilt from what actually happened, and any flag we overwrite is
# re-derived by the next run — publish re-marks a late post `missed` within the
# hour. Re-applying our own files onto the current origin is therefore both
# safe and the only thing that terminates.
#
#   scripts/push-state.sh "chore: post history [skip ci]" state/history.json state/queue.json
#
set -uo pipefail

msg="${1:?commit message required}"
shift
[ "$#" -gt 0 ] || { echo "::error::no paths given to push-state.sh"; exit 2; }

git config user.name "social-autopilot"
git config user.email "actions@users.noreply.github.com"

branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo main)"
[ "$branch" = "HEAD" ] && branch=main

# Snapshot what we intend to ship BEFORE anything can reset the tree. Without
# this, recovering from a conflict would delete the very files we just made —
# a freshly built .mp4 is untracked until we add it, and gone after a reset.
snap="$(mktemp -d)"
for p in "$@"; do
  if [ -e "$p" ]; then
    mkdir -p "$snap/$(dirname "$p")"
    cp -r "$p" "$snap/$(dirname "$p")/" 2>/dev/null || true
  fi
done
trap 'rm -rf "$snap"' EXIT

stage_and_commit() {
  # -f because public/*.png is gitignored for local development but must ship.
  # -A so a DIRECTORY pathspec also stages deletions: --replace deletes the
  # assets of dropped posts, and without this they stayed in the repo and on
  # Pages for ever as orphans. Pass directories only where you want that sync —
  # never a directory holding genuinely ignored files like state/frames.
  git add -f -A -- "$@" 2>/dev/null || true
  if git diff --staged --quiet; then
    return 1
  fi
  git commit -m "$msg" >/dev/null || return 2
  return 0
}

for attempt in 1 2 3 4 5; do
  stage_and_commit "$@"
  case $? in
    1) echo "nothing to record"; exit 0 ;;
    2) echo "::error::commit failed"; exit 1 ;;
  esac

  if git push origin "HEAD:$branch"; then
    echo "pushed on attempt $attempt"
    exit 0
  fi

  echo "push rejected — another job landed first; rebasing onto it (attempt $attempt)"

  # Never leave a half-finished rebase behind: every later attempt would fail
  # against it instead of against the real problem.
  git rebase --abort >/dev/null 2>&1 || true
  git merge --abort >/dev/null 2>&1 || true

  git fetch origin "$branch" >/dev/null 2>&1 || true

  if git pull --rebase --autostash >/dev/null 2>&1; then
    # Clean rebase: our commit sits on top of theirs, nothing was lost.
    continue
  fi

  # Conflict. Take their base, put our files back on it, and commit again.
  echo "  content conflict — re-applying our files onto the latest origin"
  git rebase --abort >/dev/null 2>&1 || true
  git checkout -B "$branch" "origin/$branch" >/dev/null 2>&1 ||
    git reset --hard "origin/$branch" >/dev/null 2>&1 || true

  for p in "$@"; do
    if [ -e "$snap/$p" ]; then
      mkdir -p "$(dirname "$p")"
      cp -r "$snap/$p" "$(dirname "$p")/" 2>/dev/null || true
    fi
  done

  sleep $((attempt * 3))
done

# Loud on purpose. A silently unrecorded post is the double-post bug.
echo "::error::could not push state after 5 attempts — the queue may not reflect what was posted"
exit 1
