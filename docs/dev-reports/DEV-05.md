# DEV-05 단계별 진행 보고

## DEV-05-1 — 문서 기반·DB·아키텍처

2026-10-19 JST. **DEV05 전체 미완료 / PR·자동 병합 미시작**. 최신 단계 지시에 따라 DEV05-1만 구현하고 Commit·Push까지만 수행한다. Completion Manifest의 DEV는 DEV-05이고 여섯 완료 항목은 모두 false다. DEV05-2가 같은 branch에서 이어간다.

시작 main `63c6ec602b640937ee915778b332727ffaeb1729`, clean main/열린 PR0/기존 DEV05 branch0을 실제 조회했다. `dev/dev-05-document-templates`를 생성했다. 기존 DEV04 구현/코드/데이터/0000–0011 Migration/검증 기준선을 보존한다. [아키텍처·테이블·잠금·복구·DEV06 참조 계약](../DOCUMENTS.md).

### 구현

1. 기존 Outbound/OutboundLine/Reservation/ShipmentLine/SKU/Product/Warehouse를 실제 조회하는 PostgresSnapshotBuilder. bigint 수량/version은 문자열, UTC 시각은 DB에서 캡처한다. 별도 가짜 Outbound 테이블은 없다.
2. TemplateRenderer/SnapshotBuilder/ArtifactStore/DocumentReference 공유 port. Renderer/Store는 명시적인 interface이며 빈 성공 구현으로 대체하지 않는다. 실제 렌더링/파일 I/O/HTTP endpoint는 아직 없다.
3. data-only Sample instruction/manifest 정의, ja/ko/en 제목·footer·고정 Sample watermark와 allowlist column 계약. 실제 업체 양식은 확보/구현했다고 표시하지 않는다.
4. 내부 DocumentService registerTemplate/recordSnapshot/read: 기존 AuthService UoW, 완전 MFA·현재 Permission/양쪽 Warehouse Scope·CSRF/Origin·actor/key/Version·Audit·command_results 통합.
5. 문서/Line/Source canonical Snapshot/SHA-256·템플릿 version 불변, 원자료의 FK·관계·수량 및 native PG hash 대조, 생성 트랜잭션 이후 자식 추가 차단. content_version은 Outbound lock 아래 연속 부여한다.
6. Artifact pending/staged/ready/missing/corrupt/failed·확정 hash/size/renderer 불변·revision CAS·상태별 Event 강제. 문서 상태는 둘의 집계다. 실제 파일이 없는 stage1 Artifact는 pending/hash NULL이다.
7. 파일과 DB 비원자성의 orphan/staged/누락/변조/정확 byte 복원 격리 계약. Sample DocumentReference는 발송 승인이나 capability가 아니고 dispatchable=false다.
8. 문서 기록 전후 원장/잔액/예약/Outbounds/Inbound/Shipment/Receipt/기존 Outbox 전체를 실제 비교해 무변경을 검증한다. 문서/Audit/command 결과는 같은 tx이며 감사 실패 시 전체 Rollback한다.

### Forward Migration

- `0012_strong_dragon_man.sql`: 7개 실제 테이블, PK/FK/unique/CHECK/native SHA/불변성/원자료 검증/commit 완전성/Artifact Event·상태 guard·조회/FK index.
- `0013_document_snapshot_types.sql`: 적용된0012를 고치지 않고 JSON string quantity/boolean/schema version/시각 및 Source shape를 보강하는 신규 Forward Migration. SQL CHECK의 NULL 통과를 IS TRUE로 막는다.
- 기존0000–0011 SQL/snapshot/journal prefix 보존. Drizzle은 컬럼/기본 FK/PK/unique, custom SQL은 CHECK/trigger/index를 소유한다. 생성기 재실행에서 schema drift 없음도 확인한다.

### 실제 검증 기록

최종 로컬 Runner: **Unit145 / 실제 PostgreSQL Integration106 / 기존 Security·Failure70 / Desktop·Mobile Browser82 / Python Policy81 = 고유484 passed, failed/skipped/todo/flaky0**. 별도 불변식30개는 Integration과 겹치는 재실행이므로 고유 수에 중복 합산하지 않는다. 이전423개 assertion을 보존하고61개 검증을 추가했다. 새 문서 관련 보안 음성/감사 rollback/타입/FK 검증은 실제 PG Integration에 포함하며 Failure70과 이중 집계하지 않는다.

