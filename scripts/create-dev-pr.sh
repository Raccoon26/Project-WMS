#!/usr/bin/env bash
set -euo pipefail
dev="${1:?Use: bash scripts/create-dev-pr.sh DEV-01 'Title'}"
title="${2:?Title missing}"
[[ "$dev" =~ ^DEV-(0[0-9]|1[0-8])$ ]] || exit 2
branch="$(git branch --show-current)"
[[ "$branch" =~ ^dev/${dev,,}-[a-z0-9][a-z0-9-]*$ ]] || { echo "Wrong branch";exit 1; }
report="docs/dev-reports/$dev.md"
[[ -f "$report" ]] || { echo "DEV report required";exit 1; }
[[ -z "$(git status --porcelain | grep '^??' || true)" ]] || { echo "Untracked files";exit 1; }
git diff --quiet || { echo "Unstaged changes";exit 1; }
git diff --cached --quiet && { echo "No reviewed changes staged";exit 1; }
git diff --cached --name-only | grep -Fx "$report" >/dev/null || { echo "Missing staged DEV report";exit 1; }
git diff --cached --check
PYTHONPATH=scripts python3 -m unittest -q test_pr_policy
git commit -m "feat(${dev,,}): $title"
git push -u origin "$branch"
if ! gh pr view "$branch" >/dev/null 2>&1; then
  if git diff --name-only origin/main...HEAD | python3 -c 'import sys;sys.path.insert(0,"scripts");from pr_policy import manual;sys.exit(0 if any(manual(x.strip()) for x in sys.stdin) else 1)'; then
    gh pr create --draft --base main --head "$branch" --title "[$dev] $title" --body-file "$report"
  else
    gh pr create --base main --head "$branch" --title "[$dev] $title" --body-file "$report"
  fi
fi
number="$(gh pr view "$branch" --json number --jq .number)"
gh pr view "$number" --json url --jq .url
if ! bash scripts/enable-safe-auto-merge.sh "$number";then
  echo "No auto-merge: missing safety checks or owner review required."
fi
