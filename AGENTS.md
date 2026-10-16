# Codex instructions for Project-WMS

Use GPT-6.1 Sol Medium for DEV-00 through DEV-18. Reserve Astra for FINAL-AUDIT-01 near release; perform tests and safety reviews in EVERY DEV, not only final audit.

1. Read docs/PROJECT_SCOPE.md first, then existing requirements, architecture, status, progress, safety and GitHub workflow docs before editing. During DEV-00 create missing specifications.
2. Branch from fresh main as `dev/dev-XX-topic`; never push directly to main.
3. Work within the DEV scope; test, fix and self-review. Update `docs/dev-reports/DEV-XX.md` with tests ACTUALLY executed, coverage of all earlier requirements, risks, rollback and unresolved gaps.
4. Commit to DEV branch, push and run `bash scripts/create-dev-pr.sh DEV-XX "Topic"`. Do not claim PR created or merged unless verified.
5. Routine PRs: GitHub required Quality/Policy checks plus verified branch protection; request native auto-merge only when safe. Control-plane, auth, migrations, deployment and high-risk financial changes require owner review and manual merge.
6. A main merge is NOT a production deploy. NEVER auto-deploy WMS to Raspberry Pi just because CI passed.

Inventory safety: authoritative append-only movement ledger; transactional reservations and separate requested/shipped/in-transit/received counts; durable outbox and idempotency for all outbound emails/payments/shipment actions; strict preconditions on quantities; timestamps and reconciliation. An email being sent is NEVER evidence that goods shipped. Unknown delivery of an outbound email is NOT safe to retry automatically. Handle lost ACKs, timeouts, retries, concurrent actions, crashes and stale marketplace data explicitly.

No real supplier/customer records, credentials, cloud keys, OAuth tokens, API secrets or backups in this public repository. CI must run only mocks/sandboxes and never send genuine outbound warehouse messages, alter live stock, place orders or charge money. Use integer minor money units or exact decimal, not floating point.

The project currently has approximately 10 SKUs; the initial release MUST comfortably support at least 50 active SKUs across external warehouse, Amazon FBA, Rakuten RSL and future own warehouse. The number 50 is a minimum acceptance target, NOT a database, UI, API or business-rule hard cap. Model products with stable IDs/SKUs and design pagination/indexes so increasing SKU counts does not require redesign. Include seeded 50-SKU end-to-end/inventory/replenishment/load tests (with concurrent events), and report measured resource use on Raspberry Pi when available.

Transition from an email-only third-party warehouse to a self-operated warehouse using modular adapters. Operational actions must be independently auditable and alert through Telegram.

Dot is NOT currently available on the user's subscription. DEV-00–17 and first production release must work fully without Dot, Dot credentials, paid AI API, or any subscription upgrade. Treat Dot integration as a future OPTIONAL capability. DEV-18 may implement an interface/adapter boundary, gated by explicit feature flag and gracefully disabled by default; if Dot is still unavailable, do not block DEV-18, final audit or release. Defer actual Dot connection to a future optional AI-01 task after account access and integration support are confirmed. Never claim Dot has been connected without a real test.

For each DEV validate requested behavior, regression, integration, negative paths, security, docs, and status. FINAL-AUDIT-01: Astra full requirements/code review, remediate all release-blocking failures, re-test, report proof. 


## Guarded GitHub Actions merge (without branch protection)

Routine DEV PRs with safe-path-only diffs can become ready and be merged automatically by the trusted `workflow_run` workflow after exact-current-head successful WMS CI. Do NOT use the legacy branch-protection helper in no-protection mode. Manual-risk PRs, unknown code, security/inventory/email/payment/deployment/configuration changes stay draft until owner reviews and explicitly merges. Never merge PRs from forks or stale CI. Never allow the privileged workflow to checkout PR head or use production secrets. GitHub merge is separate from Raspberry Pi deployment. Lack of branch protection increases risk of direct-main bypass: document clearly, never claim equivalence to protected main.
