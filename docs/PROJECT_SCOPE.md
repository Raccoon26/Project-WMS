# DEV-00 scope amendment — capacity and optional Dot

Updated: 2026-10-16. This document supersedes old 10–30 SKU and mandatory DEV-18 Dot references.

## Product and capacity
- Current operational catalog: approximately 10 SKUs.
- **Acceptance target:** at least 50 active SKUs at first release, not a limit in the data model.
- Support multiple warehouses, marketplace SKU mappings, out-of-stock and inactive items without confusing unique catalog SKUs with stock locations.
- Design all queries for pagination/filtering and indexed SKU identifiers. No fixed-size arrays, hard-coded 10/30/50 bounds, 50-specific business rules, or freeform unsafe quantity calculations.
- Performance evidence: generate 50 realistic SKUs with FBA, RSL, external and optionally own-warehouse stock; verify inventory reservations, replenishment, email drafts, filtering, and large histories; test concurrent event handling and idempotent retries. Document repeatable commands and actual timings. Raspberry Pi measurements are required only when hardware exists; do not fabricate them.
- Capabilities beyond 50 should scale without code redesign, while avoiding enterprise architecture overkill.

## Dot deferred, no subscription assumed
- User does not currently have Dot access and has not upgraded the necessary plan. No Dot credentials, paid API, or mandatory Cloud Browser capability may be assumed.
- Entire WMS business workflow (inventory, outbound email, marketplace synchronizations, Telegram, monitoring, backup, deployment) must operate without Dot.
- DEV-18: reliability/integration finalization and optional AI integration interface *only*, with feature flag default OFF; no release gate tied to Dot availability.
- Later AI-01 (only when user opts in and supported capabilities are independently verified): configure and test Dot connection and limited analytic actions; no unrestricted direct shipping/payment execution.
- Prompts/docs/API stubs should label future integrations explicitly as `planned`, `deferred`, or `optional`, never claim active.
- No extra monthly Dot or OpenAI API cost before user intentionally enables integrations.

## Scope acceptance
DEV-00 creates REQUIREMENTS.md, ARCHITECTURE.md, DATA_MODEL.md, DEV_PROGRESS.md and test requirements consistent with this amendment. Each later DEV confirms coverage of these requirements, and release readiness requires 50-SKU tests plus financial/inventory safety gates.
