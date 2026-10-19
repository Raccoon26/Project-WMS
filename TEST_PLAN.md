# 검증 전략

DEV00에서 기능 엔진은 만들지 않는다. 아래 NOT RUN은 실제 구현 후 실행해야 할 명세이다.
문서/fixture/policy 테스트 통과를 실제 재고/운영 연동/50 SKU 성능 통과로 바꾸지 않는다.

## 층별 검증
- unit: Decimal/수량/전이/권한/재시도/보충 계산, fake clock·seed 고정.
- integration: 실제 PostgreSQL17 migration/제약/lock/rollback/outbox; in-memory SQLite로 대체 금지.
- contract: provider별 schema·서명/권한·오류/최신성, recorded synthetic fixture, 운영 secret 금지.
- E2E: browser→API→DB→worker→fake Email/marketplace/Telegram; Playwright desktop/mobile,
  중복 클릭·오프라인·재접속·i18n/보안·검색/페이지네이션.
- fault: process kill/DB restart/network/drop ACK/low disk, 각 실행 고유 ID와 원장/전송 카운트 기록.
- regression: 매 DEV 이전 trace 요구 전체, 영향없는 것은 근거를 report, 예상실패/skip도 별도 기록.
- release: clean install/frozen lock/typecheck/lint/build/unit/integration/invariants/failures/E2E/secret/dependency review,
  backup 실제 복원·Pi 실측·30 장애·최소50SKU. fail/skip/zero tests는 통과로 취급하지 않는다.

## 원장 불변식 (DEV04에서 실행)
모든 SKU transaction entries sum=0; 모든 non-boundary balance>=0; good>=reserved;
ledger sum=balance, 미해소reservation sum=reserved; shipped<=requested−cancelled;
received<=shipped(초과는 격리), 출고처+transit+목적지=기초+외부입고−외부판매−확정손실;
반복요청 전후 posting/action/evidence 개수 불변. failpoint를 ledger/balance/audit/outbox 사이마다 주입한다.
100→95→93 사례의 총소유100, 미출고5/운송2/수령93을 각각 확인.

