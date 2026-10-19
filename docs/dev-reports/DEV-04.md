# DEV-04 — 불변 복식 원장·예약·물류 엔진 검증 보고

초기 보고서 작성은 병합 전이었다(아래 문단은 당시 이력). 구현·로컬 검증과 GitHub 병합을 구분한다. 원격 HEAD/Quality/Independent/Guarded/실제 merge 결과는 이 보고서와 연결하는 DEV04 PR의 메타데이터로 확정하며, 확인 전 성공을 추정하지 않는다. 운영 배포는 수행하지 않는다.

시작 main `cbf4e291df5bc952aaa7e3a211889220953b57a3`, DEV03 [PR12](https://github.com/Raccoon26/Project-WMS/pull/12) merged/열린PR0/기존변경0을 실제 조회했다. `dev/dev-04-inventory-ledger` 신규 branch를 사용하고 다른 작업/main/볼륨을 덮어쓰지 않았다.

## 최종 GitHub 검증·병합 확인 — 2026-10-19 JST

- 구현 Branch `dev/dev-04-inventory-ledger`, [PR13](https://github.com/Raccoon26/Project-WMS/pull/13): MERGED/일반 PR, 변경64파일. 기존 작업을 보존하고 신규 구현 및 CI 명령 연결 두 commit을 사용했다.
- 검증 HEAD `8b7011a65731e43dbbc99ec5ce3a9146e3d03ef8`, 검증 Base `cbf4e291df5bc952aaa7e3a211889220953b57a3`.
- [Policy SUCCESS](https://github.com/Raccoon26/Project-WMS/actions/runs/39191144072), [Quality SUCCESS](https://github.com/Raccoon26/Project-WMS/actions/runs/39191144111), [Independent SUCCESS](https://github.com/Raccoon26/Project-WMS/actions/runs/39191503272), [Guarded SUCCESS](https://github.com/Raccoon26/Project-WMS/actions/runs/39191975863).
- 실제 Squash Merge `9089e261e649922a09b2147cb1b5a1f0e22b3647`, merged_by `github-actions[bot]`, 승인 Review0/label0. 구현 HEAD와 원격 병합 tree가 byte-for-byte 같음을 git diff로 확인했다. 수동 병합/직접 main Push/force Push/운영 배포 없음.
- Quality Artifact: Unit115/PG Integration77/Security·Failure70/Desktop·Mobile E2E80/Policy81 = 고유423 passed, failed/skipped/todo/flaky0. 별도 `test:invariants`는 실제 PG30개 재실행 성공으로 고유 수에 중복 합산하지 않는다.
- Independent Artifact: 같은 HEAD/Base/PR13 및 sourceRunId39191144111/independentRunId39191503272를 실제 대조했다. Unit115/Integration77/Failure70/E2E80, 실패/Skip0. 로그의 Python81개 두 번 실행도 확인했다. Auth/Catalog/Inventory/Migration 필수 case 계약 모두 충족한다.
- 원격 50 SKU/2 MFA actor 동시 예약240.09ms, 실패0. 로컬 수치와 환경이 다르므로 비교 성능 보장으로 해석하지 않는다.
- [검증 증거 보관본](../evidence/DEV-04-ci.json)은 실제 다운로드한 데이터의 비민감 요약이다. 승인 입력이나 대체 검사기로 사용하지 않는다. 원본 Actions Artifact 보존기간은7일이다.
- 구현 병합 이후의 상태 문서 보완은 별도 DEV04 사실 기록 PR로 관리하며, 해당 문서 자체의 최종 main SHA는 실제 GitHub 병합 결과를 따른다. DEV05 기능을 시작하지 않았다.

## 구현과 Migration

[상세 API·DB·잠금·상태·증거 계약](../INVENTORY_LEDGER.md). 기존 Product/SKU/Warehouse/Location/Auth UUID/FK를 그대로 사용한다. Node24.19.0/pnpm10.34.7/PostgreSQL17.11, 기존 framework/lockfile/Worker/15개 라우트/다국어/PWA/AUTO01 유지. 외부 의존성 추가0.

| Forward Migration | 실제 변경 |
|---|---|
| 0005_mean_pandemic |19개 기초 업무/원장/증거/Outbox table, Drizzle schema, FK·Unique·CHECK·불변/Projection/Commit Trigger |
| 0006_inventory_integrity | 출고/예약/입고/수령 누계·관계 Commit 검증·추가 역사 불변성 |
| 0007_fat_maestro | opening_claims(20번째 table), 첫재고 중복방지·최종 Projection version 검증·Transit 출발창고 |
| 0008_inventory_final_guards | 정확한 반대거래/중복 정정·예약 상태·opening claim 보강 |
| 0009_inventory_history_guards | 업무 이력 삭제 금지·입고 상태/버전 제약 |
| 0010_inventory_query_indexes | 증거와 posting 1:1, FK/예약이력/출고범위/receipt index |
| 0011_inventory_ledger_seek | SKU/transaction cursor seek index |

기존0000–0004 SQL/snapshot/hash/journal prefix는 변경하지 않았다. 이미 실행한 신규 SQL도 변경하지 않고 forward 보강했다. 실제0000–0004→현재 upgrade/동시 migration/반복 실행/hash 변조 거부/실패 Rollback에서 기존 Auth/Catalog 데이터가 보존된다. 개발 Compose는 높은 권한이지만 별도 제한 NOLOGIN role의 원장 SELECT 허용·UPDATE/DELETE 권한 거부도 실제 검증했다. 운영 migration/app/backup 역할 구분은 DEV12 책임이다.

원장/잔액/예약/증거/업무상태/감사/내부 Outbox/command result가 하나의 Transaction이다. Entry INSERT가 잔액을 갱신하며 직접 잔액 조작은 Commit 대조에서 거부한다. SKU별 합0, 비경계 음수 금지, Good≥Reserved, 예약 미해소합, Shipment/Receipt 누계, exact reversal을 DB에서도 검사한다. Entry 시간은 원거래 DB timestamp를 SQL로 복사한다.
Session→User→Aggregate→metadata share→정렬 Account→예약→Audit 순서, 재고 전체를 전역74002로 잠그지 않는다. 실제 PG deadlock을 만들어 Rollback/동일 command 제한 재시도와 최대3회 중단을 검증했다. 권한회수/SKU 코드 수정과 첫 Posting 경합도 실제 row lock으로 검증한다.

## 업무·권한·웹

- Opening, 예약/해제, 다중 line 출고계획, 부분 Shipment, 연결 Inbound/Receipt, 다중 Shipment의 독립 Transit, Transfer, 정상/손상/격리 전이, 정확한 반대거래, 실사 cutoff/차이/held를 구현했다.
- 미출고 예약은 부분 출고·unknown·외부 증거 보류 시 TTL만으로 해제하지 않는다. Cancel은 출고전만 재고를 해제하며 그 이후에는 cancellation_requested만 기록한다.
- 실제 Provider/업무 승인 Port가 없으므로 manual/external 증거와 위험 조정은 held. 같은 수량인 manual 실사도 검증 완료로 승격하지 않는다. Synthetic은 test DB+schema 이중 guard 또는 명시적인 loopback 개발 opt-in만 허용한다. production은 기존대로 차단된다.
- 완전 MFA/현재 권한·양쪽 창고 Scope/CSRF/Origin/Version/멱등 key를 UoW 안에서 재검증한다. Viewer는 실사 생성도 할 수 없다. 사용자/권한/Worker 정책을 확대하지 않았다.
- Inventory/SKU·창고별 집계/Outbound/Inbound/Transfer/원장·증거/실사 UI를 기존 레이아웃에 추가했다. 일본어/ko/en, 모바일/키보드/입력 유지/중복 submit 차단/실패 후 같은 key 복구를 실제 browser로 검증한다. API/민감정보 캐시·오프라인 변경 queue는 없다.
- 조회 기본25/최대100, SQL cursor/filter, actor/grants/query/parent-bound HMAC. 상세의 제한된 preview 외 모든 Shipment/Receipt 증거는 별도 parent-bound cursor로 조회한다. 경계/예약/요청/누적출고를 소유재고에 이중 합산하지 않는다. Good 이외의 Available은0이다.
- service actor와 Provider verification은 타입/DB 확장 계약만 추가했다. 실제 Worker는 readonly, 외부 consumers/이메일/시장/결제/Telegram/운영 배포는 활성화하지 않았다.

## 실제 실행 결과

최종 로컬 runner 기준: Unit115, PostgreSQL Integration77, Security/Failure70, Desktop/Mobile Chromium80, Python Policy81 = **423 passed / failed0 / skipped0 / todo0 / flaky0**. 기존314개 assertion/기준선은 삭제·수정하지 않고 신규109개 검증을 추가했다. 원격은 별도 실제 Actions 증거로 판정한다.

```bash
pnpm install --frozen-lockfile
pnpm audit --audit-level high
pnpm check:boundaries
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm test:invariants
pnpm test:failures
pnpm build
pnpm test:e2e
python3 scripts/run_policy_tests.py
python3 scripts/check_public_files.py
python3 scripts/validate_docs.py
```

설정한 test container ID를 실제검증한 뒤 Failure suite가 격리 DB만 stop/start했다. 개발 API/Worker/Web도 직접 실행하여 readiness200/200/HTML200, 무인증 users401/CSP 적용을 확인하고 시작한 프로세스만 정상 종료했다. 모든 DB 테스트는 실제 PostgreSQL17이며 독립 schema를 정리하고 기존 볼륨을 reset하지 않았다. Python에서 출력되는 모사 MERGED 문자열은 GitHub 실제 병합 증거가 아니다.

CI 경로의 마지막 대조에서 DEV04부터 요구되는 `test:invariants` script 누락을 발견하여 등록했다. 이 명령은 실제 PostgreSQL inventory Integration 30개를 별도 실행하며 실패/0개/Skip을 거부한다. 전체423개와 중복되는 재실행이므로 고유 테스트 수에 다시 합산하지 않는다. 기존 CI 조건과 검증 강도를 변경하지 않았다.

개발 watch 프로세스의 idle RSS snapshot은 API220,422,144 / Worker201,441,280 / Web105,746,432 bytes였다. 실제 loopback HTTP readiness20회 p50 1.66ms/p95 2.52ms이며 API200/Worker200/Web200, 익명 users/inventory401, 정적 CSP를 확인했다. 개발 watcher overhead를 포함하며 운영 프로세스/Pi 메모리·성능으로 해석하지 않는다.

## 100 → 95 → 93 수용 결과

| 실제 측정 대상 | 확정 수량 |
|---|---:|
| 출발 Good / Reserved / Available | 5 / 5 / 0 |
| Transit 미수령 | 2 |
| 목적지 Good | 93 |
| 총 소유 | 100 |
| 별도 미출고 | 5 |

원장 Entry/Balance/Reservation/Evidence/Audit/Outbox를 실제 조회했다. 동일 Shipment/Receipt의 다른 key·변경 payload는 추가 posting을 만들지 않는다. 초과수령은 held이고 미수령2를 손실로 처리하지 않는다. UI summary도 source Physical5/Transit2/Owned7, destination Physical93/Owned93을 실제 API/PG와 대조한다.

## 규모·성능

60/120/1,000 SKU는 기존 Fixture의 모든 Good/Reserved/expected_available/in_transit 값을 SKU·3창고별 실제 원장/잔액과 대조했다. 품절0은 명시적 계정·합성 실사로 기록하며 0 Entry는 삽입하지 않는다. 첫 SKU의 명시적인 손상2/격리3 lot만 별도 추가하고 원본 Good 기대값은 유지한다. 세 규모 모두 불변식/페이지/인덱스/대조 통과. 50 SKU 동시 예약은 실제 두 MFA actor/Pool5에서 실행하며 실패0·과다예약0이다. 원자료는 CI의 test-results/inventory-scale-*.json, inventory-concurrent-50.json이다.

별도 실험: [10만 원자료](../performance/DEV-04-history-100000.json), [100만 원자료](../performance/DEV-04-history-1000000.json).
Cloud Linux6.18.44 x64/EPYC9V74/가용CPU4/host RAM33.29GiB/Node24.19.0/PG17.11. 실제 **1,000,002 Entry**, 1,000거래 제한 배치, 균형 불일치0·Projection 불일치0. 생성283.45초, 추가 Entry 약3,528/s(합성 bulk seed이며 사용자 posting 처리량 아님). warm API20회/동시1/Fastify Inject의 p50 **9.81ms**, p95 **17.15ms**, 실패0. profile 프로세스 RSS snapshot **101.46MiB**, schema table+index 약**1,064.73MiB**. TCP/독립 API RSS/peak RSS/지속 부하/Pi 측정으로 바꾸어 해석하지 않는다.
실제 실행된 API SQL을 관측하여 동일 SQL/parameter의 EXPLAIN ANALYZE/BUFFERS를 저장했다. 설치한 index와 실제 선택한 index를 구분한다(해당 한-SKU query는 transaction PK/entry_line/account_sku 사용). 10만 이전 query p95약295ms에서 Scope를 보존한 seek SQL 재측정은 약21ms였다. 동일 부하 통제의 통계적 성능 보장을 주장하지 않는다.

```bash
pnpm exec tsx --conditions=source tests/performance/inventory-history.ts --entries 1000000
```

제약을 끄지 않고 자신의 합성 schema만 생성·정리한다. 상시 CI에 매번100만 seed를 넣지 않는다. 처음 단일 대형 transaction 실험은 Commit 검증 비용으로 취소·Rollback/정리했고, SQL parameter type 충돌도 수정했다. 이는 성공 결과에 포함하지 않는다.

## F01–F30 추적

| ID | DEV04 실제 범위 / 판정 |
|---|---|
| F01 | 동시 동일 출고 key/참조: plan/line/inbound/result/outbox1 — 검증 |
| F02 | 외부 이메일 중복 전송 — NOT RUN DEV06 |
| F03 | 외부 발송 직후 kill — NOT RUN DEV06 |
| F04 | 이메일 ACK 유실 — NOT RUN DEV06; 내부 commit 응답유실은 검증 |
| F05 | 업무 승인 연타 — NOT RUN DEV07; 일반 command 이중 submit은 검증 |
| F06 | Telegram callback — NOT RUN DEV07 |
| F07 | 동일 API/key/hash 재시도, payload 변경409 — 검증 |
| F08 | Entry/Balance/Reservation/Audit/Outbox 단계 오류 전체 Rollback — 검증 |
| F09 | Pi 정전 — NOT RUN DEV12 |
| F10 | 브라우저 offline/무캐시/무queue — 검증; 외부 통신 장애 DEV06/12 |
| F11 | 저장장치 full — NOT RUN DEV12/13 |
| F12 | 실제 test PG stop/start,503/복구/기존원장 보존 — 검증; 실운영 DEV12 |
| F13 | Amazon 인증 만료 — NOT RUN DEV08 |
| F14 | Rakuten 오류 — NOT RUN DEV09 |
| F15 | Provider rate limit — NOT RUN DEV08/09; Auth rate 기존검증 보존 |
| F16 | cutoff/관측 차이 held·덮어쓰기0 — 검증; 실제 Provider 동기화 후속 |
| F17 | 실제 Catalog mapping/유효하지만 다른 SKU·Shipment 관계 차단 — 검증; live mapping DEV08/09 |
| F18 | 100요청/95출고, Good5·Reserved5·Transit95 — 검증 |
| F19 | 95출고/93수령, Transit2·목적지93·소유100 — 검증 |
| F20 | 이미 처리한 다른 key Shipment/Receipt — 추가 posting0 검증 |
| F21 | 마지막 재고 경쟁·합계 예약≤Good — 검증 |
| F22 | API/Worker SIGINT·SIGTERM 기반 보존 — 검증; 업무 lease/update DEV12 |
| F23 | 실제 백업 복원 후 replay — NOT RUN DEV13; 프로세스 재시작 key재사용은 검증 |
| F24 | 현재 MFA/Permission/Scope/회수401·403 기반 — 검증; 실제 출고 업무 승인 DEV07 |
| F25 | 백업 손상 — NOT RUN DEV13 |
| F26 | Drive 인증 만료 — NOT RUN DEV13 |
| F27 | 외부 heartbeat와 업무 실패 분리 — NOT RUN DEV13 |
| F28 | 50SKU 실제 동시 posting/reservation·2 actor — 검증 |
| F29 | 100만 Entry/실제 API page/SQL plan/RSS snapshot — 검증; Pi/지속부하 후속 |
| F30 | 창고 이메일 회신 형식 변경 — NOT RUN DEV06 |

## L01–L30 추적

아래는 tests/integration/inventory*, tests/fault/inventory*, tests/e2e/inventory.spec의 실제 DB/HTTP/browser assertion이다. 개발용 합성 경계에서 실행했으며 외부 전송 실증과 혼동하지 않는다.

| ID | 실제 결과 |
|---|---|
| L01 | 불균형/전체합0이지만 SKU별 불균형 Commit 거부 |
| L02 | Entry UPDATE trigger 거부, 제한 role 권한 거부 |
| L03 | Entry DELETE trigger 거부, 제한 role 권한 거부 |
| L04 | 직접 Balance 조작 Commit 대조 거부 |
| L05 | 동시 마지막 재고 예약1개만 성공 |
| L06 | 다른key 같은 Shipment 증거409·추가원장0 |
| L07 | 최신 version으로 같은 Receipt 증거409·추가원장0 |
| L08 | Entry 삽입 단계 오류 전체 Rollback |
| L09 | Balance 갱신 단계 오류 전체 Rollback |
| L10 | 예약 소비 후 Trigger 오류 전체 Rollback |
| L11 | 감사 저장 오류 전체 Rollback |
| L12 | Outbox 저장 오류 전체 Rollback |
| L13 | 실제 응답 abort 후 같은 key 기존 결과1개 |
| L14 | 실제 API 프로세스 종료/재시작 후 원장/결과 보존 |
| L15 | test DB 연결 중단503, 복구 후 불변식 보존 |
| L16 | 존재하는 다른 SKU 증거422, 유효 FK SKU 혼합도 거부 |
| L17 | 다른 창고 FK/Scope 및 다른 Inbound/Outbound 관계 거부 |
| L18 | Shipment별 Transit 독립, 다른 Shipment 수량 소비 거부 |
| L19 | 수령 초과 held, 실제 잔액 증가0 |
| L20 | 예약 전 출고 상태 충돌 거부 |
| L21 | expired + 외부 결과 불명/held 예약 자동 해제0 |
| L22 | 부분출고 취소는 cancellation_requested·잔여예약 유지 |
| L23 | 원거래 중복 반전 unique 거부 |
| L24 | 반전이 예약/음수 가용을 만들면422 |
| L25 | 권한회수와 대기 posting 경쟁 후 무권한 Commit0 |
| L26 | stale SKU version409, 첫원장과 Code 수정 경쟁422 |
| L27 | 같은 Source Event/다른 payload409, 기존증거/원장 유지 |
| L28 | 실제 PG deadlock victim Rollback 후1회 재시도; unit 최대3회 종료 |
| L29 | 실제 재시작 후 같은 command 재실행 추가 posting0 |
| L30 | 100→95→93, 총소유100/미출고5/미수령2 |

## Self Review와 수정

Timestamp 마이크로초 손실을 SQL 복사로 수정했다. 불변 Account의 upsert UPDATE를 DO NOTHING+조회로 바꿨다. Opening 최초경쟁에 account lock/DB claim을 추가했다. SKU별 합0/역거래/예약·수령 합계를 DB에서 재검사한다. global metadata mutex를 재고에 복사하지 않고 실제 deadlock/권한/SKU 경합을 검증했다.
조회 비용을100만 데이터로 확인하고 SQL/인덱스를 보강했다. 손상/격리/Transit Available을0으로 정정하고 실제 summary/API/UI 수용 테스트를 추가했다. Viewer 실사 쓰기를 차단했다. 단순 test schema 이름만으로 synthetic을 신뢰하지 않게 DB 이름도 확인했다. cursor key를 inventory 전용 HMAC 파생키로 분리했다.
React state 직접변경을 Ref로 수정하고 가로 스크롤 누락으로 모바일 저장이 실패한 원인을 고쳤다. 실사 datetime 입력에 밀리초를 보존했다. 로그아웃 테스트는 서버 완료를 확인한 뒤 Back을 실행한다. Lost response/이중 submit/충돌 입력유지/권한403의 민감 상태 제거를 검증했다. Secret scanner가 합성 문자열을 검출한 테스트는 실제 무작위 합성값으로 바꾸었고 검사 규칙을 완화하지 않았다. 테스트 보강 중 typecheck로 발견한 선언전 변수참조/타입 오류도 수정 후 실제 재실행했다.

## 과거 요구사항 감사·제한

R01(확장/Catalog)·R02/R03(내부원장/물류)·R11(원자적 내부이벤트)·R12(웹/PWA)·R13(인증)·R18(AI없이)·R19(AUTO01)·R20(회귀)·R21(비밀보호)·R22(단일PG)·R23(출처/held) 기반을 이번 범위에서 검증했다. R04–R10 문서/메일/시장/보충/금전/Telegram, R14–R17 Pi/백업/감시/자체창고, R24의 실제 고위험 업무승인은 담당DEV에 유지한다. R25 모델 정책은 보존하며 실행 플랫폼 모델명/effort를 확인할 API가 없으므로 확인했다고 주장하지 않는다.
U00–U29/R01–R25의 기존 설계·현재 구현·후속 책임은 추적표를 보존하고 이번 결과로 보강한다. 기존 Foundation/Auth/Catalog/Python assertion과 workflow chain을 삭제하지 않았다. 새로운 inventory test-only registry는 기존 문자열 보존/실제 파일/경로·크기/앱 overlay 금지를 검사하고 main 소유 runner가 미래 assertion을 보존한다.
실제 Windows/macOS/ARM64/Pi/정전/SSD/장기운영/7년보존/운영백업·복원/외부 Provider 검증 NOT RUN. 운영 최소권한/HTTPS/암호키 escrow는DEV12/13. 큰 조정과 일반 출고·수령의 임의 반전은 approval/반품·대조 Port 전에 안전하게 보류·거부한다. 실제 Supplier 독립 입고·외부 판매·결제·발송·consumer는 구현했다고 표시하지 않는다. 이 제한은 DEV04 내부 엔진과 향후 운영 출시를 구분한다.
Rollback은 새 revert/forward PR+동일 독립검증이다. 원장 기록 수정/기존 migration history 변경/DB reset/볼륨삭제/자동 운영배포는 하지 않는다.

## GitHub·다음 단계

2026-10-19 JST 재개 점검: 기존 `8b5d568` 구현과 3개 미커밋 보완 파일을 보존했다. 원격 main은 시작 SHA와 같고 열린 PR은 없었다. 저장된 Unit115/Integration77/Failure70/E2E80/Policy81 보고서를 확인했다. `/tmp`에 있던 중단 전 로컬 독립 검증 로그는 복원되지 않았으므로 그 실행을 통과 증거로 사용하지 않는다. 새 `test:invariants` 명령, lint/typecheck, frozen install, migration, 정책·문서·Secret·Workflow/Shell 검사를 재실행하며, 최종 HEAD의 전체 검증은 실제 Quality와 main-owned Independent Actions에서 다시 확인한다.

Commit/Push/일반 PR/현재 SHA Quality/main-owned Independent/Guarded/실제 Squash Merge를 모두 확인했다. DEV04 내부 구현·검증·main 반영 완료이며 실제 외부 물류 운영 출시는 아니다. 초기 병합 전 기록과 최종 원격 증거를 위에서 구분했다.
DEV05는 실제 Outbound/Line/미출고/Version과 Warehouse/SKU UUID를 사용하여 교체 가능한 Sample Excel/PDF 템플릿을 구현할 수 있다. 문서 생성/메일 성공으로 재고를 차감하지 않는다. 실제 양식·발송·위험 승인·Provider 신뢰·운영배포는 다음 담당단계에서 검증한다.
