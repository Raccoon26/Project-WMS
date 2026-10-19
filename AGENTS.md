# Codex instructions for Project-WMS

Use GPT-6.1 Sol Medium for DEV-00 through DEV-18. Reserve Astra for FINAL-AUDIT-01 near release; perform tests and safety reviews in EVERY DEV, not only final audit.

1. Read docs/PROJECT_SCOPE.md first, then existing requirements, architecture, status, progress, safety and GitHub workflow docs before editing. During DEV-00 create missing specifications.
2. Branch from fresh main as `dev/dev-XX-topic`; never push directly to main.
3. Work within the DEV scope; test, fix and self-review. Update `docs/dev-reports/DEV-XX.md` with tests ACTUALLY executed, coverage of all earlier requirements, risks, rollback and unresolved gaps.
4. Commit to DEV branch, push and run `bash scripts/create-dev-pr.sh DEV-XX "Topic"`. Do not claim PR created or merged unless verified.
5. Follow docs/GITHUB_WORKFLOW.md: A ordinary changes and B business changes with installed, passing main-owned safety profiles may auto-merge. Control changes require independent main-owned validation, not human approval. Missing safety suites never authorize auto-merge. Native protected mode is optional, separate from Actions mode.
6. A main merge is NOT a production deploy. NEVER auto-deploy WMS to Raspberry Pi just because CI passed.

Inventory safety: authoritative append-only movement ledger; transactional reservations and separate requested/shipped/in-transit/received counts; durable outbox and idempotency for all outbound emails/payments/shipment actions; strict preconditions on quantities; timestamps and reconciliation. An email being sent is NEVER evidence that goods shipped. Unknown delivery of an outbound email is NOT safe to retry automatically. Handle lost ACKs, timeouts, retries, concurrent actions, crashes and stale marketplace data explicitly.

No real supplier/customer records, credentials, cloud keys, OAuth tokens, API secrets or backups in this public repository. CI must run only mocks/sandboxes and never send genuine outbound warehouse messages, alter live stock, place orders or charge money. Use integer minor money units or exact decimal, not floating point.

The project currently has approximately 10 SKUs; the initial release MUST comfortably support at least 50 active SKUs across external warehouse, Amazon FBA, Rakuten RSL and future own warehouse. The number 50 is a minimum acceptance target, NOT a database, UI, API or business-rule hard cap. Model products with stable IDs/SKUs and design pagination/indexes so increasing SKU counts does not require redesign. Include seeded 50-SKU end-to-end/inventory/replenishment/load tests (with concurrent events), and report measured resource use on Raspberry Pi when available.

Transition from an email-only third-party warehouse to a self-operated warehouse using modular adapters. Operational actions must be independently auditable and alert through Telegram.

Dot is NOT currently available on the user's subscription. DEV-00–17 and first production release must work fully without Dot, Dot credentials, paid AI API, or any subscription upgrade. Treat Dot integration as a future OPTIONAL capability. DEV-18 may implement an interface/adapter boundary, gated by explicit feature flag and gracefully disabled by default; if Dot is still unavailable, do not block DEV-18, final audit or release. Defer actual Dot connection to a future optional AI-01 task after account access and integration support are confirmed. Never claim Dot has been connected without a real test.

For each DEV validate requested behavior, regression, integration, negative paths, security, docs, and status. FINAL-AUDIT-01: Astra full requirements/code review, remediate all release-blocking failures, re-test, report proof. 


## Guarded GitHub Actions merge (without branch protection)

All DEV-01–18 changes, including CI/merge/security/migrations, may auto-merge after independent main-owned verification and actual required tests. Never require owner approval labels/comments/reviews by path. New PRs are regular, not Draft. Completed existing Drafts become Ready after exact-head/latest-main CI and explicit DEV completion. Missing safety tests block as missing tests, never as missing human approval. The privileged controller executes trusted main code only; PR code executes only in a separate read-only/no-production-secret CI job. Parse bounded artifact JSON as data only. Never generate owner approval statements. See docs/GITHUB_WORKFLOW.md for baseline contracts, transition history, event compatibility and base-SHA race limitations. No direct main/force push or automatic Raspberry Pi deployment.

## Long-term commerce automation / optional Dots (R26–R31)
Read `docs/AI_OPERATIONS_ARCHITECTURE.md` and this roadmap before **every future DEV instruction**, including split DEV-XX-1/2 tasks. Ubuntu laptop x86-64 is the first server; Raspberry Pi/ARM64 remains a verified migration option. Windows browser and optional Dots are operator clients, never prerequisites, scheduler, database writers or unique stock/order/outbound controllers. Ubuntu must continue allowed order ingestion, verification/reservations, ledger posting, stock sync, warehouse instruction/fulfillment, cancellations/returns, recovery and audits with Windows off and Dots absent. Only verified WMS commands may mutate state. Add OPS-01 for multi-channel Order orchestration before DEV10/DEV14; expand DEV08/09 adapters only within documented provider permissions. Explicit risk approvals and AI operation audit; AI may not self-approve or edit ledger/DB directly. Check prior requirements and update docs/requirements traceability in each DEV; always test Windows/Dots disconnected core path for relevant changes. Preserve existing AUTO-01 main-owned checks and no-human-review PR auto-merge; business approvals remain human. No operational AI requirement or paid dependency for launch.