최종 Unit145/Integration106은 마지막 문서 Source bound/stale 보강 이후 재실행했다. Failure70/Browser82는 동일0013 Schema와 변경 없는 기존 HTTP/UI 경로·보정된 날짜 fixture에서 통과했으며 마지막 변경은 아직 HTTP에 등록하지 않은 문서 내부 port에 한정되어 유효한 회귀 증거로 재사용한다. 마지막 Lint/Typecheck/Boundaries/Build도 통과했다.

`pnpm install --frozen-lockfile`, `pnpm audit --audit-level high`(알려진 취약점 없음), `pnpm db:migrate:test`, dev `pnpm db:migrate`, 모든 필수 test 명령과 `pnpm test:invariants`, Drizzle schema 생성 재검사(No schema changes), actionlint/YAML/Shell 구문/문서 링크/공개 Secret 패턴/`git diff --check`를 실제 실행했다. Startup doctor는 API200/Worker200/Web200/익명 users401/CSP를 확인하고 task 소유 프로세스만 종료했다. 운영 DB 초기화/볼륨 삭제 없음.

[비민감 실제 결과·소스 지문](../evidence/DEV-05-1-tests.json). 원 Runner JSON과 실패 재현은 ignored test-results에 남긴다. 초기 타입 재현4 fail→Forward0013 후4 pass, 초기 Browser79 pass/1 fail→입력 보정 후82 pass를 구분한다. PR/Quality CI/Independent/Guarded/병합은 **NOT RUN(단계 지시상 PR 미생성)**이다. 정적/로컬 성공을 원격 CI 성공으로 표시하지 않는다.

새 테스트: document unit/plain-data validation/hash/sample dispatch deny; actual PG Snapshot/재고 무변경/100→95→93/내용·템플릿 버전/멱등·2 actor 경합/권한·Scope·MFA·CSRF/감사 실패 rollback/Builder 위조/불변성/실제 FK/큰 정수/Artifact 메타데이터 상태·revision·Event·복구 전이. Upgrade tests는0000–0011의 실제 사용자·60SKU 보존/동시·반복 적용/hash 변조 거부/실패 migration rollback을 실행한다.

Artifact 테스트는 **DB 메타데이터 계약** 검증이며 실제 XLSX/PDF/파일 복원 증거가 아니다. 실제 file parser/뷰어·문서 Browser E2E·저장소 crash/disk-full/파일 복구는 NOT RUN, DEV05-2 이후 담당이다. 기존 UI 회귀와 신규 문서 UI 검증은 구분한다.

### Self Review와 수정

- SQL CHECK의 NULL 의미를 명시 IS TRUE로 닫고 필수 JSON 필드를 검사했다.
- Snapshot의 숫자/문자열 또는 boolean/string을 ->> 비교만으로 혼동할 수 있는 방어층 누락을 발견했다. 위조 Builder의4개 실제 실패 재현 후 적용된0012를 변경하지 않는0013으로 보강했고 같은4개가 통과했다.
- 일부 Artifact만 ready일 때 document를 pending 대신 rendering으로 파생하도록 수정했다.
- 잠금 순서를 SKU UUID 기준으로 정렬하고 read 시 canonical/hash를 다시 검증한다.
- Unit의 control-character 정규식이 Lint에 걸려 code-point 검사로 바꿨다. lint 규칙을 비활성화하지 않았다.
- 초기 전체 Browser 회귀는79 pass/1 fail이었다. 원인은 Chromium datetime-local이 `.610`을 `.61`로 정규화하고 Playwright fill이 원문과 비교하는 기존 fixture 문제였다. 기존 재고 Assertion은 모두 보존하고 입력 표현만 canonical로 보정했다. `.000`/0초 경계도 다루며 반올림·clock 조작·Skip·retry는 없다. 실제 DOM parser 회귀와 exact-millisecond Unit을 추가했다.
- 현재 main의 verification-inventory.json 등 기존5개 registry는 변경하지 않는다. 다음 전체 DEV05 독립 검증에서는 날짜 fixture의 동일 Assertion 보존·새 helper 포함을 test-only 기준선에 정식 반영/검증해야 한다. 현재 단계에는 PR/원격 CI가 없으며 이 호환성을 완료로 주장하지 않는다.
- Receipt는 Outbound header version을 올리지 않으므로 read 시 source 수량/label/관계 및 template/SKU/Product/Warehouse 활성 상태까지 대조하여 stale을 판단한다. 이전 Snapshot은 변경하지 않는다.
- Source materialization은5001행까지만 읽어5000행 초과를413으로 거부한다. 실제 PG 소규모 Snapshot 회귀와 별도 dependency-double Unit으로 한도를 검증하며,5000행 실DB/파일 성능 수용 테스트를 했다고 주장하지 않는다.

