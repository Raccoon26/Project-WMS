#!/usr/bin/env bash
set -euo pipefail
branch="${1:?Use: bash scripts/new-dev-branch.sh dev/dev-01-foundation}"
[[ "$branch" =~ ^dev/dev-(0[0-9]|1[0-8])-[a-z0-9][a-z0-9-]*$ ]] || exit 2
[[ -z "$(git status --porcelain)" ]] || { echo "Dirty working tree";exit 1; }
git fetch origin main
git switch main
git pull --ff-only origin main
git switch -c "$branch"
