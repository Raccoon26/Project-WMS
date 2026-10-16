# 모듈 계약

각 행은 공개 application port의 입력→출력, 단독 쓰기 소유 데이터, 의존성, 오류/테스트 double을 정의한다.
공통: validated DTO/UUID/version/idempotency, Result 또는 도메인 오류. command는 UnitOfWork,
외부 I/O는 port와 outbox로 분리. 다른 모듈 소유 테이블 직접 변경 금지. Query projection 읽기만 허용.
계약 테스트는 real PostgreSQL repository + fake clock/provider를 교체한다. 네트워크 timeout은 성공으로 취급하지 않는다.

| 모듈 | port 입력 → 출력 | 소유 데이터 | 의존 / 실패·테스트 방식 |
|---|---|---|---|
| Product Catalog | upsertProduct/SKU(dto,version) → IDs/version; list(query) → page | products,skus | Auth/Audit; 중복 code409, 상태 제한; repository port |
| SKU Mapping | verifyMapping(account,external,sku,evidence) → verified mapping | sku_mappings | Catalog/Integration; 모호/미검증 차단; MappingResolver fake |
| Warehouse | register(type,locations) → warehouse; resolveAdapter(id) | warehouses,locations | Auth; 위치 순환/타창고 FK 거부; WarehouseRepository |
| Inventory Ledger | post(entries,reason,source,key) → transaction/balances | transactions,entries,balances | Catalog/Warehouse/UoW; 불균형/음수 rollback; LedgerPort, concurrency DB tests |
| Reservation | reserve/release/consume(lines,key,version) → allocation | reservations | Ledger 동일 tx; 부족409/예약 소비 초과422; ReservationPort |
| Inbound | receive(evidence,qty,mapping) → receipt/ledger ref | inbounds,receipts | Ledger/Mapping; 중복/초과 hold; ReceiptPort |
| Outbound | plan/reserve/confirmShip/cancel(version,evidence) → state | outbounds,lines,shipments | Reservation/Approval/Warehouse; unknown held; OutboundPort |
| Transfer | create(source,dest,lines) → linked outbound/inbound | transfers | Inbound/Outbound; 동일 창고 잘못된 경로 차단; TransferPort |
| Procurement | propose(demand,leadTime,MOQ,cash)/approve → purchase draft | purchase_orders,lines,costs,fx | Sales/Approval; stale FX/미승인 결제 차단; MoneyPort(Decimal) |
| Reconciliation | compare(source,asOf)/resolve(evidence) → discrepancy/adjustment | reconciliation_runs/items | Ledger/Snapshot; 차이=hold, 자동 덮어쓰기 없음; ReconcilePort |
| Amazon SP-API | fetchInventory/sales(cursor) → normalized observations | sync_runs,snapshots,sales(해당 source) | HTTP/Auth secret provider; 401 refresh 1회·429 backoff·circuit; MarketplacePort mock |
| Amazon FBA Inbound | plan/confirmOptions/readShipment(request,remoteKey) → remote refs/status | integration refs/inbox | FBA API permissions; 비동기 poll/부분수령 대조; FbaInboundPort |
| Rakuten RMS | fetchSales/stock(cursor) → observations | provider별 sync/sales | RMS 권한별 HTTP; SKU/variant 차이 검증; MarketplacePort |
| RSL/BOSS | import/export/track(batchHash) → evidence/report | batch import/integration refs | 계약/API 미확인 시 CSV staging만; LogisticsPort mock |
| Email Provider | send(documentRef,actionKey)/lookup(messageRef)/fetchReplies → delivery evidence | email_deliveries,inbox | outbox/TemplateStore; lost ACK unknown, 자동 재발송 금지; EmailPort scripted fault |
| Telegram | notify(event)/decide(signed callback) → delivery/decision | notifications/channel refs | Auth/Approval; 재전송은 알림만, 위조/중복 승인 거부; NotificationPort |
| Google Drive Backup | uploadEncrypted(manifest,object)/verify → backup ref | backups,restore_runs | pg_dump/rclone/crypt; quota/token/손상 실패 보존; BackupStorePort |
| Carrier (future) | quote/createLabel/cancel/tracking(key) → refs | carrier refs/labels | DEV17 계약; 요금 승인·불명 보류; CarrierPort |
| Optional AI (future) | analyze(redacted read model) → suggestions | 제안만, core 쓰기 없음 | DEV18 disabled adapter, AI01 별도; DisabledAI returns unavailable 정상 |
| Authentication | login/session/MFA → actor/session | users,sessions,identity bindings | DEV02 Argon2id/TOTP/local IdentityProvider; 미래 OIDC 선택; deny/reauth |
| Authorization | authorize(actor,action,scope,amount,version) → decision | roles/permissions/assignments | policy versions; 기본 deny; PolicyEvaluator deterministic |
| Audit Logging | append(actor,event,digest,tx) → audit id | audit_events | UoW; 필수 감사 쓰기 실패 시 위험 command rollback; AuditSink |
| Scheduler | tick(clock,policy) → unique due jobs | scheduled_jobs | DB time/epoch; 중복 unique; Clock/SchedulerPort |
| Worker | claim/execute/complete(fence) → durable state | outbox leases/attempts | ports; lease 상실 쓰기 금지; QueuePort/fault injector |
| Outbox | enqueue(actionKey,payload,tx) → id | outbox | DB/UoW; unique hash 충돌409; OutboxRepository |
| Error Handling | classify(error,context) → safe API/log/retry policy | 오류 코드 카탈로그 | PII redaction; 예상외 오류는 held/500; ErrorClassifier |
| Monitoring | observe(component,age,outcome) → metrics/alerts | health observations | 업무지연/독립 heartbeat; 오탐 억제·알림 자체 실패 감시; HealthProbe |
| Backup & Recovery | backup/restore(epoch,manifest) → verified restore report | backup/restore records | Drive/DB/files; 복원 쓰기 격리; RestoreRunner |
| Configuration | propose/apply(validated version,approval) → version | settings,policy_versions | Secrets 외부 참조; 위험 변경 승인/버전 무효화; ConfigPort |
| Notification | route(event,severity,preferences) → delivery jobs | notifications | outbox/Telegram/email; failure 업무 rollback 금지; NotificationRouter |
| Deployment | stage/promote/revert(release,approval) → deployment evidence | 배포 manifest(외부 운영 저장소) | Compose/backup; 승인 없이 운영 재시작 금지; DeploymentRunner |