## 필수 장애 명세 30개
| ID | 장애 | 기대 결과 | 검증 방법 | 구현·실행 담당 | 현재 |
|---|---|---|---|---|---|
| F01 | 동일 출고 요청 두 번 생성 | 동일 key/hash는 같은 ID; 다른 payload409; 신규 업무 중복 참조도 unique | 동시 POST 두 connection, row/예약/outbox 각각1 | DEV-04 | DEV04 내부 PG/합성 검증; 운영·외부 범위는 DEV04 보고 구분 |
| F02 | 동일 출고 요청 이메일 두 번 발송 위험 | action_key unique; 동시 worker도 원격 전송≤1 또는 unknown 보류 | fake EmailPort 호출 카운트+DB unique 경쟁 | DEV-06 | NOT RUN |
| F03 | 이메일 발송 직후 서버 종료 | sending 작업은 unknown; 자동 replay0, 예약 유지 | send 직후 kill, worker 재기동·발송함 대조 | DEV-06 | NOT RUN |
| F04 | 이메일 성공 후 ACK 유실 | unknown+알림, 출고 원장변화0; 확인 전 재전송0 | provider success 뒤 timeout 주입 | DEV-06 | NOT RUN |
| F05 | 승인 버튼 연속 클릭 | 하나의 유효 결정·한 번 실행, 나머지는 동일 결과/충돌 | 동시 approval endpoint100회, nonce/CAS 검사 | DEV-07 | NOT RUN |
| F06 | Telegram 콜백 중복 | user/chat/nonce/version/expiry 확인, 승인1회 | 동일 update/callback 재생·변조·권한회수 | DEV-07 | NOT RUN |
| F07 | 중복 API 요청 | 업무/원장/outbox 각각 한번, hash변경409 | 동일 idempotency 동시/재시도 응답유실 | DEV-04 | DEV04 내부 PG/합성 검증; 운영·외부 범위는 DEV04 보고 구분 |
| F08 | DB 트랜잭션 도중 장애 | ledger/balance/reservation/audit/outbox 전부 commit 또는0 | posting 단계별 connection kill·rollback 조회 | DEV-04 | DEV04 내부 PG/합성 검증; 운영·외부 범위는 DEV04 보고 구분 |
| F09 | Pi 정전 | WAL 복구·균형 유지, sending unknown·자동부작용 보류 | 실장비 통제 전원중단+재기동; VM kill은 대체 증거 구분 | DEV-12 | NOT RUN |
| F10 | 인터넷 단절 | 안전한 로컬 조회 지속; 외부 영향 unknown, stale 자동출고 hold | 네트워크 차단·재접속·요청 카운트 | DEV-06,12 | NOT RUN |
| F11 | 저장 공간 부족 | DB 실패 rollback; 백업 실패 경고, 성공 허위표시 없음 | 격리 작은 volume 채우기, 원장/마지막 백업 검사 | DEV-12,13 | NOT RUN |
| F12 | PostgreSQL 재시작 | API503/worker 중단 후 DB 복구 재검증, 중복0 | 테스트 Compose DB restart mid command | DEV-04,12 | DEV04 내부 PG/합성 검증; 운영·외부 범위는 DEV04 보고 구분 |
| F13 | Amazon 인증 만료 | 제한 refresh/실패 격리·stale hold, 다른 모듈 정상 | mock401/invalid_grant, real key 없음 | DEV-08 | NOT RUN |
| F14 | Rakuten 오류 | integration circuit 개방·수동CSV 경로, 원장 덮어쓰기0 | mock5xx/오류body/정상화 | DEV-09 | NOT RUN |
| F15 | Rate Limit | Retry-After+jitter·최대5회/read 재시도, 쓰기 불명 hold | fake clock429/헤더누락·retry budget | DEV-08,09 | NOT RUN |
| F16 | 출처별 수량 불일치 | source/time 별 분리, 차이 hold·수동증거 후 조정 | 동일 cutoff 불일치 snapshot/ledger 합 검증 | DEV-04,08,09 | DEV04 내부 PG/합성 검증; 운영·외부 범위는 DEV04 보고 구분 |
| F17 | 잘못된 SKU 매핑 | 미검증/중복/변경 mapping 차단·기존승인 무효 | 외부코드 다른SKU 주입, shipment0 | DEV-03,08,09 | NOT RUN |
| F18 | 100 요청 중95 출고 | good5,transit95,미출고5 예약 보류, 손실 확정0 | 부분증거95 재생, ledger/reservation 대조 | DEV-04,06 | DEV04 내부 PG/합성 검증; 운영·외부 범위는 DEV04 보고 구분 |
| F19 | 95 출고 중93 입고 | 목적지93,transit2,차이 hold; 원창고5 유지 | receipt93 중복/역순 테스트, 소유총량100 | DEV-04,08,09 | DEV04 내부 PG/합성 검증; 운영·외부 범위는 DEV04 보고 구분 |
| F20 | 이미 출고한 요청 재처리 | 증거 key unique/상태전이 차단, 추가원장0 | shipped evidence/API 재생+다른key 동일ref | DEV-04,06 | DEV04 내부 PG/합성 검증; 운영·외부 범위는 DEV04 보고 구분 |
| F21 | 예약 재고 부족 | 한 경쟁자만 할당 또는 합≤good; 음수가용0 | 동일 SKU 다connection lock 경쟁 | DEV-04 | DEV04 내부 PG/합성 검증; 운영·외부 범위는 DEV04 보고 구분 |
| F22 | 자동작업 도중 업데이트 | claim중지/drain; 불명 격리; 기존 lease 새실행 금지 | worker SIGTERM/lease expiry/fencing | DEV-12 | NOT RUN |
| F23 | 복원 후 오래된 작업 재실행 | epoch 변경/queue quarantine·외부대조 전 발송0 | 이전backup restore+이미 sent remote fake | DEV-13 | NOT RUN |
| F24 | 무권한 출고 승인 | 403/audit, 승인·원장·전송0 | operator/viewer/회수된admin/잘못된chat | DEV-02,07 | 공통 권한401/403·감사 검증; 실제 출고 승인 NOT RUN(DEV07) |
| F25 | 백업 손상 | 검증/복원 실패, 이전정상 보존, 서비스 재개금지 | cipher bit flip·누락파일/hash 변조 | DEV-13 | NOT RUN |
| F26 | Drive 인증 만료 | upload 실패/긴급 알림·last_success 유지 | mock401/quota, 이전backup 존재 검사 | DEV-13 | NOT RUN |
| F27 | 정상 heartbeat 성공·업무 실패 | 업무지연/실패율 별도 alert; 전체green 금지 | liveness200+stuck due job/backup age 초과 | DEV-13 | NOT RUN |
| F28 | 50 SKU 동시 갱신 | SKU별 balanced/예약일치/중복0, lock 순서 deadlock회복 | 50 SKU×동시 요청·seed고정·실제PG | DEV-04,14 | DEV04 내부 PG/합성 검증; 운영·외부 범위는 DEV04 보고 구분 |
| F29 | 대량 이력 조회 메모리 증가 | cursor/stream RSS bounded; 무제한 결과 금지 | 100만 entries, EXPLAIN/RSS/p95 측정, 페이지100 | DEV-04,11,14 | DEV04 내부 PG/합성 검증; 운영·외부 범위는 DEV04 보고 구분 |
| F30 | 창고 회신 형식 변경 | 파싱실패 격리·원장변화0·관리자 증거검토 | 다른 column/누락/음수/unknown SKU/첨부오염 | DEV-06 | NOT RUN |

