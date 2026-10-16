# GitHub 개발·안전 병합 — 현재 규칙

2026-10-16 DEV01 시작 시 원격 PR1/2/3 **Merged**, main02611d1 확인.
PR2 문서변경의 Actions Guarded Auto Merge 실증 완료. `allow_auto_merge=true`도 관측했지만
현재 Actions 기반병합은 native auto-merge 설정/branch protection을 필수로 하지 않는다.
보호없는 구성은 직접main push를 차단하지 못하므로 권한/위험경계를 분명히 하고 보호규칙은 계속 권장한다.

## 매 DEV
1. `git fetch origin main`, 기존 DEV branch/PR/작업자 commit 확인. 기존branch를 재사용하고 reset/force/main직접push 금지.
2. 문서/구현/테스트/회귀·장애·보안/이전요구누락감사, DEV report 갱신.
3. 명시파일 stage/diff·secret 검사 후 commit. `bash scripts/create-dev-pr.sh DEV-XX 'Topic'`으로 검증/push/기존PR재사용.
4. safe-only diff는 ready PR, CI/패키지/DB/API/Worker/infra/보안·재고·출고·돈·미분류는 Draft·수동검토.
5. 현재SHA CI/Policy 결과를 확인하고 실제병합 state/mergedAt/SHA를 기록. 검사대기/미실행/skip은 통과가 아님.

## 신뢰 경계
기존 `.github/workflows/auto-merge.yml` + `scripts/auto_merge.py`는 trusted main 코드만 사용하고 PR head/artifact를
checkout/import/실행하지 않는다. 현재HEAD/공식CI경로·ID/최신성공run/jobs/현재main baseline/동일repo·소유자PR/
전체diff(rename 양쪽·page개수)/안전path/draft/hold/검토요청/mergeability를 확인, merge API에SHA precondition.
고위험은 owner label/comment로 자동병합 허용하지 않는다. GitHub API403/불명/stale/fork는 안전중단.
DEV01은 기존 자동병합 코드를 바꾸지 않고 Quality CI에 실제 앱/DB/browser 검증만 추가한다.

Policy는 pull_request_target+trusted base SHA, read-only token, PR 코드를 실행하지 않는다.
고위험 Policy는 owner의 현재SHA 검토 및 manual-risk-approved label이 필요하고 Draft도 차단한다.
단독소유자 수동검토 comment `/wms-owner-review FULL_SHA`와 취소 `/wms-owner-revoke FULL_SHA` 지원;
**Codex는 승인/label/comment를 소유자 대신 만들지 않는다.** owner 검토후 재실행은 label 재적용 등 신뢰된 event로 수행.
이번 고위험 PR에서는 Policy BLOCK/Guarded Auto Merge 중단이 정상일 수 있으며 Quality 결과와 별도로 보고한다.

## DEV01 CI
Node24.19.0/pnpm10.34.7, frozen install/typecheck/lint/실제unit+PostgreSQLintegration+fault/build/browser,
Python45정책회귀/docs/secret/shell/actionlint. test PostgreSQL17.11+고정digest/합성계정/healthcheck,
실제stop-start는 검증한 service container만. JSON합성결과 artifact7일, 운영secret0.
Actions는 공식commit SHA 고정. PRhead CI는 read권한이며 운영배포/실제창고요청을 하지 않는다.

## 선택 legacy protected native 모드
`scripts/enable-safe-auto-merge.sh`는 별도 보호규칙 확인이 필요한 native helper이고 현재Actions모드가 호출하지 않는다.
보호 상세403이면 이 helper는 여전히 중단한다. 이를 현재 모든저위험 자동병합 blocker로 해석하지 않는다.

GitHub main 병합과 Pi 운영배포는 별개. 운영은 사전백업/drain/별도승인/rollback 계획이 필요하다.
