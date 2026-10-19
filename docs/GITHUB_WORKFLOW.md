# GitHub 개발 자동화 — AUTO-01

최신 사용자 지시: **모든 변경 유형은 필수 자동 검증 성공 시 승인 없이 squash merge**한다.
위험 경로만으로 수동 승인/Draft를 요구하지 않는다. owner review/승인 label/SHA comment를 요구하거나 생성하지 않는다.
이전 승인 정책은 이력이며 현재 규칙으로 사용하지 않는다. 실제 적용 SHA/run/PR 상태는 상태 문서와 AUTO-01 보고에 기록한다.

## 개발 흐름

1. 최신 main과 기존 DEV branch/PR 확인, 기존 작업 보존. 직접 main push/force push 금지.
2. 구현·self review·로컬 테스트·회귀·보안·이전 요구 감사·문서화 완료 후 commit/push.
3. `bash scripts/create-dev-pr.sh DEV-XX 'Topic'`는 기존 PR을 재사용하고 신규 PR은 일반 PR로 만든다.
4. `docs/automation-completion.json`: 해당 DEV와 implementation/selfReview/regression/security/requirementsAudit/documentation을
   실제 완료 때만 true. 작업 시작 시 새 DEV/false로 초기화한다. 선언은 CI 대체나 사용자 승인 메시지가 아니다.
5. `WMS PR CI`가 실제 코드를 검사한다. 성공 시 main의 `WMS Independent Verification`이 별도 읽기 전용 job에서 검사한다.
6. 독립 검증 성공 후 trusted main `WMS Guarded Auto Merge`가 현재 HEAD/base/증거/상태를 검증한다.
   완료된 기존 Draft는 자동 Ready로 전환하고 다시 상태를 확인한다. 미완료 Draft는 `NOT_READY`로 유지한다.
7. 모든 조건 충족 시 SHA precondition squash merge. 실제 PR merged 여부/main commit을 확인한다. 운영 배포는 하지 않는다.

## 변경 영역별 검사

| 영역 | 필수 검증 |
|---|---|
| UI/API/Worker 일반 기반 | Typecheck/lint/build/unit/실제PG integration/fault/browser, 입력/오류/종료/재시작 |
| DB migration | 실제 PG 적용·동시/반복실행·보존·rollback·checksum 변조 감지 |
| 재고/예약/물류 | 불변식·동시성·중복/idempotency·rollback·상태/증거 검증 |
| 인증/권한 | 권한 상승·세션·CSRF 및 관련 보안 |
| 메일/외부 연동/승인/금전/복구 | timeout/unknown/중복/서명/정확 계산/복원 등 담당 DEV suite |
| CI/병합/설정/infra | Python 정책 회귀·권한/필수명령/독립 baseline 호환성·actionlint·shell·secret |

분류는 수동 승인 여부가 아니라 강화검사 선택에만 사용한다. DEV02에서 migration과 auth의 실제 suite를 구현했다.
재고/email/approval/money/recovery/integration 등은 아직 해당 업무 suite가 없어 **필수 테스트 누락으로 차단**한다.
담당 DEV에서 실제 case와 main-owned 계약을 함께 설치하고 이전 검증기로 호환성을 통과해야 한다.
예상 case 이름/모사 성공은 실제 업무 검증을 대신하지 않는다. 60 synthetic SKU fixture 유지, 물류 F01–30은 미실행.

## 독립 검증과 신뢰 경계

- PR CI: pull_request, contents read, 운영 secret 없음.
- 독립 검증: **workflow_run**, workflow 정의와 검사기는 main 소유. 코드 실행 job은 contents read만 사용한다.
  PR 코드를 실행하지만 쓰기 token/운영 secret을 주지 않는다. checkout persist-credentials=false.
- 이전 main의 Python 회귀 테스트, 필수 runner/config, `scripts/verification-baseline.json`의 DEV01 기준선을 사용한다.
  PR의 테스트를 먼저 실행하고 main의 기존 assertion/runner를 덮어 적용해 실제 검증을 다시 한다.
  기존 baseline 삭제/약화, 필수 명령 삭제, Secret 접근, 권한 상승, privileged PR checkout/명령 변경을 차단한다.
- 권한 높은 merge workflow는 main 코드만 실행한다. PR 코드/artifact는 실행하지 않고 bounded JSON만 파싱한다.
  ZIP 최대2MB/JSON1MB/고정 member명, extract/import 금지. artifacts의 출처 run/attempt/PR/head/base를 확인한다.
- 공식 workflow ID/path/event/job/필수 step 성공과 최신 companion Quality run/attempt를 확인한다.
  CI green만 보지 않고 nonzero/no-fail/no-skip/no-todo/no-flaky 실제 suite와 필요한 case를 확인한다.
- runner/workflow 변경도 이전 검사기와 기존 safety contract를 통과하면 자동 병합 가능하다.
  독립 검증 불가능한 변경은 원인을 검사 실패로 보고하며 사용자 승인 부족으로 바꾸지 않는다.

A/B/C는 검사 강도를 위한 표시이며 어떤 tier에도 수동 승인 veto가 없다. 미분류 코드도 공통 독립검증을 거친다.
경로 분류가 코드 의미를 완벽히 증명하지는 않는다. 업무를 다른 이름의 파일에 숨기는 우회는 금지하며 self review를 유지한다.
일반 CI처럼 악의적인 repository 소유자의 모든 실행권한을 격리하는 형식 증명은 아니다.
**Branch Protection 없이 자기 수정 CI의 완전한 보안을 보장하지 않는다.**

