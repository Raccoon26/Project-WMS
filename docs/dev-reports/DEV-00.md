# DEV-00 — GitHub bootstrap (partial)

Status: IN PROGRESS. Only repository workflow foundation is proposed. Full DEV-00 product specifications, data model and project status documents remain to be implemented.

Included: AGENTS.md, automated PR tooling, read-only trusted policy CI, quality CI, safety documentation and preliminary repo readme.

Initial PR is draft by design; owner must manually review/merge this trust-boundary change. Main branch protection and repo auto-merge must then be configured in GitHub Settings. Current software does NOT include real inventory handling or marketplace connections.

Testing requirements after checkout:
```bash
PYTHONPATH=scripts python3 -m unittest -v test_pr_policy
for f in scripts/*.sh; do bash -n "$f"; done
```

Do not claim remote tests succeeded before workflow runs. No real deliveries, payments or stock actions were performed.

## Scope amendment
- User currently has about 10 SKUs; initial WMS must support at least 50, without a hard-coded SKU cap.
- Dot subscription is not available now. Dot implementation is postponed to optional AI-01; DEV-18 must not depend on access to Dot.
- Source of truth: `docs/PROJECT_SCOPE.md` and `AGENTS.md`. Full requirements and executable capacity tests belong to DEV-00 continuation and subsequent implementation stages.
