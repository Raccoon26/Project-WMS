# DEV-00 결과 보고

상태: **IN PROGRESS / REVIEW_PENDING**. 설계와 로컬 도구를 보완했으며 bootstrap 수동검토/병합이 남았다.
최신지시(2026-10-16) 기준; DEV00 기능설계를 구현 완료로 표시하지 않는다.

## 구현/설계 범위
요구25그룹+사용자30섹션 추적, 19필수문서와 모듈 port, DB PK/FK/unique/check/원장/lock/정확금액,
상태·수량/100→95→93/unknown email/approval hash/epoch복원, DEV00–18/FINAL/AI01 로드맵.
60 synthetic SKU fixture(50/60/120 재현 검증), 30장애 NOT RUN 명세, 비용·권한 제한·ARM64 설계.
GitHub current-SHA/check-app/보호/rename·pagination 안전도구 및 테스트, public 파일/known-secret-pattern 검사.

## 실제 실행 증거
로컬 검증 집계 및 관측된 원격 결과는 아래와 같다. 운영 WMS 테스트는 NOT RUN이며 현재 코드가 없다.
원격최신 main=b021a81624cf2221e257eb772a550e648896cf4d;
기존 PR head=78d77cebc576ae355a6ebf7badfb543fa74ac845, Open/Draft/미병합/기존 Quality SUCCESS 확인.
GitHub API repo Public/allow_auto_merge=false. main protection GET403(Resource not accessible by integration).
현재 변경 SHA의 CI는 push 후 GitHub check에서 확인하고 최종보고한다.

## Self review / 통합 감사
[trace](../REQUIREMENTS_TRACEABILITY.md)의 R01–25/U00–29 대조. 이전 완료 기능없음, 기존 bootstrap만 존재.
고위험경로/rename/불완전diff/currentSHA/skipped-check/권한거부 처리 보완, 고위험 자동병합0.
원장/예약·출고수량/보충incoming·money·승인·restore 계약 상호검토. 현장정보/성능/운영API 성공 추정 안함.

## 위험/미해결
PR1 bootstrap 특성상 trusted Policy는 main에 없어 원격 실행 불가 가능. 정책·CI 자체변경은 사람 검토필수.
보호403/auto-merge비활성, 실제병합/새 task 복원/운영기능은 미완료. 모델명/effort 런타임 증명수단 없음.
Amazon 공식 공개모델 HTTP200; onboarding 공식docs403. Rakuten 공개안내200, RMS root404,
BOSS/RSL 세부/Cloudflare 문서403. 권한·기능·가격은 담당 DEV 재확인. 실제 비밀/PII/양식 요청없음.

## 롤백
미병합 문서/도구만 변경, 운영 side effect0. 잘못된 변경은 새 revert commit으로 PR1에서 수정;
main 병합후에도 reviewed revert PR, force push/운영 자동배포/실데이터 rollback 실행금지.
기존 브랜치/PR 재사용, bootstrap은 Draft 및 수동 병합 대상 유지.

## 개발 도구 환경
Python3.12.14/Node24.19.0 확인. actionlint1.7.12 Linux amd64 공식 릴리스를 TLS로 다운로드,
공식 checksums의 SHA256 일치 후 `/workspace/.wms-tools/actionlint` 설치/실행.
재현: `bash scripts/install-dev-tools.sh`(ARM64도 지원). 프로젝트 application dependency는 DEV01 전이라 설치대상없음.

## 실제 검증 결과 (이번 작업)
- Python unittest discover: **37 passed, 0 failed, 0 skipped**. 정책/보호/current-head/위조app/skip차단/rename/
  페이지누락/owner승인·취소/CLI pagination, 실제 shell helper+mock gh/git 통합, fixture·문서·secret negative tests.
- Shell4개 `bash -n`: 통과. ShellCheck0.11.0: 통과(공식 GitHub asset SHA256 검증 후 사용).
- actionlint1.7.12: Actions YAML2개 통과; ShellCheck 연동 검사도 통과.
- validate_docs: 필수19문서·로컬링크·R01–25·U00–29·F01–30·DEV00–18 구조 통과.
- known-secret-pattern/금지path 검사 및 합성 개인정보 수동분류: 문제없음. 임의 secret/PII 부재의 완전보증은 아님.
- 50/60/120 SKU fixture 재현/ID·가용계산 검증 통과; 기본60에 active50이상/품절·inactive·discontinued 포함.
- PR1 실제 API metadata에 policy CLI 실행: Draft/고위험 소유자검토 미충족으로 **예상대로 BLOCK**.
- 실제 auto-merge helper PR1 실행: 보호조회403에서 **안전 중단**, merge API 호출 안함.
- `git diff --check`: 통과. `check_application.py`: 앱 없음 확인; TypeScript/lint/build/실제DB/재고/운영연동 테스트 NOT RUN.
- 발견한 CLI2.46 `--slurp` 미지원 수정: concatenated JSON 파서+손상응답 차단테스트 추가.
- PR 생성 control-flow 통합테스트 최초2건 실패 원인은 격리 fixture의 테스트0 종료;
  실제 검사 로직은 완화하지 않고 테스트 fixture를 보완, 이후 전체37건 통과.
