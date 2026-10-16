#!/usr/bin/env bash
set -euo pipefail
pr="${1:?Use: bash scripts/enable-safe-auto-merge.sh PR_NUMBER}"
[[ "$pr" =~ ^[0-9]+$ ]] || exit 2
cd "$(git rev-parse --show-toplevel)"
repo="$(gh repo view --json nameWithOwner --jq .nameWithOwner)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
# All read failures exit before any merge operation; no admin/bypass switches.
gh api "repos/$repo" > "$tmp/repo.json"
gh api "repos/$repo/branches/main/protection" > "$tmp/protection.json"
gh api "repos/$repo/pulls/$pr" > "$tmp/pr.json"
gh api "repos/$repo/pulls/$pr/files?per_page=100" --paginate | python3 scripts/slurp_json.py > "$tmp/files.json"
sha="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["head"]["sha"])' "$tmp/pr.json")"
gh api "repos/$repo/commits/$sha/check-runs?per_page=100&filter=latest" --paginate | python3 scripts/slurp_json.py > "$tmp/checks.json"
gh api "repos/$repo/pulls/$pr" > "$tmp/pr_after.json"
verified_sha="$(python3 scripts/merge_gate.py "$tmp")"
gh pr merge "$pr" --repo "$repo" --auto --squash --match-head-commit "$verified_sha"
