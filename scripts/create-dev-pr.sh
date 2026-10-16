#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
dev="${1:?Use: bash scripts/create-dev-pr.sh DEV-01 'Title'}"
title="${2:?Title missing}"
[[ "$dev" =~ ^DEV-(0[0-9]|1[0-8])$ ]] || exit 2
branch="$(git branch --show-current)"
[[ "$branch" =~ ^dev/${dev,,}-[a-z0-9][a-z0-9-]*$ ]] || { echo "Wrong branch"; exit 1; }
report="docs/dev-reports/$dev.md"
[[ -f "$report" ]] || { echo "DEV report required"; exit 1; }
[[ -z "$(git status --porcelain)" ]] || { echo "Commit reviewed changes first"; exit 1; }
git fetch origin main
# Query failures must not be mistaken for a missing PR.
repo="$(gh repo view --json nameWithOwner --jq .nameWithOwner)"
existing="$(gh pr list --repo "$repo" --head "$branch" --state all --json number,state --limit 100)"
state="$(python3 -c 'import json,sys;p=json.loads(sys.argv[1]);print("open" if any(x["state"]=="OPEN" for x in p) else "closed" if p else "absent")' "$existing")"
[[ "$state" != closed ]] || { echo "Prior closed/merged DEV PR exists; inspect before creating another"; exit 1; }
python3 scripts/check_public_files.py
PYTHONPATH=scripts python3 -m unittest discover -s scripts -p 'test_*.py' -q
git push origin "HEAD:refs/heads/$branch"
if [[ "$state" == absent ]]; then
  gh pr create --repo "$repo" --base main --head "$branch" --title "[$dev] $title" --body-file "$report"
fi
gh pr view "$branch" --repo "$repo" --json url --jq .url
echo "PR created/reused. Guarded Auto Merge workflow handles current-SHA successful CI and explicit completion. All paths require independent current-head verification; no owner approval is required."