- 최초 출시직전 Astra 감사 요구와 DEV18 뒤 최종감사 표의 순서 혼동은 ADR013에 기록;
  DEV14 출시후보와 실제운영을 분리하고 실제 첫운영 전 감사, DEV18 완성 후 확장범위 감사 갱신.

## GitHub 반영 및 원격 증거
- 설계/도구 commit `0ac3244ad40318e5ce946be14c9fd28d6dc04235` push 완료, 기존 PR1 재사용.
- [Actions 38844330317](https://github.com/Raccoon26/Project-WMS/actions/runs/38844330317):
  해당 SHA **WMS Quality Gate SUCCESS**, 원격 로그도37 tests/OK 확인.
- Python/정책·shell통합/docs/secret/actionlint 실행 성공. 앱이 없어 pnpm/Node설치·app build/test step은 **SKIPPED**;
  실제 TypeScript/lint/build/unit/integration/재고기능 테스트를 통과했다고 하지 않는다.
- WMS Policy Gate는 trusted main에 아직 파일이 없는 bootstrap이므로 **NOT RUN / check 없음**.
  로컬 policy negative/positive 단위·통합검사와 원격 trusted policy 실행을 구분.
- 마지막 이 증거기록 커밋의 현재SHA CI는 GitHub/PR 본문/최종보고에서 별도 확인한다.
- PR1 **Open / Draft / mergedAt=null** 관측; auto-merge 요청/실제병합/운영배포 없음.
- 관리자 수동 검토·bootstrap 병합·유효보호설정·그 뒤 current-head Policy 실증 필요. DEV00 최종완료 gate는 미충족.

## Safe auto-merge smoke exercise
A documentation-only follow-up PR verifies GitHub Actions guarded automatic merging. The expected outcome is a successful `WMS PR CI` run followed by `WMS Guarded Auto Merge`. The actual result must be confirmed in the GitHub PR and workflow logs; no WMS functionality or production process is exercised.


---

## GitHub 병합 및 테스트 실증 후속 정정 — 2026-10-16

이 문서의 위쪽에 기재된 `REVIEW_PENDING`, `PR #1 Open/Draft`, `allow_auto_merge=false`, `main protection 403로 자동병합 불가`는 **보고서 작성 당시 기록**이며 현재 상태가 아닙니다.

실제 GitHub 확인:
- PR #1: **병합 완료**, commit `694ef9a1ae2dfb05c10c5683b0a63913d5deaf72` (DEV-00 문서·GitHub bootstrap).
- PR #2: **GitHub Actions 자동 병합 완료**, commit `6086ddfb8281a5a9adff2d2b6f3aca7f3a05c3b5` (문서만 변경한 무해한 자동병합 실증).
- PR #2 WMS Quality Gate와 Policy Gate 성공, Guarded Auto Merge 워크플로 성공.
- 현재 `main` 기반 DEV-01 진행을 가로막던 최초 bootstrap 병합 문제는 해소됨.
- branch protection이 없는 새 자동병합은 CI로 확인된 안전한 경로의 PR만 해당. 고위험 변경은 Draft·수동 검토를 유지함.
- 옛 `scripts/enable-safe-auto-merge.sh`는 여전히 protection API 접근이 필요하지만, 새 `.github/workflows/auto-merge.yml`은 이를 사용하지 않음.

**DEV-00 설계 및 GitHub 기반 저장소 병합은 완료로 구분하되, 실제 WMS 앱 기능, 운영 연동, 50 SKU 실부하, Raspberry Pi 배포 및 백업/복원 테스트를 수행했다고 주장하지 않음.** 이는 향후 DEV 수용 조건으로 남습니다.

[최신 상태 문서](../../PROJECT_STATUS.md)와 PR/Actions 실제 기록을 우선 참조하세요.

## AUTO-01 후속 자동화 정책 전환
기존 DEV00 설계 결과를 보존한다. 최신 사용자 지시로 경로별 수동 승인 정책을 폐기하고 독립 자동 검증으로 대체한다.
별도 dev/dev-00-auto-01 전환 작업의 코드·테스트·미해결 제약은 [AUTO-01 보고](GITHUB-AUTOMATION-01.md) 참조.

## AUTO-01 live negative probe
의도적으로 baseline의 DB 장애 검사를 삭제한 변경을 독립 검증기가 차단하는지 실증한다.
삭제 상태의 HEAD 8de73b2는 실제 독립 검증에서 차단됐다. 기준선을 복원한 현재 HEAD로 정상 경로를 검증한다.

[PR6 negative Quality 성공](https://github.com/Raccoon26/Project-WMS/actions/runs/38853596100),
[독립 검증의 의도된 차단](https://github.com/Raccoon26/Project-WMS/actions/runs/38853650332):
`Established verification baseline removed/weakened: tests/fault/database.test.ts`. 실제 merge job은 skipped, main 보존 확인.

## AUTO-01 verifier follow-up
DEV01 사전검토에서 disabled integration scaffold의 tsconfig를 실제 adapter 코드로 오인하는 분류 결함을 발견했다.
소스 파일 집합·정확한 hash·실제 no-effects case를 함께 확인하도록 수정하고 tsconfig 동반 회귀를 추가했다.
독립 문서 validator는 baseline 자체 대신 candidate root를 검사하게 수정했다.
새 제어 코드도 이전 main verifier와 모든 실제 정책 검사를 통과한 경우에만 자동병합한다.

## AUTO-01 최종 상태 기록
정책 전환 PR5 적용 후 PR6/7의 제어 코드 자동병합, PR4의 실제 앱/PG/browser 검증 및 bot Ready·병합을 확인했다.
PR4 merge=`168a43ef2cc94bcd058bb0f366d07494817b924c`; 상세 run과 실패·차단 이력은 AUTO-01 보고 참조.
최종 metadata 경합 회귀를 추가하고 PR 직전 title/base/source/author 변경도 차단한다. 상태 문서를 실제 main 결과로 정정한다.

## DEV-02 선행 기준선 전환 (2026-10-16)

인증 도입 전 독립 검증의 두 고정 가정을 조사했다: 익명 관리 화면 접근, migration count=1.
원래 verification-baseline.json을 보존하고 별도의 main-owned successor를 추가했다.
인증 서비스가 있는 후보만 successor를 사용한다. 기존 8개 Desktop/Mobile 화면 검사의
모든 assertion을 보존하며 실제 CSRF→비밀번호→TOTP 로그인 fixture를 사용한다.
DB 이력 검사는 manifest의 실제 migration 수와 정확히 일치해야 한다. 기존 checksum,
rollback, 반복 실행, 데이터 보존 검사는 유지한다. 인증 기능 없는 DEV01 후보는 원래 기준선 그대로 실행된다.
독립 검증은 read-only 격리 환경이며 merge controller 권한/워크플로/승인 정책은 변경하지 않는다.
후속 DEV02 인증 엔진·보안 검증 완료를 이 전환 자체로 주장하지 않는다.

전환 PR 로컬 실제 결과: Python68 / Unit34 / PG Integration4 / Failure14 / Browser8,
모두 성공, 실패0·Skip0. lint/typecheck/boundary/build/docs/secret 검사 성공.
기존 Python negative fixture의 manifest 누락과 새 Playwright fixture의 미사용 타입 인자를
발견·수정 후 관련 검사를 재실행했다. 원격 CI/병합 결과는 GitHub에서 확인하며 미래 결과로 기록하지 않는다.


## 2026-10-19 — 설계 변경 기록: Ubuntu 독립 주문 운영 / 선택적 Dots (문서 전용)

DEV-00의 2026-10-16 초기 완료·검증 이력을 소급 수정하거나 재시행하지 않는다. 최신 사용자 장기 요구에 따라 R26–R31 및 [AI 운영 아키텍처](../AI_OPERATIONS_ARCHITECTURE.md)와 새 OPS-01-1/2/3 의존관계를 추가했다. Ubuntu Server(x86-64 노트북 우선)는 Windows/Dots 완전 종료 시에도 승인된 Amazon/Rakuten 주문·예약/불변원장·채널동기화/출고·배송/취소·반품·감사·복구를 독립 실행해야 한다. AI-01은 이용/권한 확인 후 선택적 제한 권한이며 DB/원장 직접 수정·자기승인 금지. Raspberry Pi/ARM64 이식성은 보존. 문서·로컬 설계 일관성 검토만 수행했으며 실제 Marketplace live/Ubuntu 장비/Dots 통합·운영검증은 NOT RUN. 기존 DEV04 검증 423개를 대체하지 않고 DEV05 구현 브랜치는 변경하지 않았다. 이 변경은 DEV-00 **새 설계 amendment**이지 DEV-05~18 구현 완료 증명이 아니다. 변경 파일/추적·미검증 항목은 [별도 감사 보고서](AI-OPERATIONS-ROADMAP-01.md)에 기재했다. AUTO-01 CI와 실제 병합 확인은 PR 결과를 따른다.
