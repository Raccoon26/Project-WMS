# DEV-03 — Product Catalog / SKU / Multi-Warehouse / Scoped Authorization

상태: **구현·로컬 검증 완료**. GitHub CI/독립 검증/자동 병합은 아래 실제 PR 상태와 최종 실행 증거로 별도 확인한다.
시작 원격 main=`ad3aa1bb08aa3a8391179ba66c2207d84280c3a4`, 열린 PR/기존 DEV03 branch 없음 확인.
작업 branch `dev/dev-03-catalog-warehouses`. DEV01/02/AUTO01 이력과 구현을 보존했다.

## 구현

[Catalog 계약](../CATALOG.md)이 모델·상태·API·권한·보존·커서의 현재 기준이다.
Product/SKU/바코드·외부코드/계정 metadata/4유형 Warehouse/위치/실제 Warehouse FK grant,
검색·필터·sort allowlist/서명 keyset cursor/Version CAS/영속 actor-key 결과/append-only revision·감사.
React 기존15화면 중 Products/Warehouses/Integrations/Settings에 실제 서버 데이터를 연결했다.
비밀번호/MFA/session/epoch/CSRF/rate/권한 즉시 회수/last admin/audit/Worker readonly를 유지한다.

Forward migrations: 0002_curvy_trish_tilby.sql(Catalog+Scope+권한),
0003_young_nebula.sql(revision/검토 증거 보존),0004_black_xavin.sql(pg_trgm GIN/계정 식별자 불변).
0000/0001 미수정. Drizzle schema/snapshot 유지, 테스트 schema FK는 현재 search_path로 결합한다.
Migration 순서가 역전되면 적용 전 명시적으로 중지한다. 과거 hash/history를 강제 변경하지 않는다.

신규6 Permission: warehouses.read/manage,locations.read/manage,mappings.read/manage.
Administrator/Manager는6개, Operator/Viewer/Auditor는 read3개만 명시적 migration으로 추가한다.
이전 policy version1의 권한 의미를 바꾸지 않는 additive catalog-policy-v1이다.
Global grant를 변경하지 않고 기존 관리자 세션에서 새 권한을 확인한다. Warehouse grant는 실제FK/별도 partial unique,
Global master 변경/사용자·역할 권한으로 승격할 수 없다. 권한 관리와 mapping/account 변경은 최근 MFA 재인증을 유지한다.

## 실제 검증 기록

Linux x64 cloud / Node24.19.0 / pnpm10.34.7 / PostgreSQL17.11, 테스트 전용 DB/schema/합성 데이터.
Runner 결과와 최종 현재 SHA 검증은 전체 실행 후 아래에 확정한다. 미실행/실패를 성공 수에 포함하지 않는다.
기존 DEV02 219개는 개수만 맞추는 대신 기존 source snapshot/assertion을 전부 보존하여 회귀한다.
0개/Skip/Todo/flaky는 CI 실패이며 tests/fixture/운영 credentials 대체 성공은 없다.

### C01–C35 연결

| 시나리오 | 실제 검증 위치 |
|---|---|
| C01–C03 | fault/catalog: 미인증401, Viewer/Operator 쓰기·관리403 |
| C04–C05 | catalog: warehouse scope — SQL 목록A만/상세B403/수정B403/위치B403/Global상품쓰기403 |
| C06–C07 | 없는warehouse404/FK거부/Administrator scoped·self 조작 거부 |
| C08,C29,C35 | 기존 세션 grant 회수 즉시403/서명cursor scope 변경400/Browser UI 반영 |
| C09–C10 | CSRF누락·변조/악성Origin403 |
| C11–C14 | Integration 동시 SKU/Barcode/창고code/mapping partial unique + 정규화409 |
| C15–C16,C32 | account/provider 혼동422/비활성SKU 신규mapping422/외부확인 위조400/로컬review 구분 |
| C17–C19 | 위치복합FK/간접cycle/동시API 및 directSQL 경쟁/계층rollback |
| C20 | 실제 version CAS 경쟁200/409, Browser stale 편집·입력 유지 |
| C21–C22 | 동시 같은key 같은결과/다른payload409/실제API프로세스 재시작 후 같은ID |
| C23 | 종료pool 안전실패, 기존 PG stop/start/timeout/auth 회귀 |
| C24–C25 | audit INSERT 실패 metadata/version/command_results rollback |
| C26 | Parameterized 검색/React persisted HTML escape/CSP/민감 로그 비노출 |
| C27–C30 | 잘못sort/변조cursor/변경filter·grant context400/limit101 거부·100실제page |
| C31 | inactive Warehouse 신규location422, catalogEligible 필요조건/재고0 주장 없음 |
| C33 | 실제Node API SIGTERM→새process→동일data/session/key결과→SIGINT |
| C34 | 실제Response 전달 지연 후 Logout/기존 다중탭·offline UI 복원 차단 |

