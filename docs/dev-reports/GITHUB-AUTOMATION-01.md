# GitHub automation policy transition — 2026-10-16

최신 사용자 지시가 이전 C 수동 승인 정책을 대체한다. 모든 경로를 자동 병합 대상으로 허용하되
실제 필수 검증 누락/실패/취소/불명은 차단한다. 승인 label/comment/review 요구를 제거한다.
PR4 기존 DEV01을 보존하고 별도 dev/dev-00-auto-01 전환 PR을 먼저 적용한다. 새 정책 main 적용 및 PR4 자동병합 실증 완료. 초기 진행 기록은 아래 이력과 구분한다.

## 구현

- 일반 PR 생성(--draft 없음), 완료 선언+현재 검증이 있는 기존 Draft만 자동 Ready.
- metadata WAITING과 병합 허가 분리. 위험도는 검사 profile을 선택하며 수동 승인 조건이 아니다.
- main 소유 `WMS Independent Verification`: workflow_run·읽기 전용·운영 secret 없음, candidate 정책 테스트 +
  main baseline 테스트/runner/config/필수 명령으로 실제 앱·PG·브라우저 검증을 다시 실행한다.
- workflow 권한 상승/쓰기 단계 PR checkout/새 privileged action/검증 명령 제거/secret 접근을 독립 검사.
- privileged controller는 trusted main 코드와 bounded JSON 증거만 사용하며 PR 코드를 실행하지 않는다.
- 정확한 HEAD/base/PR/공식 run/필수 step, 실제 nonzero/no-skip 결과, companion WMS PR CI 성공을 모두 요구한다.
- main controller 직렬화, Ready 직전/merge 직전 재조회, GitHub HEAD precondition. 운영 배포 없음.

## 시나리오 추적

| 요청 시나리오 | 기대/검증 |
|---|---|
| 일반 UI/API 성공 | independent + quality 성공과 완료 선언 후 허용; controller integration mock |
| DB migration 성공 | 실제 PG 적용·반복·rollback·checksum case + 공통 검증 후 허용 |
| 재고 엔진 성공 | 실제 안전성 suite 설치 전 차단; future registry의 concurrency/invariant/idempotency/rollback 계약 모사 |
| 인증/보안 성공 | 실제 세션/CSRF/권한 suite 설치 전 차단; 누락 검사 음성 테스트 |
| CI/merge 정책 성공 | main-owned baseline + 권한/필수명령 검사 후 경로에 관계없이 허용 |
| 실패/누락/0개/skip | evidence/공식 run/job/step 검사에서 차단 |
| secret 노출 | baseline secret scan과 workflow secret 접근 검사에서 차단 |
| stale SHA/main | run/증거/최종 snapshot에서 차단, Ready/merge mutation 없음 |
| conflict/fork | metadata/mergeability 검사에서 차단 |
| 검사 우회 | main baseline overlay, runner 고정, 필수명령/권한 검사로 차단 |

모사 테스트는 live 병합이 아니다. 실제 GitHub Actions run/merge 결과는 후속 증거를 추가한다.
재고/인증 업무 기능은 아직 구현하지 않았으므로 실제 해당 변경 자동병합 성공을 주장하지 않는다.

## 알려진 한계

GitHub REST merge는 HEAD만 원자적이며 base CAS를 제공하지 않는다. 자동 controller는 직렬화하지만
외부 관리자가 마지막 조회와 요청 사이에 main을 직접 바꾸는 경쟁까지 원자적으로 막는다고 보장하지 않는다.
직접 main push 금지/수동 병합 동시 실행 금지 유지; 서버 강제는 선택 merge queue/보호 구성으로 별도 검토한다.
독립 CI 역시 일반 CI처럼 악의적인 repository 소유자의 모든 실행권한을 격리하는 형식 검증기가 아니다.
읽기 전용 검증 runner에 운영 secret을 주지 않으며 privileged merge job에는 candidate 실행을 넣지 않는다.

## 최초 전환

구 main Policy의 Draft/owner label/현재SHA 승인 요구만으로 발생한 오류는 최신 사용자 지시로 폐기된
승인 조건이다. 실제 Quality 실패와 구분해 로그를 보존한다. 사용자에게 해당 label/comment를 요구하거나
자동화가 대신 생성하지 않는다. 정확한 최종 HEAD의 실제 CI·독립 baseline/보안 검증 후 최초 전환을 수행한다.
새 정책 설치 전에는 새 main-owned workflow가 실행되지 않으므로 bootstrap 증거와 설치 후 live 실증을 구분한다.

## 실제 실행 중 증거
최초 분리 전 Python 62 passed/0 fail/0 skip, actionlint 통과.
DEV01 재실행 중 PostgreSQL 테스트4개가 DB 미기동 ECONNREFUSED로 실패했다. DB를 정상 재시작했으며
이를 성공으로 숨기지 않고 PR4 재검증에서 실제 PG 전체 suite를 다시 실행한다.
Project-PDF의 실제 Foundation CI(읽기전용/frozen install/독립 validator/browser 구조)를 read-only로 참고했다.
GitHub 공식 이벤트 문서는 조회 성공. 11월2일 변경의 정확한 공지 원문은 미확인이고 pull_request_target 의존을 제거했다.