### 이전 요구사항 감사

R01–R25/U00–U29 기준선과 DEV00–04/AUTO01 보고·현재 코드를 확인했다. R04는 Snapshot/DB/Port 부분 구현이며 renderer/store/preview/download/UI/실제 업체 template는 후속이다. R02/R03는 생성 전후 실제 stock digest 및 기존 불변식 회귀로 보호한다. R13 기존 보안/권한/Audit 경계를 재사용하며 신규 공개 무인증 경로가 없다. R19 최신 사용자 stage 정책대로 Commit/Push만 하며 AUTO01/workflow/merge 코드는 바꾸지 않는다. R20 실제 PG/실패/회귀를 실행하고 미실행을 구분한다. R21 public Secret/운영 데이터 금지, R22 외부 의존성 추가0/단일PG/유료AI0, R23 실제 source/partial Snapshot 계약을 유지한다.

이전 trace의 DEV04 '검증 중' 표기는 실제 PR13/14 병합 이력과 구분하여 보완한다. 과거 보고서를 삭제하거나 과거 결과를 현재 운영 완료로 바꾸지 않는다. 실제 메일/승인/marketplace/금전/운영백업/Pi/자체창고/Dot는 담당 DEV의 미구현·미검증 범위를 유지한다. 실행 모델/effort를 확인할 API는 없으므로 검증했다고 주장하지 않는다.

### 다음 단계 인계

- 같은 branch와 실제 UUID/FK/Port/DB를 재사용한다. DocumentService는 아직 HTTP 라우트에 등록하지 않았다.
- 다음 단계에서 실 Renderer/ArtifactStore, 권한을 선언한 strict HTTP adapter, no-store preview/download/history와 일본어/ko/en/mobile UI를 구현한다.
- 실제 XLSX/PDF를 열어 수량·한글/일문 글꼴·워터마크·수식/위험 콘텐츠·미리보기·다운로드를 독립 검증한다. filesystem race/symlink/permission/중복 publish/orphan/kill/hash corruption/exact restore 테스트가 필요하다.
- 최종 DEV05 단계에서 새로운 문서 안전 suite/적절한 test-only main-owned 기준선을 설치하고 기존 AUTO01 독립 검증을 유지한다. 기존 기준선/Assertion을 지우지 않는다.
- DEV05 전체 완료 후에만 Completion Manifest를 사실대로 갱신하고 PR/CI/Independent/Guarded/자동 병합을 진행한다. 현재 단계에서는 PR을 만들지 않는다.
- 운영 파일 root·권한·암호화/DB+파일 백업·실제 Pi/Windows/macOS/ARM64 검증은 아직 미실행이다. GitHub Push는 운영 배포가 아니다.

### Commit·Push 인계

구현·수정·검증·문서 변경을 이 단계 branch에 commit/push한다. 실제 최종 commit SHA 및 원격 branch SHA 일치는 종료 보고와 Git 이력으로 확인한다. PR 생성 helper는 호출하지 않으며 main은 DEV04의 기준 SHA를 유지해야 한다. 전체 DEV05 완료·main 반영·실제 파일 생성·운영 배포를 선언하지 않는다.

## DEV-05-2 — 템플릿 Manifest·Snapshot·부분 출고

2026-10-19 JST. stage1 commit `fe8bf337d01310172c219ba36a32518b9505862c`의 clean tree/같은 원격 branch를 확인했다. 실제 main은 계속 `63c6ec602b640937ee915778b332727ffaeb1729`, 열린 PR0, 이 DEV branch Actions0이었다. 이미 완료한 stage1/DEV00–04 구현을 보존하며 같은 branch를 사용한다. 최신 분할 지시를 우선해 본 단계는 **Commit·Push까지만 수행**한다. 위 stage1의 '다음 단계 renderer' 안내는 당시 계획 이력이며, 현재 renderer/store/UI 담당은 DEV05-3이다.