## 창고 어댑터
`WarehouseAdapter.capabilities()`, `prepareInstruction(outbound,templateVersion)`,
`submitInstruction(actionKey,documentHash)`, `lookupInstruction(remoteRef)`,
`ingestEvidence(event)`, `requestCancellation(version)`.
결과 union `confirmed{reference,evidence}`, `rejected{code}`, `unknown{attemptRef}`.
ExternalEmailWarehouseAdapter는 문서/메일 증거만 반환, 재고 출고를 직접 호출하지 않는다.
InternalWarehouseAdapter(DEV15–17)는 스캔·피킹·포장·검수 evidence를 반환하고 같은 outbound command가 원장에 반영한다.
capability가 없는 외부 창고에 API 취소/조회가 있다고 가정하지 않는다.

## 이벤트 공통 봉투
`eventId, schemaVersion, aggregateId, aggregateVersion, source, occurredAt, receivedAt,
correlationId, causationId, payloadHash`. 신뢰된 서명/계정·idempotency 검증 전 domain command 금지.
DB 내부 원자성이 필요한 경우 동기 command; 외부 연동·알림은 commit 이후 이벤트.
호출자는 source truth와 freshness를 함께 전달하고 실행자는 다시 검사한다.

## DEV02 구현 port

AuthService: bootstrap/login/verifyMfa/enroll/confirm/reauth/me/logout/changePassword/revokeSessions,
createUser/updateUser/setRoles/list. HTTP adapter만 Cookie/Origin/header를 Context로 변환한다.
`allowed(grants,permission,warehouse?,knownWarehouses)`는 프레임워크 없는 Permission 평가, 기본 deny.
`mutate(ctx,callback,permission)`는 user/session lock·최근 MFA 재인증·현재 grants·CSRF·audit transaction 경계다.
`authorize`의 사전 허가만으로 transaction 밖 업무쓰기를 허용하지 않는다. 후속 업무는 같은 UoW 안에서 재검증한다.
공통 contracts의 SystemActor는 명시 권한만 가지며 사용자 session을 상속하지 않는다. Worker는 API 앱 소스를 상대 import하지 않는다. [구현/API 계약](../AUTHENTICATION.md).

## DEV03 현재 구현

CatalogService list/get/change/history는 Permission·resolved warehouse scope·현재 session을 같은 query/쓰기 transaction에서 확인한다. metadata+command result+revision+Audit는 원자 commit이다. warehouseRoles는 기존 AuthService.mutate의 최근 MFA/CSRF/보안 잠금을 유지한다. catalogEligible은 향후 원장 업무의 필요조건만 제공하며 수량 계산/출고 실행은 없다.
[Catalog 상세 계약](../CATALOG.md). 실제 결과는 [DEV03 보고](../dev-reports/DEV-03.md)에서 확인한다.
