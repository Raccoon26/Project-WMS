# 데이터 모델 / DEV04 구현 계약

이 문서는 PostgreSQL17의 전체 계약과 단계별 실제 구현을 구분한다. DEV01–03 schema는 기존0000–0004이며 DEV04는 forward0005–0011와 DB Commit 제약을 추가한다.
공통 PK `id uuid`, timestamp `timestamptz NOT NULL DEFAULT now()` UTC; 모든 FK 기본 RESTRICT,
업무 row hard-delete 금지. 사용자 비활성/가명화는 법적 보존 규칙에 맞춰 별도 처리.
수량 `bigint`(개수 정수, 음수 제약은 계정별), money `numeric(20,0)` 최소 화폐단위,
단가/환율 `numeric(24,8)`. JS Number로 bigint/금액 round-trip 금지. enum은 DB CHECK와 앱 union을 함께 관리.

## 카탈로그·권한
| 테이블 | 주요 컬럼/관계/제약 |
|---|---|
| users | id PK, identity_subject text UNIQUE, status, session_epoch int, locale |
| roles / permissions / user_roles / role_permissions | ID PK; code UNIQUE; 연결 FK/복합 UNIQUE; privilege escalation 감사 |
| sessions | id PK, user_id FK, token_hash UNIQUE, expires_at, revoked_at; 원문 token 미저장 |
| products | id PK, name_ja text, status active/inactive/discontinued, version int>0 |
| skus | id PK, product_id FK, code text UNIQUE(normalized), status, barcode nullable UNIQUE, version; 수량 상한 없음 |
| integration_accounts | id PK, provider, account_ref(비밀 아님), enabled, config_version; secret는 외부 vault 참조만 |
| sku_mappings | id PK, sku_id FK, account_id FK, marketplace, external_code, valid_from/to; UNIQUE(account_id,marketplace,external_code) 활성 partial index; 검증 승인 시만 사용 |
| warehouses | id PK, code UNIQUE, type external_email/internal/fba/rsl, status, adapter_config_ref |
| locations | id PK, warehouse_id FK, parent_id FK nullable, code; UNIQUE(warehouse_id,code); 복합 FK로 parent도 같은 창고; 순환 차단 |

## 원장과 잔액
소유 재고는 good/damaged/quarantine/on-order가 아니라 **실물 위치 계정**으로 기록한다.
`inventory_accounts(id,sku_id,warehouse_id nullable,location_id nullable,kind good/damaged/quarantine/transit/external_boundary,owner)`.
SKU FK 필수. good/damaged/quarantine은 warehouse 필수. transit은 shipment별 account; external_boundary는 소유 외부 상대 계정.
계정의 `(sku,warehouse,location,kind,shipment)`은 `UNIQUE NULLS NOT DISTINCT`로 중복 차단;
location과 warehouse 복합 FK 및 transit shipment FK를 강제한다. boundary는 시스템용·보유 집계 제외.

| 테이블 | 주요 컬럼/제약 |
|---|---|
| inventory_transactions | id PK, movement_type, reason NOT NULL, reference_type/id, actor_id FK 또는 system_actor, source_system, source_event_id, idempotency_key (actor/key command_results namespace), payload_hash, reverses_id FK nullable, related_transaction_id FK nullable, occurred_at, recorded_at; UNIQUE(source_system,source_event_id) 해당 시 |
| inventory_entries | id(Movement ID) PK, transaction_id FK, sku_id FK, account_id FK, quantity bigint !=0, line_no int; UNIQUE(transaction_id,line_no); account SKU와 복합 FK 일치 |
| inventory_balances | account_id PK/FK, quantity bigint, reserved bigint>=0, version bigint; good 계정 quantity>=reserved>=0, damaged/quarantine/transit quantity>=0, boundary는 음수 허용/reserved=0 |
| reservations | id PK, outbound_line_id FK, account_id FK(good), quantity>0, consumed>=0, released>=0, CHECK(consumed+released<=quantity), expires_at, version; UNIQUE(outbound_line_id,account_id); 미해소량이 reserved와 일치 |
| reconciliation_runs / reconciliation_items | run id PK, source/as_of, expected/observed/difference bigint, sku/account FK, evidence_ref, resolution_transaction FK, status; 불일치=자동 조정 아님 |