## 최소50 SKU 수용성
`python3 scripts/generate_sku_fixture.py --count 60`의 재현 fixture와
[데이터](docs/fixtures/sku-scenarios.json)를 사용. 기본60은 테스트 규모이며 시스템 상한이 아님;
120/1000개로도 같은 generator. 각 SKU 독립 ID/플랫폼코드/3창고, 정상·품절·고판매·부족·외부전용·FBA·RSL·분산·예약·운송·비활성·다른mapping을 순환.
DEV03 등록/검색/정렬/필터/상태/페이지/창고집계; DEV04 예약·이동·동시갱신·중복·100만이력;
DEV05 문서; DEV10 보충; DEV11 매출; DEV14 통합·API장애복구·audit증가·메모리/인덱스 계측.
fixtures의 expected_available는 합성 입력 검증용이지 실제 엔진 실행 결과가 아니다.

성능: dataset/seed/app SHA/DB/CPU/RAM/OS/명령/실행시각/동시성/행수/측정도구를 보고,
p50/p95·throughput·RSS/DB 크기·EXPLAIN buffers/실패율·불변식 결과를 raw artifact로 남긴다.
Pi 성능은 실장비 확보 후 DEV12/14. 목표 미달 시 인덱스/쿼리/청크 개선 후 재측정, 수치 조작 금지.

## DEV00 실행 명령
`PYTHONPATH=scripts python3 -m unittest discover -s scripts -p 'test_*.py' -v`
`bash -n scripts/*.sh`는 파일별 실행; `actionlint .github/workflows/*.yml`;
`python3 scripts/validate_docs.py`; `python3 scripts/check_public_files.py`.
실제 명령/개수/실패 및 원격 SHA CI 증거는 [DEV00 보고](docs/dev-reports/DEV-00.md).

## DEV01 실제 테스트 구분
`tests/unit`: config/오류/ID/정확직렬화/page/locale/시간/라우트/로그/worker lifecycle.
`tests/integration`: PostgreSQL17.11 migration/concurrent repeat/schema/Drizzle쿼리/독립schema/close/API readiness.
`tests/fault`: 실제 DB stop/start·timeout lock·잘못된 설정·rollback/hash tamper·API/worker signals/restart/종료예외.
`tests/e2e`: desktop/mobile Chromium 15라우트·locale·404·API실패·offline cache/무재전송·manifest/키보드.
runner는 실패/0개/skip/todo를 성공 처리하지 않고 JSON 결과를 보존한다. [현재 실제 개수·결과](docs/dev-reports/DEV-01.md).
위 F01–30 물류 장애 명세는 현재도 NOT RUN. DEV01의 기반장애검사가 출고/예약 불변식을 검증했다는 뜻이 아니다.