F17은 로컬 매핑 FK/고유성/상태·검토 이력만 이번에 실증한다. 실제 Provider Event/자동 출고 차단은 DEV08/09,
F24 실제 출고 업무 승인·Telegram은 DEV07, F01–30 원장·물류·운영 장애는 담당 DEV의 NOT RUN을 유지한다.

### 발견·수정

- Drizzle 생성시각이 기존 migration 시각보다 작아 history 순서가 어긋남: 새 forward ID를 이전 ID 뒤로 지정하고 runner가 비증가 순서를 적용 전 거부하도록 보강했다. 기존 history/file hash 수정0.
- 생성 복합 FK가 대상 unique index보다 앞에 실행됨: 새 SQL의 생성 순서를 수정하고 실제PG upgrade/rollback/반복·동시실행을 재검증했다.
- 테스트 bootstrap 과거 TOTP step이 Argon2 처리 중 경계를 넘는 문제: 로컬 등록 코드를 수신 시각에 먼저 검증하고 해싱한다. 실제 로그인 MFA 시간창/replay 정책은 완화하지 않았다.
- 검토된 mapping 종료 때 증거 소실 위험: 종료 행의 검토자/시각/증거 version을 보존하고 모든 변경을 append-only snapshot으로 남긴다.
- Global role 편집이 scoped 역할을 Global로 복사할 위험: 기존 editor/projection/교체 SQL은 Global만 처리하고 Warehouse endpoint를 별도로 제공했다.
- Generic catalog flag를 미래 endpoint가 정책 우회에 쓰는 위험: 설치된 정확한 method/path 계약에만 resolved-scope UoW를 허용하며 미선언 endpoint 음성 테스트를 추가했다.
- 기존/신규 status 및 selector 이름 중복, 첫 페이지에 신규행이 있다고 가정한 Browser 실패: 안내를 구분하고 목적별 accessible name, 실제 검색으로 수정했다. 기존 assertion 삭제0.
- 긴 사용자 표시 이름 중복/레이아웃: 목록 heading은24문자 표시+전체 accessible label/title, 고유 login을 함께 유지한다. 계정 보안 화면의 전체 이름·React escaping 검증은 유지한다.

- Catalog revision JSONB 키 순서와 감사 digest 재계산 차이: Catalog snapshot을 UTC/키 정렬 canonical 문자열로 기존 AuditSink에 넘기고 실제 저장 JSONB로 digest를 재검증했다. 기존 인증 chain 형식은 변경하지 않는다.
- ASCII 코드 정규화 전에 Unicode를 거부해 ß/ı/ligature가 ASCII 별칭으로 합쳐지는 모호성을 차단했다.
- NUL을 포함한 이름 입력은 PostgreSQL 오류가 되기 전에 schema400으로 거부한다.

## 이전 요구사항 감사

R01 실제 master/50하한/60·120·1000/플랫폼코드 분리/검색·범위, R12 실제 UI/PWA/i18n,
R13 인증+실제창고scope, R19 AUTO01, R20 회귀·실패·문서·누락 감사, R21 공개repo/비밀/SQL·XSS·로그,
R22 단일PG/무료/경계, R24 최근 재인증, R25 모델·단계 규칙을 대조했다.
R02–R11 실제 원장·입출고·금전·메일·Bot·시장·보충·분석, R14–R17 장비/백업/자체창고실무,
R23 Provider 최신성·원본증거는 담당 DEV04–18에 남기며 본 단계에서 완료로 표시하지 않는다.
U00–U29 및 D01/D02/AUTO01 추적표를 보존하고 D03 전체 지시를 별도 연결한다.
Dot/paidAI/운영DB·실제고객/공급처/외부API 호출/운영배포0.

## 제약·롤백·DEV04

Windows/macOS/Pi5/ARM64 실장비/실제 모바일 장치/HTTPS 운영/7년 보존·복원 NOT RUN.
Chromium mobile emulation과 Linux 성능을 Pi 수치로 주장하지 않는다. 기존 native 의존성을 변경하지 않았다.
Migration 설치 role은 표준 pg_trgm 설치 권한이 필요하다. 운영 app/migration/backup 역할분리는 DEV12에서 실증한다.
작은 metadata mutation은 현재 짧은 공통 직렬화 lock이며 외부 I/O를 안에 넣지 않는다. live keyset은 snapshot isolation이 아니다.
매핑의 Provider 검증·원장·예약·수량·물류·결제는 미구현. DEV04는 stable SKU/Warehouse UUID FK와 실제상태/권한을 같은 UoW에서 재검사해야 한다.
첫 원장 참조부터 SKU code 변경도 차단하도록 guard를 확장한다. reviewed local mapping을 출고 근거로 쓰면 안 된다.
롤백은 검증된 revert/호환 forward PR, 자동 DB DROP/down/reset/history복구 금지. main merge는 배포가 아니다.
Branch protection 없는 자기수정 CI의 완전 보안을 보장하지 않는 기존 제약을 유지한다.

## GitHub