한 transaction 내 SKU별 entries 합=0. 입고 boundary(-q)→good(+q), 출고 good(-q)→transit(+q),
수령 transit(-q)→destination.good(+q), 손상 good(-q)→damaged(+q), 외부 판매 good(-q)→boundary(+q).
합계는 CHECK 하나로 못 검증하므로 **deferred constraint trigger**가 commit 시 transaction/SKU별 균형을 확인.
DB role은 원장 UPDATE/DELETE 금지, 승인된 posting 함수/트랜잭션 port만 INSERT 허용; 원장 row trigger도 변경 거부.
posting에서 계정 잔액 row를 UUID 정렬 순서로 `FOR UPDATE`, ledger+balance+reservation+audit+outbox 한 트랜잭션.
새 계정 생성은 unique upsert 후 lock; read-check-write를 lock 없이 하지 않는다. 격리 READ COMMITTED+명시 lock,
필요한 집계 계획은 SERIALIZABLE 재시도(네트워크 부작용 없음). deadlock/serialization은 같은 command key로 제한 재시도.
잔액 재구성은 원장 sum과 미해소 예약 합으로 별도 테이블 생성→차이 검토→쓰기 중지 후 교체. 원장을 고치지 않는다.
정정은 원거래 참조 반대 entries+정확한 새 거래; 이미 소비한 재고 취소로 음수 생성 금지, 격리 조정 승인.

### 상태와 수량의 포함 관계
- Physical = 각 소유 창고 good+damaged+quarantine. 운송 중은 해당 창고 Physical에서 제외.
- Reserved = good의 일부로서 미해소 예약 합. Available = good−Reserved. damaged/quarantine은 가용 아님.
- Requested/Acknowledged/Picked는 출고 진행 상태 및 누적 증거 수량이며 **독립 재고 자산이 아니다**.
  Picked는 good 안에서 가용 제외 예약을 유지(자체 창고 bin 이동은 같은 창고 계정 이동).
- Shipped는 누적 실제 출발 증거. In Transit은 잔존 transit 계정. Received는 누적 수령 증거.
- Damaged는 실물의 부분집합; Adjusted는 거래 유형(현 재고 상태/별도 합산량 아님).
- 총 소유 자산 = 창고 Physical + transit(주문 미도착/외부판매/boundary 제외).
  요청+예약+출고누적+수령누적을 더하지 않는다. marketplace source snapshot과 내부 원장도 이중 합산 금지.