## AUTO-01 자동화 검증
Python 정책/unit/controller integration/negative 테스트는 `PYTHONPATH=scripts python3 scripts/run_policy_tests.py`.
실패/skip/0개는 비정상 종료하고 실제 개수를 policy.json에 기록한다.
main-owned verification-baseline.json은 DEV01 테스트·runner·config를 데이터로 보관해 앱이 없는 전환 단계에도
후속 PR4를 독립 검증할 수 있게 한다. 이는 앱이나 업무 테스트 실행 완료를 뜻하지 않는다.
기존 assertion 삭제/runner 우회/권한 상승/Secret/HEAD·base 경합/403/충돌/fork를 음성 검증한다.
workflow_run 3단계 CI→읽기전용 독립검증→trusted merge. 실제 live 증거는 AUTO-01 보고에 별도 기록한다.

## DEV02 실제 보안 검증

Unit: 해시/ID 정규화/토큰/암호화/TOTP 시간창/Permission/scope/reauth 경계/언어·오류 계약.
Integration: 실제PG 제약·세션·MFA/복구코드 경쟁·bootstrap 경쟁·동시rate·권한회수 경쟁·감사 rollback/chain·DEV01 forward upgrade·CLI PTY.
Failure: S01–S30 중 API/정책/세션/권한/CSRF/rate/감사 실패 + 실제API 프로세스 재시작/SIGTERM/SIGINT.
Browser: 실제PG/실제password/MFA, Desktop/Mobile 기존15route+login/enrollment/recovery/reauth/user role/言語/오프라인/다중탭/지연응답.
외부 UI 응답을 가짜 인증 성공으로 바꾸지 않는다. 지연 me 응답 테스트만 실제 실제 fetch Response 전달을 지연시켜 로그아웃 경합을 검증한다.
DB를 필요로 하는 DEV02 단위 목록의 계정·epoch·감사 항목은 Mock 대신 실제PG integration에서 추가 검증한다.
전체 S01–S30 mapping, 실제 runner 개수/실패 수정/원격 실행은 [DEV02 보고](docs/dev-reports/DEV-02.md).
기존 물류 F24의 공통 기반 검증을 실제 출고 승인 엔진/Telegram 업무 검증으로 표시하지 않는다.

DEV02 최종 보강은 기존 main-owned suite를 변경하지 않는 별도 파일(auth-feedback/auth-ip/auth-lifecycle)로 확장했다.
공유 E2E IP에는 실제 throttling이 적용된다. 후속 DEV에서 더 많은 독립 로그인 사례를 추가할 때는 합성 schema/
테스트 간 rate 상태를 명시적으로 격리한다. 제한 검증 시나리오 도중 bucket 초기화나 운영 임계값 완화로 통과시키지 않는다.

## DEV03 Catalog 실제 검증 계약

`catalog: unique sku` / `catalog: warehouse scope` / `catalog: mapping integrity` /
`catalog: optimistic concurrency` / `catalog: transaction rollback` / `catalog: cursor pagination`은 실제 runner case다.
재고 profile을 만족했다고 가장하지 않으며 원장/금전/메일 suite는 후속 DEV가 구현한다.
기존 DEV01/02 assertion/snapshot은 보존한다. 새 unit/catalog, integration/catalog/catalog-upgrade,
fault/catalog/catalog-process, e2e/catalog와 helper를 추가한다.
실제PG upgrade/세션·역할 보존/동시코드·위치·key/CAS/FK/감사rollback/60·120·1000명시적 test-only seed,
Desktop/Mobile 실제 API/PG login+CRUD+scope+권한회수+networkloss+offline을 실행한다.
단위 명세의 DB 무결성 항목은 Mock 대신 실제 PG에서 검증한다. S13은 이제 실제창고 API로 확장, F17은 로컬mapping만 실증한다.
E2E의 별도 Catalog 시나리오 시작 때 공유 synthetic rate bucket만 격리한다. 실제 rate-limit 테스트 도중 초기화/threshold 완화는 없다.
합성 SKU 규모별 query plan/평균·p95/샘플·동시성/RSS는 test-results/catalog-*.json으로 남긴다.
API inject 측정의 RSS는 Vitest와 API가 공유한 프로세스이며 독립 서버/Pi 실측과 구분한다.
실제 결과·C01–C35·보안 Self Review·미실행은 [DEV03 보고](docs/dev-reports/DEV-03.md).

