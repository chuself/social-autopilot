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
#   scripts/push-state.sh "chore: post history [skip ci]" state/history.json state/queue.json
#
set -uo pipefail

msg="${1:?commit message required}"
shift
[ "$#" -gt 0 ] || { echo "::error::no paths given to push-state.sh"; exit 2; }

git config user.name "social-autopilot"
git config user.email "actions@users.noreply.github.com"

# -f because state/ holds files that are gitignored for local development.
git add -f "$@" 2>/dev/null || true

if git diff --staged --quiet; then
  echo "nothing to record"
  exit 0
fi

git commit -m "$msg" || { echo "::error::commit failed"; exit 1; }

for attempt in 1 2 3 4 5; do
  if git push; then
    echo "pushed on attempt $attempt"
    exit 0
  fi
  echo "push rejected — another job landed first; rebasing (attempt $attempt)"
  git pull --rebase --autostash || true
  sleep $((attempt * 3))
done

# Loud on purpose. A silently unrecorded post is the double-post bug.
echo "::error::could not push state after 5 attempts — the queue may not reflect what was posted"
exit 1
