# DEV-04 Inventory Ledger — 구현 계약

상태: DEV04 개발·합성 검증 결과를 보고서에 기록한다. 실제 운영/외부 전송 승인 아님. PostgreSQL17 단일 DB, 기존 Catalog/Auth UUID/FK 재사용.

## 수량과 계정

API quantity/version은 정규 10진 문자열, 수량 1..9223372036854775807, 관측값은0 허용. 선행0/부호/지수/소수/공백 거부. 내부 BigInt, 합계 PG numeric 사용; Number 변환 없음.
Good/Damaged/Quarantine은 Warehouse 필수, Location은 같은 Warehouse FK. Transit은 Shipment FK와 출발 Warehouse를 가진 별도 계정. Boundary는 Warehouse/Location/Shipment 없음, 소유 집계 제외.
`(sku,warehouse,location,kind,shipment)` UNIQUE NULLS NOT DISTINCT, owner=business. Physical=Good+Damaged+Quarantine; Available=Good−Reserved; 총소유=Physical+Transit. Requested/Shipped/Received는 진행 누계이므로 소유량에 합산 금지.

## DB Commit 계약

`inventory_transactions` → `inventory_entries` INSERT가 잔액 Projection을 원자적으로 갱신한다. Entries/Transactions/Accounts/Evidence UPDATE/DELETE Trigger 거부. 거래 생성 트랜잭션 이외의 후속 Entry 삽입도 origin_xid로 차단한다. 원장 최초 opening 계정은 inventory_opening_claims의 PK/unique로 재등록을 Commit에서 차단하고 reversal도 SKU/Account별 정확한 반대합을 DB에서 확인한다. Entry recorded_at은 JS Date가 아니라 원거래 DB 시각을 SQL로 직접 복사한다.
Deferred Constraint Trigger는 거래별 SKU 합0·최소2 Entry, Balance=Entry합, Reserved=Reservation 미해소합, 양수계정 음수금지/Good≥Reserved를 Commit 시 검증한다. 잔액 직접 조작도 원장과 다르면 Commit 실패. 개발 superuser가 trigger를 제거하는 공격까지 방지했다고 주장하지 않는다. 운영 권한분리는 DEV12.
Reservations는 Good만, 같은 outbound line의 SKU/출발 창고와 일치. 소비·해제는 단조 증가, consumed+released≤quantity. 출고 누계=Shipment합=Reservation소비합, 수령 누계=accepted Receipt합을 DB Commit에서 대조한다. Hold Receipt는 정상 잔액/수령누계에 반영하지 않는다.

## Posting Port / 잠금 / 재시도

`InventoryService.command`가 Schema→완전 MFA Session/User→CSRF→현재 Permission·양끝 Warehouse Scope→버전·활성 상태→멱등→증거→Posting→Audit/Outbox/결과 Commit을 수행한다.
`postInventoryTransaction`은 이 UoW 내부의 Posting Port이며 독립 무인증 API가 아니다. 외부 호출은 전혀 하지 않는다.
기존 전역 metadata advisory74002를 재고에 사용하지 않는다. Session→User(권한 회수와 직렬화)→업무 Aggregate→Warehouse/SKU/Product 공유잠금→계정 생성→Account UUID 정렬 FOR UPDATE→Reservation→Audit74003 순서. 계정 생성 경쟁은 unique/ON CONFLICT DO NOTHING 후 재조회. 같은 사용자 요청은 보안 user lock으로 직렬화되지만 서로 다른 actor/계정은 독립 실행 가능. Audit 체인 append만 짧게 직렬화된다.
40P01/40001은 전체 DB 트랜잭션 Rollback 후 동일 command 최대2회 재시도(최대3회 실행). Connection loss/불명 결과는 자동 재실행하지 않고 client가 같은 key로 조회. 외부 부작용 재시도 엔진은 DEV06 이후 별도.

## 멱등·증거·승인 경계

기존 command_results의 actor/key namespace를 유지하고 operation=`inventory.*`, payload hash에는 operation/aggregate/body 포함. actor/key를 먼저 잠그고 현재 권한 검증 후 결과 조회한다. 동일 key/hash 결과 재사용; operation/payload 변경409. 범위는 payload의 실제 Warehouse와 Aggregate에 포함되므로 같은 key를 다른 범위에서 재사용해도409. 보존은 원업무와 같은7년 목표, tombstone 임의 삭제 금지.
증거 `(source,scope,operation,event)` 및 `(source,scope,operation,reference)` unique. 다른key로 같은 물리사건 재입력도409. Source 문자열이나 client verified=true를 신뢰하지 않는다. 추가필드 금지.
Synthetic은 isolated wms_test schema 또는 **명시적** `WMS_SYNTHETIC_INVENTORY=true`인 기존 loopback 개발 API에서만 Posting 허용. 기본false; 운영 모드는 기존대로 차단. 실제 Provider 검증 구현 없음. local_manual/external은 증거만 기록하고 held. 위험 조정도 Reconciliation으로 held, DEV07 Approval Port 완료 전 무조건 확정하지 않는다.