## DEV04 현재 작업

불변 복식 재고 원장·예약·증거·부분 입출고·이동·정정·대조를 기존 Catalog/Auth UUID에 연결한다. 내부 구현·로컬 검증을 완료했다. GitHub 병합은 연결된 실제 PR 결과로 별도 판정하며 운영 배포가 아니다. [구현 계약](docs/INVENTORY_LEDGER.md) · [실제 검증/미실행 범위](docs/dev-reports/DEV-04.md). 미검증 수동/외부 증거와 위험 조정은 보류한다.

DEV04 실제 기준선은 [423개 검증 및 F/L 추적](docs/dev-reports/DEV-04.md), [원장 계약](docs/INVENTORY_LEDGER.md)을 따른다. 별도100만 Entry 실험은 실제 실행했으나 필수 CI 테스트 수에 포함하지 않는다. 운영/Pi/Provider 시험은 담당DEV에 남는다.


## R26–R31 주문 운영·Windows/Dots 독립성 — 신규 필수 설계 테스트 (OPS-01/DEV12–14/AI-01, **NOT RUN**)
기존 F01–F30과 DEV04 테스트를 대체하지 않는다. 외부 API Live·Ubuntu 실장비·Dots 실연결은 담당 DEV가 별도 증거를 제공해야 한다.

| ID | 상황 | 기대 결과/검증 | 담당 |
|---|---|---|---|
| O01 | Windows 종료+Dots 전원/접근 차단 | Ubuntu Worker 주문 ingestion·검증·예약·Outbox·동기화·감사 계속; 실장비 E2E | OPS-01,12,14 |
| O02 | Amazon/Rakuten 동일 SKU 마지막1개 경쟁 | 실PG 성공예약≤1, 음수0, 중복출고0 | OPS-01 |
| O03 | 주문 ID/event 중복·역순·응답 유실 | 단일 order/line/ledger 명령, 버전 후퇴0 | 08,09,OPS-01 |
| O04 | 주문 취소가 수령/배송 전후 역순 | 검증된 상태전이, 출고 중 예약 자동해제0 | OPS-01 |
| O05 | 부분취소·반품·손상·격리 | 실증거·원장 반전/새거래, 가용 자동 부풀림0 | OPS-01 |
| O06 | 환불 재시도/ACK lost | 실제 이중환불0 또는 unknown hold, 관리자 승인 | OPS-01 |
| O07 | Provider 권한 없음/만료·401/403 | 가짜 성공0, 작업 hold·알림/CSV 대안 | 08,09,OPS-01 |
| O08 | 429/timeout/부분응답/네트워크 단절 | backoff·fencing·unknown 외부 쓰기 재전송0 | 08,09,OPS-01 |
| O09 | 채널 stock sync 실패/오래된 수량 | stale 표시, oversell 위험 차단/보수적 정책·대조 | OPS-01 |
| O10 | DB commit 전후/Worker crash | 불변 원장·예약/Outbox 원자성, 재기동 후 중복0 | OPS-01,12 |
| O11 | Ubuntu 부팅·Windows 부재 | systemd/Compose 독립시작, 프로세스/업무 liveness | 12 |
| O12 | 백업 복원 후 구 outbox replay | restore epoch 격리 및 원격 대조 전 송신0 | 13 |
| O13 | 관리자 승인 없는 위험 취소/환불 | 거부/보류, AI 자기승인0 | 07,OPS-01,AI-01 |
| O14 | AI 또는 브라우저가 raw SQL/임의 admin 호출 | DB 직접 접근0, 서버 RBAC·audit 위반 차단 | 18,AI-01 |
| O15 | Dots 클라우드/Windows 연결 제한·오프라인 | AI 기능만 비활성, WMS 본업무·화면/경보 계속 | 12,14,AI-01 |
| O16 | 50+ SKU, 2채널 주문·예약·출고 전과정 | 실제PG·DB 동시성/누락 이벤트·UI·운영 모니터링 | OPS-01,14 |

각 큰 작업은 DEV-XX-1/2로 분할 가능. 누락·실패/skip을 성공으로 쓰지 않는다. AI 실제 접근은 기능을 확인한 뒤 실장비 E2E로 기록한다.
