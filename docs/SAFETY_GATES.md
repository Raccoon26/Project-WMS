# Safety acceptance gates for monetary and inventory operations

Mandatory after DEV-04 inventory engine:
1. Every stock movement has unique durable identity, actor, reason and timestamp; reconciliation preserves historical record.
2. Atomic reservations never make available inventory negative under concurrent requests.
3. Duplicate emails, retries, double clicks, Telegram callbacks and webhook events cannot generate duplicate stock changes or shipment orders.
4. State distinction: requested != warehouse acknowledged != shipped != in-transit != marketplace received. Never auto-complete from email send success.
5. Unknown email outcome: pause and reconcile manually rather than blindly resend.
6. Reject stale/unavailable marketplace inventory, mismatched SKU, conflicting requested vs actual quantities.
7. Stock corrections and money calculations use exact arithmetic and audited approvals.
8. Auth, webhook signatures, approval expiry/one-time nonce, least privilege and secret isolation.
9. Fault injection: DB crash, power loss, disk full, network timeout, 429/5xx, provider ACK lost, API token expiry, duplicate/concurrent events.
10. Backups: encrypted off-device backup, restore drills, external heartbeat for Pi outage.
11. CI tests never touch actual marketplaces, shipping providers, real warehouse inboxes or payments.

High-risk diff (CI/security workflows, auth, migrations, release policy, live money moving behavior) must receive explicit owner review. Auto-merge never equals production approval.