## 업무 상태

출고/이동 계획 생성 시 Outbound+Lines+Inbound+Lines, Transfer는 양쪽 FK 추가. Draft 내용수정은 기존SKU line 수량만 가능, version CAS. Reserve는 draft에서 Good을 예약. 출고 전 draft/reserved만 재고를 해제하여 cancel/release한다. 부분출고/sent/ack/picking/unknown의 cancel은 cancellation_requested만 기록하고 예약·원장은 유지한다. release는 차단한다. 외부 취소 확인 Port는 DEV06/07까지 미구현이며 TTL만으로 해제하지 않는다.
Shipment별 독립 Transit. 부분 출발은 Good→Transit 및 예약소비. 수령은 명시된 Shipment line의 Transit→Good/Damaged/Quarantine. 수령 version은 Inbound version(Outbound version과 다름). 초과수령은 Receipt held, 재고0변화. 수령이 출발보다 먼저 오거나 다른Shipment/SKU이면 거부. 문서/발송/접수/승인 상태는 추측 생성하지 않는다.
100요청/95출발/93수령: 출발Good5/Reserved5/Available0, Transit2, 목적지Good93, 총소유100. 미출고5/미수령2 자동손실 처리 금지.
정정은 opening/reclassification의 정확한 반대 Entry를 추가하고 reverses unique. 현재 잔액/예약으로 불가능하면 거부한다. Shipment/Receipt의 반전은 연결된 업무 정합성과 후속 승인 구현 전 차단(반품 엔진 아님).
실사 Run은 as_of 이전 원장합과 observed를 비교, 차이/오래된cutoff는held. 원장 덮어쓰기 없음; matching도 synthetic 이중 guard와 freshness≤5분일 때만 matched. 수동/외부 관측은 수량이 같아도 held. 관측 신뢰와 실제 외부검증은 별도.

## API

Base `/api/v1`, 모든 읽기 no-store/완전 MFA/현재 Scope, 변경은 추가 Origin/CSRF/Idempotency-Key. Strict UUID/입력길이/추가필드 차단.

| Method | Path | 동작 |
|---|---|---|
| GET | inventory, inventory/balances, inventory/transactions | 실제 계정 잔액/원장 목록; Good 외 Available=0 |
| GET | inventory/summary | SKU·Warehouse별 Good/Damaged/Quarantine/Physical/Reserved/Available/Transit/Owned, SQL bigint/numeric 합계 |
| GET | outbounds/:id/shipments, inbounds/:id/receipts | Source/Trust 포함 증거 line 전체 cursor 목록 |
| GET | inventory/transactions/:id | Entry와 실제 증거 상세 |
| POST | inventory/openings | 증거 기반 opening 또는held |
| POST | inventory/reclassifications | Good→Damaged/Quarantine, Quarantine→Good, Damaged→Quarantine |
| POST | inventory/reversals | 현재 안전한 원거래 반대 Entry |
| POST | inventory/adjustments, reconciliations | 관측 차이 기록; 자동조정 없음 |
| GET | reservations, outbounds, inbounds, transfers, reconciliations | SQL 범위 제한 cursor 목록 및 /:id 상세 |
| POST | outbounds, transfers | 다중 SKU(1..100 line/요청) 계획 생성; SKU 수 상한 아님 |
| PATCH | outbounds/:id | draft 기존 line 수량 CAS |
| POST | outbounds/:id/reserve, /release, /cancel | 예약·출고 전 해제/취소 |
| POST | outbounds/:id/shipments | 단일SKU 증거별 부분 Shipment |
| POST | inbounds/:id/receipts | Shipment line별 부분 수령/초과held |

계획 생성으로 Inbound가 함께 생성되어 독립 무출처 입고성공 API를 만들지 않았다. Supplier입고는 향후 Procurement와 별도 참조 계약 필요.
조회는 기본25/최대100, SQL UUID keyset+정해진 ASC순서. cursor HMAC은 actor/grants/query/endpoint/parent에 결속. SKU/q/Warehouse/state 필터 SQL 적용. UUID순서 live pagination은 snapshot export가 아니며 전체 재현성은 별도 export 단계. 계획 상세 line≤100. 상세의 Shipment 처음100개 외 전체 증거는 parent-bound cursor의 `/outbounds/:id/shipments`, `/inbounds/:id/receipts`로 조회한다. Transfer 상세도 Outbound line/증거를 연결한다.
권한 inventory.read / inventory.adjust, outbound.read / outbound.create 재사용. Opening/분류/반전/위험조정은 최근재인증 필요. 실사 기록도 inventory.adjust가 필요하므로 Viewer는 읽기만 가능하다. 이동·출고·수령은 두 창고 모두 권한 필요. 전역읽기와 scoped읽기를 SQL에서 분리하며 원장상세에 다른창고가 포함되면 전체row 비공개.

