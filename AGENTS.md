# Codex instructions for Project-WMS

Use GPT-6.1 Sol Medium for DEV-00 through DEV-18. Reserve Astra for FINAL-AUDIT-01 near release; perform tests and safety reviews in EVERY DEV, not only final audit.

1. Read existing requirements, architecture, status, progress, safety and GitHub workflow docs before editing. During DEV-00 create missing specifications.
2. Branch from fresh main as `dev/dev-XX-topic`; never push directly to main.
3. Work within the DEV scope; test, fix and self-review. Update `docs/dev-reports/DEV-XX.md` with tests ACTUALLY executed, coverage of all earlier requirements, risks, rollback and unresolved gaps.
4. Commit to DEV branch, push and run `bash scripts/create-dev-pr.sh DEV-XX "Topic"`. Do not claim PR created or merged unless verified.
5. Routine PRs: GitHub required Quality/Policy checks plus verified branch protection; request native auto-merge only when safe. Control-plane, auth, migrations, deployment and high-risk financial changes require owner review and manual merge.
6. A main merge is NOT a production deploy. NEVER auto-deploy WMS to Raspberry Pi just because CI passed.

Inventory safety: authoritative append-only movement ledger; transactional reservations and separate requested/shipped/in-transit/received counts; durable outbox and idempotency for all outbound emails/payments/shipment actions; strict preconditions on quantities; timestamps and reconciliation. An email being sent is NEVER evidence that goods shipped. Unknown delivery of an outbound email is NOT safe to retry automatically. Handle lost ACKs, timeouts, retries, concurrent actions, crashes and stale marketplace data explicitly.

No real supplier/customer records, credentials, cloud keys, OAuth tokens, API secrets or backups in this public repository. CI must run only mocks/sandboxes and never send genuine outbound warehouse messages, alter live stock, place orders or charge money. Use integer minor money units or exact decimal, not floating point.

The real project has at most 30 SKUs today and will transition from an email-only third-party warehouse to a self-operated warehouse. Design modular adapters; Dot is optional and cannot be a mandatory control plane. Operational actions must be independently auditable and alert through Telegram.

For each DEV validate requested behavior, regression, integration, negative paths, security, docs, and status. FINAL-AUDIT-01: Astra full requirements/code review, remediate all release-blocking failures, re-test, report proof. 