Commit/PR/Quality/Independent/Guarded/실제 main SHA는 실행 후 현재 증거로만 기록한다. 아직 병합됐다고 주장하지 않는다.

## 확정 로컬 실행 결과

| 검사 | 실제 결과 |
|---|---|
| Unit | 75 passed / failed0 / skipped0 |
| PostgreSQL Integration | 47 passed / failed0 / skipped0 |
| Security / Failure | 51 passed / failed0 / skipped0 |
| Desktop + Mobile Chromium E2E | 64 passed / failed0 / skipped0 / flaky0 |
| Python 정책·독립 검증 계약 | 77 passed / failed0 / skipped0 |

합계314개 고유 runner 테스트 통과. 이후 원격의 현재 HEAD 재검증과 혼동하지 않는다.
기존 DEV02 219개 assertion/source snapshot과 기존 CI 세 단계/토큰 권한을 보존했다.
Frozen lock install, audit(알려진 취약점0), lint/typecheck/build/경계, actual dev migration,
Drizzle generate 차이0, docs/public scanner, actionlint/bash 구문을 실행했다.
README의 dev:api/dev:worker/dev:web를 실제 시작해200/200/200, 비인증 users401/CSP를 확인하고 자신의 프로세스만 종료했다.
웹 번들에 실제 로컬 암호화 키가 없는 검사 통과. 새 패키지는 내부 domain dependency뿐이며 유료/외부SDK 추가0.
실제Browser UI를 확인했고 mobile horizontal table/키보드/취소된 이동의 입력 보존을 검증했다.

초기 Browser status/selector 중복, 이전 페이지 위치 가정, 공유 합성 데이터 간 같은 barcode/표시명 충돌로 실패한 실행은
수정 전 결과이며 성공 수에 포함하지 않았다. 합성 데이터는 시나리오별 고유 식별자를 사용하고 실제 성공을 다시 확인했다.
일시적 exec-server transport disconnect는 read-only 확인 중 발생했으며 복구 후 파일·DB 상태와 완료 runner 결과를 재확인했다.

## 원격 증거 확인 경로

[DEV03 실제 PR](https://github.com/Raccoon26/Project-WMS/pulls?q=is%3Apr+head%3Adev%2Fdev-03-catalog-warehouses)에서
현재 HEAD의 Quality→Independent→Guarded 및 실제 merged commit을 확인한다.
이 원본 보고는 PR 생성 전 작성되며 미래의 run ID/merge SHA를 만들어 기재하지 않는다.
정확한 최종 PR URL/실행 SHA/Actions URL/실제 main SHA는 해당 PR 본문과 작업 최종 보고로 연결한다.
main merge는 Raspberry Pi 배포/실제 재고·출고 실행을 의미하지 않는다.

## 규모별 실제 측정 (Pi 실측 아님)

Linux x64 / AMD EPYC9V74 / availableParallelism4 / host reported RAM34088MiB.
Fastify inject+실제PG, 검색20회/각 규모, 목록순회1–10페이지, 별도4동시 요청 성공.

| SKU | 목록 페이지 | 평균ms | 목록p95ms | 검색평균ms | 검색p95ms | 공유 test RSS MiB |
|---|---:|---:|---:|---:|---:|---:|
| 60 | 1 | 9.56 | 9.56 | 6.99 | 8.39 | 241.1 |
| 120 | 2 | 7.75 | 8.12 | 6.90 | 9.26 | 241.3 |
| 1000 | 10 | 8.64 | 11.18 | 8.17 | 9.94 | 245.6 |

raw EXPLAIN/측정은 ignored test-results/catalog-*.json 및 CI artifact에 보존한다.
SKU code 정렬은 B-tree 계획을 사용하며 작은1000행 substring 검색은 planner가 Seq Scan을 선택할 수 있다.
실제 GIN/B-tree/active mapping unique index 존재도 PG로 확인했다. 강제로 index를 쓰게 해 성능을 꾸미지 않았다.
RSS는 Vitest/API 공유 프로세스이며 독립 운영 API/Pi 메모리 성과로 해석하지 않는다. 대량 원장 이력은 DEV04/11/14에 남는다.

## 이전 main의 로컬 독립 검증 완료

별도 git archive 합성 checkout에서 ad3aa1b main의 검증기를 실제 실행했다. 기존 baseline/auth snapshot과
검사 명령을 main에서 복원한 뒤 candidate Python77 + main 회귀77, Unit75/실제PG47/Failure51/Browser64,
frozen install/audit/boundary/lint/typecheck/migration/build/docs/secret 모두 성공했다.
실제6 Catalog case와3 Auth case가 증거 JSON에 존재하며 Skip/Todo/flaky0.
local PR0/합성 SHA는 GitHub 원격 실행 또는 병합 증거로 사용하지 않는다.
새 catalog test-only registry는 다음 main 실행에서 동일한 Catalog assertion과 합성 import guard를 보존한다.
기존 verification-baseline/auth-transition/auth 파일과 workflow 권한은 byte-for-byte 유지했다.