## 내부 Outbox / Worker / 다음 DEV

업무·원장·잔액·예약·증거·감사·command result·outbox가 같은 Transaction이다. Outbox는 topic/payload/hash/aggregate version/correlation/causation/status를 보존하며 소비자 없음. Worker는 기존 readonly 그대로. 외부 Exactly-Once 보장 주장을 하지 않는다.
DEV05는 실제 outbounds/lines/version과 미출고량으로 문서를 생성하고 재고를 차감하지 않는다. DEV06은 발송증거≠출고, unknown hold/예약 유지. DEV07은 위험 승인과 취소확인 Port를 설치. DEV08/09는 검증된 Provider Evidence Port를 설치한 후에만 validated trust 사용. 운영 Deploy/백업/복원은 DEV12/13.


## Migration / 실제 FK와 부가 제약

기존0000–0004 SQL/snapshot/hash는 보존했다. Forward0005_mean_pandemic은 Drizzle의20개 중19개 신규 table/일반FK/타입과 원장 custom 제약,0006은 업무 누계 Commit 검사,0007_fat_maestro는 opening_claims 및 Projection 마지막 version 검사,0008은 반대거래/예약상태,0009는 역사 삭제/상태 제약,0010은 증거1:1/관계 index,0011은 SKU·Transaction seek index다. Drizzle schema/snapshot은 기본 table/column/FK를 소유하고 custom constraint/trigger/index는 SQL을 함께 검토한다. 이미 적용한 신규 SQL도 덮어쓰지 않고 forward 보강을 추가했다.

추가 테이블: service_actors, inventory_accounts/transactions/entries/balances/evidence/opening_claims, reservations, outbounds/outbound_lines, shipments/shipment_lines, inbounds/inbound_lines, receipts/receipt_lines, transfers, reconciliation_runs/items, outbox. 모든 업무 ID는 UUID/FK, 수량/원장/예약/버전 bigint, UTC timestamptz, hash는SHA256. Actor는 user/service 중 정확히1개. System actor는 DB 계약만 있고 이번 Worker에 쓰기 권한을 부여하지 않는다.

`source/operation/warehouse/event`와 reference unique는 실제 사건 중복을 차단하고 transaction.evidence_id도unique다. Entry account/SKU composite FK, Location/Warehouse composite FK, Transit의 Shipment 및 실제 출발 Warehouse 확인, opening 계정 PK, reversal exact negative aggregate를 DB에서 검사한다. Reservation/View의 직접 수량 변경은 Commit에서 원장합·예약합과 대조한다.

테스트 importer는 원본60/120/1000 Fixture의 Good/Reserved/expected_available/in_transit를 SKU·3창고별 실제값과 대조한다. 0은 명시적 계정/합성 실사 관측으로 표현하며 0 Entry를 삽입하지 않는다. 첫 SKU에 손상2/격리3의 명시적인 합성 보충 lot만 추가하여 모든 Account Kind를 검증하고 원본 Good/Reserved 기대값은 유지한다. 비활성 Fixture의 기존 보유량은 격리된 역사 Seed이고 일반 API의 신규 업무 허용을 뜻하지 않는다. 기본 개발 시작에 importer를 연결하지 않는다.

## 재현 가능한 대량 이력 실험

```bash
pnpm exec tsx --conditions=source tests/performance/inventory-history.ts --entries 1000000
```

엄격한 test DB URL/고유 schema만 허용하고 정리 시 자신의 schema만 삭제한다. 1,000거래/2,000 Entry의 제한 배치마다 원장·Projection·합성 증거·감사·내부 이벤트·command result를 함께 Commit한다. 제약을 끄지 않는다. 상시 CI와 별도이며 반복해서 모든 DEV에 실행하지 않는다.
실제100만 추가Entry 결과와 두 쿼리의 EXPLAIN ANALYZE/BUFFERS는 [원자료](performance/DEV-04-history-1000000.json). API는 실제 실행한 SQL을 client Proxy로 관측만 한 후 동일 SQL/parameter를 EXPLAIN했다. Mock 응답/가짜 계획이 아니다. Cloud Linux 한 SKU의 warm 조회20회/동시1, Fastify Inject(네트워크 지연 제외) 실험이며 독립 API 서버/지속부하/Pi 성능 주장이 아니다.
