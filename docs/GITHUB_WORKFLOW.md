# GitHub branch, automatic PR and guarded merge

Repository: https://github.com/Raccoon26/Project-WMS

## Bootstrap (this PR)
The inaugural CI/policy files alter the repository's trust boundary. Bootstrap PR is **draft** and REQUIRES manual owner merge. An action cannot certify itself before its trusted workflow exists on main.

## One-time owner GitHub settings (GitHub public repository)
1. Settings → General → Pull Requests: enable squash merges and **Allow auto-merge**.
2. Settings → Branches (or Rules → Rulesets) → protect `main`. Require PR before merging, require `WMS Quality Gate` and `WMS Policy Gate` checks, and require branches up to date. Prevent force pushes, deletion and any bypass, including admin where possible.
3. The check names are available to select after workflows have run. Do not manually invent success statuses. Ensure both checks are REQUIRED and branch protection is enforceable.
4. Normal DEV PRs may have zero required human approvals IF both CI gates are enforced; controls/security migrations remain manually reviewed.

## Every DEV (after bootstrap)
1. `bash scripts/new-dev-branch.sh dev/dev-01-project-foundation`
2. Implement, independently test, document `docs/dev-reports/DEV-01.md`.
3. Review changes; `git add` explicit files, then `bash scripts/create-dev-pr.sh DEV-01 "Project foundation"`.
4. That script pushes the branch, creates a PR and (only for safe paths on confirmed protected repos) requests GitHub-native `--auto --squash` merge. Failed CI, conflicts, draft PRs and control/security changes do not auto-merge.
5. Record actual PR URL and CI status. A PR is not merged until GitHub confirms.

## Boundary and deployment
- PR Policy workflow uses trusted main source on `pull_request_target` with READ permissions, never checks out PR code.
- Unprivileged PR Quality workflow runs the head commit with contents:read, no production credentials.
- Main merge does not deploy to Raspberry Pi. Stage before production; manual approval and tested rollback.
- CI detects errors but cannot prove absence of defects. High-risk operations are fail-closed.