### 구현과 안전 경계

- instruction/manifest × xlsx/pdf, 일본어 기본 Sample Manifest4종. ja/ko/en 제목/안내·고정 watermark·명시적 schema version/형식/kind·A4/여백/방향/글꼴·크기·색상 allowlist.
- 13개 필수 필드와 정확한 source mapping. 누락/중복/unknown 필드·임의 JS/Shell/HTML/remote URL·style 코드를 거부한다. 실제 업체 공식 양식/승인/발송 권한은 없다.
- 기존 template version/hash·append-only DB 규칙을 재사용한다. 새 버전은 신규 row이며 사용된 버전뿐 아니라 모든 버전 UPDATE/DELETE를 차단한다.
- 기존 실제 Outbound/SKU/Product/양쪽 Warehouse/Reservation/ShipmentLine을 읽어 사실 수량을 고정한다. 클라이언트 header의 SKU/이름/수량/창고 덮어쓰기를 거부한다. 부분 선택은 실제 line ID+canonical decimal string 또는 실제 ShipmentLine ID만 받고 실제 수량 상한을 확인한다.
- `documentQuantities`에 목적·선택 ShipmentLine·이번 수량을 별도로 저장/hash한다. instruction=min(미출고,미해소 예약)이 기본값이며 부분 선택 가능. manifest는 선택한 확인된 출고의 명세이며 출고 지시가 아니다. BigInt/string만 사용한다.
- 100→95→93 실DB 사례: 요청100/취소0/미출고5/예약잔량5/이미출고95/Transit2/수령93; 새 instruction 수량5, 과거95를 선택한 manifest 수량95. 생성 전후 원장·잔액·예약·Shipment·Receipt·Outbox는 실제 전체 digest가 같다.
- Outbound CAS/현재 Auth·Scope·MFA·CSRF/Origin/명령 멱등/동일 tx Audit를 유지한다. 이전 Snapshot은 그대로 보존하고 새 source/template에 새 content version을 부여한다. 비활성 source 또는 현재 eligibility 상실은 역사 조회에서 stale이며 신규 지시를 차단한다.
- 신규 Forward `0014_document_manifests.sql`만 추가한다. 기존0000–0013 SQL과 journal의 첫14항목은 byte/값 비교로 보존을 확인했다. 실제 source와 이번 수량/선택/Manifest 형식의 DB 독립 검증을 추가한다. 기존 문서의 pending Artifact2개, 신규 형식 고정 문서의 pending Artifact1개를 모두 검증한다. 실제 파일 hash/size는 여전히 NULL이다.

### Self Review·오류 수정

- 신규 SQL의 JSON 연산자 우선순위 오류를 실제 PostgreSQL Migration 실패에서 발견하고, 영구 적용 전 괄호로 수정했다. 기존 Migration은 수정하지 않았으며 실패한 Migration은 rollback됐다.
- 초기에 새 테스트의 fixture cleanup 이름/기존 Outbound line 집합 편집 제한/중복 opening 제약을 잘못 사용했다. 기존 업무 제약을 완화하지 않고 올바른 cleanup과 새 실제 SKU/Outbound 생성 절차로 테스트를 고쳤다.
- 중간 전체 PG 실행은121 passed/1 failed였다. 비활성 SKU를 DB는 차단했으나 application port의409 계약도 확인해야 함을 보강했다. 현재 instruction eligibility 검사와 역사 read의 stale 처리 후 신규16개 및 전체 PG122개를 재실행해 통과했다.
- 위조 Builder가 진짜 SHA를 계산하더라도 초과/Number/전체0/중복/외부 line/purpose 변경은 DB23514로 rollback한다. 템플릿/문서 변경만으로 재고 작업을 호출하는 코드는 추가하지 않았다.
- 새 Manifest의 이번 수량이 legacy columns에 묻히지 않도록 향후 renderer는 Manifest fields를 사용하도록 계약을 명시했다. Manifest 없는 과거 Snapshot에 출고량을 추론해서 채워 넣지 않는다.

### 실제 검증 및 감사