## 업무·연동·플랫폼
| 테이블 | 주요 컬럼/PK·FK·Unique·CHECK |
|---|---|
| outbounds | id PK, business_ref UNIQUE, source/destination_warehouse_id FK(상이), state, version, policy_version, approved_payload_hash, approval_id FK nullable |
| outbound_lines | id PK, outbound_id FK, sku_id FK, requested_qty>0, cancelled_qty>=0; UNIQUE(outbound_id,sku_id); 출고 누적+취소<=요청량 |
| shipments / shipment_lines | id PK, outbound_id FK, tracking_ref, evidence_ref UNIQUE(provider,evidence_id); line FK, shipped_qty>0; 부분 발송 여러 건 가능 |
| inbounds / inbound_lines | id PK, destination FK, source_shipment FK nullable, expected_qty, received_qty, damaged_qty; received 이벤트를 증거별 합산, 초과수령은 hold·대조 |
| receipts / receipt_lines | id PK, provider/event UNIQUE, inbound FK, shipment_line FK, qty>0, condition, evidence; 중복 unique; 수령<=미수령 transit 검증 |
| transfers | id PK, outbound_id UNIQUE FK, inbound_id UNIQUE FK; 양 끝은 같은 이동 참조로 연결 |
| purchase_orders / purchase_lines | id PK, supplier_ref(실자료 외부), state/version/currency, sku FK, quantity>0, unit_price numeric(24,8), tax_rule, approval FK |
| costs / fx_rates | id PK, order FK, amount_minor numeric(20,0), currency char(3), rate numeric(24,8)>0, quoted_at, source, rounding_rule; 비용 version/증거·감사 |
| sales_events | id PK, account FK, external_sale_id, line_id, sku_mapping FK, qty, revenue_minor, fee_minor, currency, occurred_at; UNIQUE(account_id,external_sale_id,line_id,event_type); 취소/환불 반대 이벤트 |
| inventory_snapshots | id PK, mapping FK, warehouse FK, observed_at, fetched_at, quantity>=0, trusted bool, sync_run FK, source_revision; 관측값이며 직접 원장 덮어쓰기 금지 |
| sync_runs | id PK, account FK, started/finished_at, cursor, status, last_success_at, error_code; 실패 시 마지막 성공시각 갱신 금지 |
| documents | id PK, outbound FK, template_id/version, object_ref, sha256, content_version, status sample/approved; 템플릿 변경=새 문서 |
| email_deliveries | id PK, outbound FK, document FK, action_key UNIQUE, provider_message_id nullable UNIQUE, payload_hash, state pending/sending/sent/unknown/failed/acknowledged, attempt, evidence_ref |
| inbox_events | id PK, provider, external_event_id, payload_hash, received_at, processed_at, status; UNIQUE(provider,external_event_id); 불일치 동일 ID는 격리 |
| approvals | id PK, target_type/id, target_version, payload_hash, policy_version, requester FK, approver FK nullable, decision, expires_at, nonce_hash UNIQUE, consumed_at; 역할/한도/내용 변경 시 폐기 |
| command_results | key PK, actor/scope, payload_hash, result_ref/status; key는 actor/scope namespace, 같은 key 다른 payload=409 |
| outbox | id PK, action_key UNIQUE, topic, aggregate_id/version, payload_ref/hash, status, lease_owner/token, lease_until, next_attempt_at, attempt, restore_epoch; unknown은 재claim 금지 |
| scheduled_jobs | id PK, type/scope/scheduled_for/policy_version UNIQUE, state, lease_token, restore_epoch |
| audit_events | id PK, actor/type, action, target_ref/version, reason, request_id, before/after_digest, occurred_at; append-only, PII redacted |
| notifications | id PK, event FK, channel, dedupe_key UNIQUE, severity, status; 업무 상태와 독립 재시도 |
| backups / restore_runs | id PK, manifest_hash, encrypted_object_ref, schema/app_version, completed_at, restore_verified_at, status; 키는 미저장 |
| system_settings / policy_versions | key/version PK, nonsecret JSON validated, effective_at, actor; 위험 변경 승인, 이전 version 불변 |

### 인덱스/보존
FK 검색 인덱스는 별도 생성. balances(account), sku(code), mappings(account,external_code),
entries(sku_id,recorded_at,id), entries(account_id,recorded_at,id), outbounds(state,created_at,id),
outbox(status,next_attempt_at) partial pending, inbox(status,received_at), sales(sku,occurred_at), audit(target_ref,occurred_at,id).
entries의 recorded_at은 transaction에서 복제한 불변 필드로 정의하고 trigger 일치 검사.
이력은 커서·인덱스·스트리밍; 실제 EXPLAIN/50 SKU+100만 이동 실험은 DEV04/14.
원장/금전/승인 감사는 운영 보존 목표7년(법규/계약 확인 전 삭제 금지), 운영로그30일,
민감 webhook 원문7일 암호화 후 최소화; idempotency 증거 tombstone은 원 업무와 같은 보존.
archive도 재처리 차단 key 보존; 파티셔닝은 계측 후 필요할 때만.