## 최초 적용 및 실제 차단 증거
- 전환 PR5/head 0eac5f9, Quality38853428587 성공, 정책62+이전 main 구조5 통과.
- 구 Policy38853428695 실패 원인은 폐기된 owner label/현재SHA 승인 조건 하나뿐이었다.
- 사용자 AUTO-01 지시에 따른 정상 SHA 조건 PR merge API로 최초 전환. 승인 label/comment/review 생성0.
- main 적용 `9bc5abc3a92227cf27b6a929747e70a30f4423da`. 최초 전환 API 병합과 이후 Actions 자동병합은 구분한다.
- PR6/head8de73b2: Quality38853596100 SUCCESS인데 독립검증38853650332가 baseline DB 장애 테스트 삭제를 검출해 FAIL.
  Guarded38853692380 SKIPPED, PR6 미병합/main 불변 확인. 의도된 negative 실증 성공.
- baseline 복원 후 새 HEAD로 검증한다. disabled integration scaffold는 정확한 SHA256+기존 실제 no-effects unit case로만
  외부연동 업무 profile에서 제외한다. 기능을 추가하거나 해시가 바뀌면 실제 integration safety case가 필요하다.

## 실제 정상 자동병합 실증
PR6 restored head `67f247302148c7005847c4ffcc4607fffb966269`:
[Quality38853815455](https://github.com/Raccoon26/Project-WMS/actions/runs/38853815455) SUCCESS,
[Independent38853857916](https://github.com/Raccoon26/Project-WMS/actions/runs/38853857916) SUCCESS,
[Guarded38853918542](https://github.com/Raccoon26/Project-WMS/actions/runs/38853918542) SUCCESS.
실제 자동 squash merge `435e69daa2582f75e970b3c8bbd718bf3b63abf8`. 사용자 승인/label/comment 없음.
이 PR에는 merge 프로그램/증거 builder/정책 코드 변경도 포함되어 이전 main verifier를 통한 제어 코드 자동병합을 실증했다.
Python 후보63/기준선62 실행, no fail/skip. 앱 없는 전환 PR이므로 PG/웹 suite는 NOT APPLICABLE이며 실행했다고 주장하지 않는다.

GitHub 공식 [2026-09-17 공지](https://github.blog/changelog/2026-09-17-workflow-execution-protections-in-github-actions-generally-available) 확인:
11월2일 대상 공개repo의 default pull_request_target rule enforcement가 적용된다. 이 구현은 해당 이벤트 사용0이다.

## DEV01 실제 자동 Ready·병합 및 최종 감사

| 검증 | 실제 결과 |
|---|---|
| PR4 원격 HEAD | cdd9fcd22575340b8579f7956053fd48bc220cd0 |
| Quality | [38854559218](https://github.com/Raccoon26/Project-WMS/actions/runs/38854559218) SUCCESS; Python65+unit34+PG4+fault14+browser8=125 passed/0 fail/0 skip |
| Policy | [38854720372](https://github.com/Raccoon26/Project-WMS/actions/runs/38854720372) SUCCESS; Draft WAITING이며 허가와 분리 |
| Independent | [38854703602](https://github.com/Raccoon26/Project-WMS/actions/runs/38854703602) SUCCESS; 실제 PG/앱/브라우저 재검증 |
| Controller | [38854877732](https://github.com/Raccoon26/Project-WMS/actions/runs/38854877732) SUCCESS; READY/MERGED log 확인 |
| 실제 이벤트 | github-actions[bot], Ready05:16:11 UTC → merged05:16:14 UTC |
| 실제 squash/main SHA | 168a43ef2cc94bcd058bb0f366d07494817b924c |

수동 승인/위험 label/SHA 승인 comment0. 신규 PR5/6/7 일반 PR 생성, 기존 Draft PR4 자동 Ready를 실제 확인했다.
일반 UI/API/DB/Worker와 CI/정책 코드가 실제 독립 검증 후 자동병합됐다. 재고 엔진/인증/메일 등의 업무 기능은 아직 없어
실제 해당 업무 성공 병합은 미실행이며 case catalog 충족/실패/누락은 정책 회귀 모사로만 확인한다.

최종 snapshot이 head/base뿐 아니라 title/base branch/source ref/repository/author 변경도 차단하도록 보강했다.
새 metadata 경합 회귀1개를 더해 로컬 정책66, 전체 고유 테스트126개(앱60+정책66)가 된다.
기준선 삭제 negative의 의도된 Actions 실패, 수정 전 CLI exit2/DB환경 오류는 위 이력에 보존했고 최종 성공과 혼동하지 않는다.

변경 파일: pr_policy/auto_merge/create-dev-pr/merge_gate, 독립 verifier/runner/evidence/catalog/baseline,
관련 Python 회귀, pr-ci/pr-policy/independent-verification/auto-merge workflows, AGENTS 및 상태·요구·테스트·안전·위험·결정·DEV 보고.
rollback은 별도 revert PR+동일 자동검증으로 수행하고 운영 DB reset/자동 운영배포를 하지 않는다.
