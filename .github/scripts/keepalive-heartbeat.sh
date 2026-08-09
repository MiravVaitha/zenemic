#!/usr/bin/env bash
#
# Keeps the *scheduler* alive, not the database.
#
# GitHub disables a scheduled workflow after 60 days with no commits to the
# repository, and does it quietly — no failed run, just one email that is easy to
# miss. A keepalive that switches itself off after two quiet months is worse than
# no keepalive at all, because you stop expecting the pause emails.
#
# So: whenever the repo has gone quiet enough to be at risk, push a dated stamp.
# During active development this never fires; during a genuinely quiet year it
# costs about seven one-line commits.
#
# gautamkrishnar/keepalive-workflow used to do this as a marketplace action, but
# GitHub has taken it down for a ToS violation — hence these few lines instead of
# a dependency that could vanish the same way.

set -euo pipefail

THRESHOLD_DAYS=50 # 10 days of slack before GitHub's 60
STAMP=".github/keepalive-stamp"

last_commit=$(git log -1 --format=%ct)
days=$(( ( $(date +%s) - last_commit ) / 86400 ))

if [ "${FORCE:-false}" != "true" ] && [ "$days" -lt "$THRESHOLD_DAYS" ]; then
  echo "Last commit ${days}d ago, under the ${THRESHOLD_DAYS}d threshold — no heartbeat needed."
  exit 0
fi

echo "Last commit ${days}d ago — pushing a heartbeat so the schedule survives."

date -u +%Y-%m-%dT%H:%M:%SZ > "$STAMP"

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

# Scoped on purpose. `git add -A` here would sweep up whatever the ping step left
# in the working tree.
git add "$STAMP"

if git diff --cached --quiet; then
  echo "Stamp unchanged — nothing to commit."
  exit 0
fi

git commit -m "chore: keepalive heartbeat (resets GitHub's 60-day workflow timer)"
git push
