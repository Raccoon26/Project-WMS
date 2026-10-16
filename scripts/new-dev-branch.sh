#!/usr/bin/env bash
set -euo pipefail
branch="${1:?Use: bash scripts/new-dev-branch.sh dev/dev-01-foundation}"
[[ "$branch" =~ ^dev/dev-(0[0-9]|1[0-8])-[a-z0-9][a-z0-9-]*$ ]] || exit 2
[[ -z "$(git status --porcelain)" ]] || { echo "Dirty working tree"; exit 1; }
# Reuse existing branches; never reset/recreate an existing DEV branch.
if git show-ref --verify --quiet "refs/heads/$branch"; then
  git switch "$branch"
elif git ls-remote --exit-code --heads origin "$branch" >/dev/null; then
  git fetch origin "refs/heads/$branch:refs/remotes/origin/$branch"
  git switch -c "$branch" "refs/remotes/origin/$branch"
else
  # ls-remote exit 2 means no match; errors must not be treated as absence.
  status=$?
  [[ "$status" == 2 ]] || exit "$status"
  git fetch origin main
  git switch -c "$branch" FETCH_HEAD
fi
