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
  # Low-risk branch only: ready PR triggers trusted CI-verified auto merge.
  # Never treat an uninspectable diff as safe.
  if PYTHONPATH=scripts python3 - "$report" <<'PY'
import subprocess,sys
from pr_policy import forbidden,manual
r=subprocess.run(['git','diff','--name-only','-z','origin/main...HEAD'],
                 capture_output=True,check=False)
if r.returncode: raise SystemExit(1)
paths=[p.decode('utf-8') for p in r.stdout.split(b'\0') if p]
if not paths or sys.argv[1] not in paths or any(forbidden(p) or manual(p) for p in paths):
    raise SystemExit(1)
PY
  then
    gh pr create --repo "$repo" --base main --head "$branch" --title "[$dev] $title" --body-file "$report"
  else
    gh pr create --repo "$repo" --draft --base main --head "$branch" --title "[$dev] $title" --body-file "$report"
  fi
fi
gh pr view "$branch" --repo "$repo" --json url --jq .url
echo "PR created/reused. Guarded Auto Merge workflow handles ONLY safe, current-SHA successful CI; risk PRs stay draft."