## 상태·경합·재실행

Metadata 구조 오류(branch/title/repo/fork/금지파일/불완전 diff/rename)는 FAIL이다.
Draft/미완료는 NOT_READY(정상 종료)이며 metadata의 mergeAllowed는 항상 false다.
실제 필수 검사 실패/누락/0/skip/취소/불명은 병합 불가다. 수동 review/승인 label/comment는 검사하지 않는다.
명시적 hold/do-not-merge는 긴급 중단 수단으로 유지하며 필수 승인이 아니다.

HEAD 또는 main 변경 시 증거를 재사용하지 않는다. 자동 controller를 하나의 main concurrency group으로 직렬화하고
Ready/merge 직전 head/main을 재조회한다. stale base는 최신 main을 DEV branch에 정상 merge해 새 CI를 유발한다.
Codex는 stale base를 발견하면 정상 merge/재검증을 최대2회 시도하고 지속 경합은 원인을 보고한다. controller는 이벤트당 한 번만 평가하며 무한 재시도/자동 재실행을 하지 않는다. 실패 이유를 해결한 새 commit이 재검증 trigger다.
GitHub REST `sha`는 HEAD에만 원자적이며 base CAS가 없다. 마지막 조회 직후 외부 writer가 main을 바꾸는 경쟁까지
원자적으로 차단한다고 보장하지 않는다. 직접 main push 금지/수동 병합과 동시 실행 금지. 서버 강제는 선택 merge queue/보호로 검토한다.
권한 오류는 실패이며 보호 조회403은 현 Actions 모드의 필수 전제가 아니다.

## 레거시와 이벤트 호환성

`enable-safe-auto-merge.sh`/`merge_gate.py`는 사용되지 않는 선택 native-protection helper로만 보존한다.
현재 controller는 호출하지 않는다. legacy 검사에서도 경로별 owner 승인 조건은 제거했다.
기존 main의 구 Policy 실패는 최초 전환 보고에 보존하되 새 규칙의 실행 결과와 혼동하지 않는다.

공식 [이벤트 문서](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows),
[보안 문서](https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions) 확인.
workflow_run은 기본 브랜치 workflow 정의와 권한 상승 가능성에 주의하고 chain을 CI→독립검증→병합 3단계로 제한한다.
[2026-09-17 공식 공지](https://github.blog/changelog/2026-09-17-workflow-execution-protections-in-github-actions-generally-available)에서
공개 저장소의 기존 기본 pull_request_target 정책을 사용하던 대상에 2026-11-02 default rule enforcement가 적용됨을 확인했다.
이 구현은 **해당 이벤트 의존성을 제거**했으며 allow-unsafe-pr-checkout opt-out을 사용하지 않는다.
Policy는 읽기 전용 pull_request+base checkout이며 병합 허가의 단독 근거가 아니다.

main merge ≠ Raspberry Pi 배포. 재고/출고/결제 업무의 승인·불변식·백업·별도 운영배포 통제는 그대로다.

## 인증 기준선 전환

PR9는 기존 verification-baseline.json을 보존하고 verification-auth-transition.json을 main에 설치했다.
인증 후보에서는 기존 화면 assertion을 실제 CSRF/비밀번호/TOTP 로그인 후 실행하고 migration 수는 manifest로 검증한다.
DEV02의 verification-auth.json은 새 인증 suite/합성 fixture만 보관한다. 구현 코드 overlay·경로 탈출은 차단한다.
현재 auth profile은 실제 실행된 `auth: privilege escalation` / `auth: session` / `auth: CSRF`를 요구한다.
실제 물류/승인 안전 테스트가 설치된 것으로 간주하지 않으며 AUTO-01 세 workflow/권한/자동병합 정책은 유지한다.

## DEV03 현재 구현

DEV03은 기존 main-owned 인증/DEV01 snapshot을 byte-for-byte 보존한다. catalog profile은 실제 unique sku/warehouse scope/mapping integrity/optimistic concurrency/transaction rollback/cursor pagination runner case를 요구한다. Catalog와 재고 profile은 별개이며 원장 경로의 검증을 약화시키지 않는다. 새 Catalog 테스트/합성 import는 verification-catalog.json의 test-only registry에 보존한다. 새 catalog_preflight는 기존 snapshot 삭제·약화/앱 overlay/경로 탈출/과대 크기를 거부하며 이전 main의 모든 인증 검증을 유지한다. workflow 권한/3단계 구조/병합 조건은 변경하지 않는다.
[Catalog 상세 계약](CATALOG.md). 실제 결과는 [DEV03 보고](dev-reports/DEV-03.md)에서 확인한다.

## DEV04 불변 안전 기준선 확장

기존 Foundation/Auth/Catalog/Python runner와 workflow chain은 그대로 유지한다. `verification-inventory.json`은 tests/ 및 엄격한 test-only inventory-fixture.ts만 포함하며 main-owned verifier가 기존 assertion 삭제/약화·앱 코드 overlay·경로 탈출·누락파일을 차단한다. Inventory Profile의 다섯 제목은 실제 PG 원장·예약·경합·Rollback·증거 Assertion을 실행한 Runner 증거와 대응한다. Optional 대량이력 프로파일은 실제 실행 결과를 별도로 보고하고 필수 CI suite 실행 수에 포함하지 않는다. 수동 승인/label/comment/Draft 강제나 자동 운영 배포를 추가하지 않는다.
