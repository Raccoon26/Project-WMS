#!/usr/bin/env bash
set -euo pipefail
pr="${1:?Use: bash scripts/enable-safe-auto-merge.sh PR_NUMBER}"
[[ "$pr" =~ ^[0-9]+$ ]] || exit 2
command -v gh >/dev/null || exit 1
repo="$(gh repo view --json nameWithOwner --jq .nameWithOwner)"
[[ "$(gh api "repos/$repo" --jq .allow_auto_merge)" == true ]] || { echo "SAFE STOP: repo auto-merge disabled";exit 1; }
tmp="$(mktemp -d)";trap 'rm -rf "$tmp"' EXIT
gh api "repos/$repo/branches/main/protection" >"$tmp/protection.json" 2>/dev/null || { echo "SAFE STOP: cannot verify main protection";exit 1; }
python3 - "$tmp/protection.json" <<'PY'
import json,sys
p=json.load(open(sys.argv[1]))
sc=p.get("required_status_checks") or {}
required=set(sc.get("contexts") or []) | {c.get("context","") for c in sc.get("checks",[])}
if not {"WMS Quality Gate","WMS Policy Gate"}.issubset(required):raise SystemExit("Missing required protected checks")
if not sc.get("strict"):raise SystemExit("Branches must be up-to-date")
if not p.get("required_pull_request_reviews"):raise SystemExit("PR requirement missing")
if not (p.get("enforce_admins") or {}).get("enabled"):raise SystemExit("Admin bypass not restricted")
if (p.get("allow_force_pushes") or {}).get("enabled"):raise SystemExit("Force push allowed")
if (p.get("allow_deletions") or {}).get("enabled"):raise SystemExit("Deletion allowed")
PY
gh api "repos/$repo/pulls/$pr" --jq '{head:.head.ref,headRepo:.head.repo.full_name,base:.base.ref,draft:.draft,title:.title,state:.state}' >"$tmp/pr.json"
gh api "repos/$repo/pulls/$pr/files?per_page=100" --paginate --jq '.[].filename' >"$tmp/files"
gh api "repos/$repo/issues/$pr/labels" --jq '.[].name' >"$tmp/labels"
python3 - "$tmp/pr.json" "$tmp/files" "$tmp/labels" "$repo" <<'PY'
import json,sys
from pathlib import Path
sys.path.insert(0,"scripts")
from pr_policy import validate,manual
meta=json.loads(Path(sys.argv[1]).read_text())
paths=Path(sys.argv[2]).read_text().splitlines()
labels=set(Path(sys.argv[3]).read_text().splitlines())
if meta["state"]!="open" or meta["base"]!="main":raise SystemExit("PR not eligible")
if any(manual(p) for p in paths):raise SystemExit("High-risk PR requires human merge")
issues=validate(meta["head"],meta["title"],paths,labels,meta["headRepo"],sys.argv[4],meta["draft"])
if issues:raise SystemExit("Blocked: "+"; ".join(issues))
PY
gh pr merge "$pr" --auto --squash --delete-branch