## 출고 상태 전이
`draft → reserved → awaiting_approval(정책상 필요) → approved → document_ready → instruction_pending → sent → acknowledged → picking → partially_shipped/shipped → in_transit → partially_received/received → reconciled`.
정책 내 자동 승인은 system actor의 policy evaluation evidence를 기록하며 사람 승인 생략을 추적한다.
각 전이는 version CAS+권한+증거+수량 검증. instruction `sending→unknown`은 운영 `held` 상태와 연결.
ack/picking 통보 없이 shipped 증거가 먼저 오면 검증 후 증거를 append하고 누락 상태를 derived 표시(추측 생성 금지).
수량 상태는 lines/events로 계산, header는 요약; 여러 부분 발송/수령이 공존 가능.
외부 취소 확인 전 예약 해제 금지. sent 이후 취소는 cancellation_requested→confirmed 또는 held,
출고 증거 도착 경쟁은 같은 aggregate lock으로 직렬화; shipped는 원복하지 않고 반품 새 거래.
100 요청/95 출고/93 입고: 창고 good 5(미출고 예약은 취소 확인 전 유지), transit2, 목적지93;
차이7을 자동 손실/완료 처리하지 않고 미출고5와 운송2를 각각 대조.

## 추가 명시: 외부 참조와 재해 복구
- `integration_references(id PK, account_id FK, local_type/local_id, remote_type/remote_id,
  remote_version, payload_hash, UNIQUE(account_id,remote_type,remote_id))`는 외부계획/입고/운송 ID 연결.
  local_type별 실제 FK를 가진 연결 테이블로 migration 구체화하여 다형성 참조 무결성을 잃지 않는다.
- `import_batches(id PK, account_id FK, file_sha256, source, observed_at, status, actor_id FK,
  UNIQUE(account_id,file_sha256))`, `import_rows(batch_id FK,line_no,raw_ref,validated_payload,
  validation_status,errors,PRIMARY KEY(batch_id,line_no))`; batch가 검증완료여도 승인 전 원장효과0.
- `inventory_accounts.shipment_id FK shipments(id)` nullable: transit만 NOT NULL, 그 밖은 NULL.
  shipment 생성과 account 생성 순서를 지켜 순환 FK를 피한다. 위치 NULL은 창고 기본 bucket.
- 시스템 actor는 service identity 테이블 FK로 기록하고 `(user_actor_id IS NULL)<>(service_actor_id IS NULL)`;
  익명 actor 금지. created/recorded_at 공통명 외 entries.recorded_at은 거래시각과 일치 검사.
- 판매/외부수령 event와 snapshot은 별도. accepted source event unique로만 marketplace ledger posting;
  sync cursor/cutoff를 고정해 이미 반영된 sales와 재고 snapshot 차이를 이중 posting하지 않는다.
  snapshot은 참조 관측값, 차이 자동 덮어쓰기 금지. 믿을 수 있는 기초잔액 도입도 승인된 opening transaction.
- 동일사업 단일 tenant(초기). 향후 다사업자는 entity/unique/FK에 tenant scope 추가하는 별도 migration;
  현재 warehouse/marketplace account 범위 RBAC는 유지. 50 SKU 증가에는 schema 변경 필요 없음.

출고 내용 수정은 aggregate lock 하에서 version 증가+기존 승인 폐기+pending outbox 취소를 함께 수행한다.
sending/sent/unknown이면 수정 실행 불가, cancellation/reconciliation 절차로 이동. worker도 실제 전송 직전
aggregate version/approval hash/state를 CAS로 확인하여 옛 문서가 전송되지 않도록 한다.
예약 만료는 전송 전 draft/reserved에서만 해제 가능; sent/ack/picking/unknown 예약은 TTL만으로 해제 금지.
외부 취소 확인 또는 실제 출고 소비로만 해소하며 장기 미해소 예약은 경고·관리자 대조한다.

## DEV02 구현된 인증 스키마

