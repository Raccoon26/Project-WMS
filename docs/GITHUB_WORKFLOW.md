# GitHub 개발·안전 병합

현재 PR [#1](https://github.com/Raccoon26/Project-WMS/pull/1)은 bootstrap trust-boundary 변경: Draft/수동 검토.
2026-10-16 확인: Public, allow_auto_merge=false, main protection API403(설정 여부 판정 불가).
보호를 우회/완화하거나 PR1을 자동 병합하지 않는다. 기존 브랜치 `dev/dev-00-github-bootstrap`을 그대로 사용.

## 매 DEV
1. clean status, `git fetch origin main`, 기존 branch/PR(닫힌 것도) 확인. `new-dev-branch.sh`는 기존 branch 재사용,
   없을 때 FETCH_HEAD에서 생성한다. 작업은 이미 격리된 checkout에서 하며 요청 없이 worktree 만들지 않는다.
2. scope/requirements/safety/trace 읽기, 구현+Self Review+관련 자동/통합/장애/보안/이전요구누락 감사.
3. 명시 파일 stage, diff/secret 검사, DEV report 포함 commit. main 직접push/force 금지.
4. `bash scripts/create-dev-pr.sh DEV-XX 'Topic'`: clean committed tree에서 검증·push,
   기존 open PR 재사용, 없음만 Draft 생성. API 실패/closed PR 존재는 중지(중복 생성 금지).
5. 앱 존재시 typecheck/lint/build/test:unit/test:integration/test:failures; DEV04 재고는 test:invariants 추가.
   package script 존재만으로 통과 아님: runner는 테스트0/skip를 실패로 판단하고 결과 artifact를 남겨야 함(DEV01 구현).
6. 현재 SHA remote CI/요구/오류 시나리오 증거 확인 후 PR ready. 일반 허용 변경은
   `bash scripts/enable-safe-auto-merge.sh N`으로 GitHub native auto-merge 요청.
   CLI는 성공 current-SHA check/보호/mergeability/전체diff를 확인한 뒤만 `--auto --squash --match-head-commit SHA`;
   검사 대기·누락·skipped·neutral·old SHA·다른 app·불명·403·conflict·behind이면 중지.
7. `gh pr view N --json state,mergedAt,mergeCommit,statusCheckRollup,headRefOid`로 실제 병합 결과 확인,
   status/report에 commit/PR/CI/실제 병합 상태 기록. 예약 요청≠병합 완료.

## 신뢰 경계
Policy는 `pull_request_target`+base SHA의 trusted 코드만 사용, contents/PR/issues read 권한, credentials persist=false.
head 코드를 checkout/import/run 하지 않는다. API 파일 목록은 paginate·count 비교(3000 이상 차단), rename 이전경로도 검사.
head hash가 event와 다르거나 실행 중 바뀌면 중지. Quality는 unprivileged head 작업, production secret0.
Actions는 조회한 공식 v4 commit SHA에 고정; actionlint1.7.12 릴리스 SHA256 검증 후 사용.
자동병합 helper는 로컬에서 검토한 소스여야 한다. PR 코드 자체를 안전 권위로 실행하지 않는다.

`manual(path)`는 보수적 allowlist: 일반 문서/상태와 `apps/web/src/components/`의 비민감 표현 코드만 routine 후보.
나머지 미분류 코드, CI/스크립트/manifest/DB/인증/재고/출고/돈/승인/배포/복구/안전설계는 수동.
경로만으로 의미 위험을 완전히 판별 못하므로 구현 review는 별도 필수; UI에 위험 로직 숨기지 않는다.
경계 확장은 그 자체 수동 검토. owner label이 붙어도 고위험 자동병합 helper는 절대 허용하지 않는다.

Policy 고위험 gate는 `manual-risk-approved` label **및 현재 SHA의 소유자 review** 필요.
단독 소유자는 자기 PR GitHub review 승인이 불가하므로 사람이 직접 `/wms-owner-review FULL_SHA` comment로
동일 내용을 명시할 수 있다(취소 `/wms-owner-revoke FULL_SHA`). 자동화가 이 comment/승인label을 대신 만들면 안 된다.
review/comment 후 label을 다시 적용하여 trusted policy 재실행; 타인·구SHA·취소는 불허.
조직 소유로 이전하면 user owner 판정을 팀/권한 검증으로 별도 변경해야 하며 현재는 fail closed.

## 관리자 설정 / bootstrap 예외
현재 main에는 정책 파일이 없어 PR1에서 Policy Gate가 생성되지 않을 수 있다. proposed CI가 자기 신뢰를 확립하지 못한다.
사람이 diff/로컬 검사/Quality를 검토하고 bootstrap을 수동 병합한 뒤 다음을 설정·실증해야 한다.
이미 보호가 있는 경우 해제하지 말고 권한 있는 관리자가 승인된 bootstrap 경로를 마련한다.
- main: PR required, required `WMS Quality Gate`/`WMS Policy Gate`, strict up-to-date;
  checks의 app source GitHub Actions(15368), force push/delete/admin bypass 금지, bypass allowances 없음.
- GitHub auto-merge/squash 활성화는 향후 routine용 선택 설정; 고위험 병합 수동.
- rulesets 포함 유효 보호와 actor 권한을 관리자 검토. helper는 classic protection을 입증할 수 없으면 중지하며
  ruleset만 있는 저장소도 지원 증거 추가 전 자동병합하지 않는다.
- bootstrap 후 테스트 PR로 target Policy Check가 현재 head SHA에 연결되어 표시되는지 확인.
  플랫폼이 base SHA로만 check를 게시하면 helper는 의도적으로 차단: trusted current-head attestation 설계를
  별도 수동 검토로 추가하기 전 자동병합 활성화 금지. 실패를 합성 success status로 바꾸지 않는다.
- GitHub branch protection이 workflow 파일 자체의 악의적 대체를 방지하도록 관리자/CODEOWNERS 검토 경계를 유지;
  app ID만으로 workflow 내용 진위를 보장한다고 주장하지 않는다.

소유자 설정 변경/새 PR 실증/보호 조회를 이번 권한으로 완료했다고 주장하지 않는다.
`main` 병합은 Pi배포가 아님. 실제 운영은 [배포](../DEPLOYMENT.md) 별도 승인/백업/drain/rollback.


## 2026-10-16 amendment: GitHub Actions automatic merge without branch protection

Per owner request, ordinary non-sensitive DEV PRs can be auto-merged **without** main branch-protection or GitHub native Auto-merge settings. The privileged workflow `.github/workflows/auto-merge.yml` (main only) reacts to a successful, current-head `WMS PR CI` run, or a manually marked-ready PR. It checks trusted main `scripts/auto_merge.py`, GitHub PR identity and complete diff, current main baseline, exact CI workflow identity, latest run and all CI jobs, then uses the GitHub merge API with a SHA precondition and squash mode.

`scripts/create-dev-pr.sh` creates ready PRs for reviewed safe-path diffs, draft PRs for unsafe/unknown diffs. Existing PRs are reused, not duplicated. Manual-risk PRs (CI/config/security/DB/inventory/shipping/payment and unknown application paths) must be owner-reviewed and manually merged; labels cannot bypass this. CI failure, stale head/base, missing run, draft or GitHub 403 all prevent auto-merge.

GitHub branch protection is still RECOMMENDED: absent protection, maintainers can directly push main and potentially modify CI; this Actions-only scheme cannot supply repository-enforced guarantees. Never turn on automatic Raspberry Pi deployment from main. The older `scripts/enable-safe-auto-merge.sh` remains the optional GitHub-native protected-mode helper and is NOT used by the new Actions flow.

The initial bootstrap PR #1 itself changes CI/merge controls and stays manual review; owner explicitly approves its merge. The privileged workflow first becomes available on main after bootstrap merge. Actions must have granted its requested `contents: write` and `pull-requests: write` token permissions, otherwise safe-stop on authorization failure.