최종 Runner 수와 후속 제한은 아래 검증 종료 기록을 따른다. 코드 생성/문서 작성/정적 검사를 실제 파일 생성이나 문서 UI 테스트로 간주하지 않는다. 기존 R01–R25/U00–U29, DEV00–04/AUTO01의 핵심 경계를 재검토했다. R04는 템플릿 계획·Snapshot까지 부분 구현이며, R02/R03 원장·예약·수량은 무변경 비교/기존 불변식 회귀로 보호한다. R13은 기존 서버 권한·MFA·Scope·CSRF·감사 tx를 재사용한다. R19는 이번 단계 PR 금지에 따라 Commit·Push만 하며 AUTO01 코드/5개 registry/완료 Manifest를 변경하지 않는다. 최소50 SKU는 상한이 아니며 기존50 동시/60·120·1000 실제 PG 검증을 유지한다. 새 유료 의존성/Dot/외부 발송/운영 배포는0이다.

### DEV05-3 인계·미구현

같은 branch의 신규 Manifest/선택/Snapshot·native PG 제약을 재사용한다. 실제 XLSX/PDF renderer, 폰트·수식 주입/PDF 위험 콘텐츠 검사, ArtifactStore(실제 hash/byte·crash·symlink·disk-full·복원), 권한 선언 HTTP/preview/download/history, 문서 일본어/ko/en/mobile UI와 그 Browser E2E는 **미구현/NOT RUN**이다. 현재4종은 선언형 템플릿 계획이며 XLSX/PDF bytes가 아니다. 기존 UI 회귀82개와 문서 UI 테스트를 혼동하지 않는다.

전체 DEV05의 Completion Manifest는 여섯 항목 모두 false를 유지한다. 현재 단계에서는 PR/Quality CI/Independent/Guarded/자동 병합/운영 배포를 시작하지 않는다. stage1 datetime 입력 보정의 독립 기준선 호환성은 전체 DEV05 PR 전에 별도로 검증해야 하며 기존 검증을 끄거나 Assertion을 삭제하지 않는다. 운영 파일 보존/암호화·7년/실제 Pi·Windows/macOS/ARM64 파일 검증은 해당 후속 단계의 NOT RUN으로 유지한다.

### DEV05-2 검증 종료 기록

최종 고유 **532 passed / failed·skipped·todo·flaky0**:

| 실행 명령 | 실제 결과 |
|---|---:|
| pnpm test:unit | 177 passed |
| pnpm test:integration | 실제 PostgreSQL17, 122 passed |
| pnpm test:failures | Security/Failure70 passed |
| pnpm test:e2e | Desktop/Mobile82 passed, flaky0 |
| PYTHONPATH=scripts python3 scripts/run_policy_tests.py | Policy81 passed |

신규32 Unit+16 실제 PG, 총48개를 추가했다. 별도 targeted16 재실행은 전체122에 포함되므로 중복 합산하지 않는다. 기존 DEV01–04/Auth/Catalog/Inventory 회귀·50 SKU 동시 갱신 및60/120/1000 SKU 실제 PG를 포함한다. 문서-specific 보안 음성은 PG16 안에 포함하며 Failure70에 중복 집계하지 않는다. Browser82는 기존 실제 WMS80+native datetime2이며 신규 문서 UI/렌더 검증은 아니다.

Lint/Typecheck/모듈 경계/Production Build 통과. 테스트·개발 DB의0014 Migration 각각 적용·반복 실행 통과, Drizzle 생성 재검사 No schema changes. startup doctor는 실제 API readiness200/Worker readiness200/Web200/익명 users401/CSP를 확인하고 해당 프로세스를 종료했다. 의존 추가/lockfile 변경0, audit 알려진 취약점 없음. 문서 링크·Secret/금지 파일·actionlint·Shell 구문·diff whitespace 검사도 통과했다. 과거 Migration14개와 journal prefix 및5개 독립 registry 불변을 실제 비교했다.

[최종 Runner 수·원자료 수량 증거·소스 SHA-256](../evidence/DEV-05-2-tests.json). ignored test-results에는 실제 Runner JSON이 있다. PR/Quality CI/Independent/Guarded/병합은 **NOT RUN(사용자 지시상 PR 금지)**이며 GitHub Actions 성공으로 추정하지 않는다. 전체 DEV05 미완료·Completion Manifest false, stage2 Commit/Push SHA는 최종 응답과 실제 Git 이력으로 확인한다. main 반영·운영 배포는 없다.