이 문서 위의 업무 테이블은 설계이며 아직 미구현이다. 실제 forward migration `0001_auth.sql`은
users/roles/permissions/role_permissions/user_roles/sessions/mfa_credentials/mfa_codes/auth_attempts/auth_bootstrap/audit_events를 추가했다.
`0000_foundation.sql`과 snapshot은 수정하지 않았고 기존 foundation_metadata를 보존한다.
실제 컬럼 타입/PK/FK/unique/CHECK/index는 `packages/db/src/auth-schema.ts` 및 생성된0001 snapshot/SQL이 기준이다.
커스텀 append-only trigger만 생성 SQL에 추가하며 테스트 schema의 안전한 search_path를 위해 FK는 비정규화된 public 대신 현재 schema를 참조한다.
users.login/identity_subject, sessions.token_hash, mfa_codes.code_hash는 unique; user_roles 활성(user,role,scope) unique.
창고 미구현 동안 scope=global CHECK, 실제 warehouse FK 전환은 DEV03. sessions는 익명 CSRF를 위해 user nullable,
MFA verified이면 user NOT NULL CHECK. 토큰 원문 미저장, MFA Secret은 AAD 암호화, 복구 코드는 hash만 저장.
감사는 sequence 인덱스와 predecessor digest, UPDATE/DELETE 거부 trigger; 중요한 변경과 같은 transaction.
[세션 시간·락 순서·권한·암호화·API 계약](docs/AUTHENTICATION.md). Drizzle generate의 BigInt default 직렬화 문제는 SQL literal default(-1)로 해결했다.

## DEV03 현재 구현

실제 Catalog schema는 products/skus/warehouses/locations/integration_accounts/sku_mappings/command_results/catalog_revisions와 warehouse_id FK를 추가한다. 0000/0001은 보존했다. PK/FK/partial unique/CAS/DB cycle trigger/이력·상태 계약은 CATALOG의 현재 구현이 기준이다.
[Catalog 상세 계약](docs/CATALOG.md). 실제 결과는 [DEV03 보고](docs/dev-reports/DEV-03.md)에서 확인한다.

## DEV04 현재 작업

불변 복식 재고 원장·예약·증거·부분 입출고·이동·정정·대조를 기존 Catalog/Auth UUID에 연결한다. 내부 구현·로컬 검증을 완료했다. GitHub 병합은 연결된 실제 PR 결과로 별도 판정하며 운영 배포가 아니다. [구현 계약](docs/INVENTORY_LEDGER.md) · [실제 검증/미실행 범위](docs/dev-reports/DEV-04.md). 미검증 수동/외부 증거와 위험 조정은 보류한다.

## DEV-05-1 문서 기반(부분 구현)

기존 Outbound/SKU/Warehouse/Reservation/Shipment FK를 재사용하는 불변 Snapshot·버전 템플릿·Artifact/Event 메타데이터와 권한/Audit UoW를 구현한다. 렌더러·파일 저장·HTTP/미리보기/다운로드·신규 문서 UI는 아직 미구현이다. 재고/예약/출고 수량을 변경하지 않으며 Sample 문서는 발송 불가다. [현재 구현·복구·안전 계약](docs/DOCUMENTS.md) · [단계별 실제 검증](docs/dev-reports/DEV-05.md). DEV05 전체 완료/운영 배포/실제 파일 생성으로 표시하지 않는다.

## DEV05-2 추가 계약

형식·kind별 Sample Manifest4종과 13개 허용 필드 mapping, 지시서의 잔여 예약 선택과 명세서의 확인된 ShipmentLine 선택을 추가했다. Snapshot의 기존 line/source는 보존하고 `documentQuantities`에 이번 수량을 고정한다. Forward0014가 실제 DB 수량·형식별 Artifact 완전성을 검증한다. 100→95→93에서 새 지시5·미출고5·Transit2·수령93이며 문서 생성은 재고/예약/Shipment/Receipt를 바꾸지 않는다. legacy 문서2 Artifact와 신규 형식 고정 문서1 Artifact를 구분한다. [세부 규칙·검증 범위](docs/DOCUMENTS.md). 실제 renderer/file/HTTP/UI는 DEV05-3, 전체 DEV05는 미완료다.
