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
