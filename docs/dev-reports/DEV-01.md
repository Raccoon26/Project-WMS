# DEV-01 — 실행 가능한 개발 기반

상태: **IMPLEMENTED / LOCAL_VERIFIED / REMOTE_PENDING**, GitHub 반영·최종CI·수동병합은 별도 기록.
기존 `dev/dev-01-foundation`을 그대로 사용, 원격 시작 main=02611d1. PR1–3 Merged 재확인, DEV01 기존PR 없음 확인.
현재 operational WMS는 아니다. 기본 웹·API·DB·Worker만 구현, 실제 외부 부작용0.

## 구현 범위
- pnpm10.34.7 workspace+실제lockfile, Node24.19.0/TS5.9.3, exports source/dist, 경계·순환 검사.
- React/Vite/Tailwind 반응형15route/메뉴/active/404/오류/일본어·ko/en fallback/UTC→JST/정적PWA.
- Fastify /api/v1/health/live, /health/ready, /version; no-store/ID/validation/표준오류/비민감로그.
- PostgreSQL17.11 digest pinned Compose(dev/test 분리) 및 실제 Drizzle insert/select,
  최소 metadata migration+hash ledger/advisorylock/원자 rollback/반복실행, 앱 자동초기화0.
- 독립 Worker readonly DB probe+상태HTTP+환경검증+SIGTERM/SIGINT/drain/restart; 외부작업 미구현.
- unit/integration/fault/browser runner와 CI PostgreSQL/최신 JSON artifact7일.

## 실제 검증 기록
| 검증 | 로컬 결과 | 주의 |
|---|---|---|
| pnpm install --frozen-lockfile | 통과 | 실제 pnpm10/Node24, lock 재현 |
| pnpm lint / pnpm typecheck | 통과 | 최종 전체검증에서 재확인 |
| pnpm check:boundaries | 통과 | workspace+실제 source import 경계 |
| pnpm test:unit | 34 passed /0 failed /0 skipped | 설정/계약/ID/i18n/로그/worker lifecycle |
| pnpm test:integration | 4 passed /0 failed /0 skipped | 실제 PostgreSQL17.11 |
| pnpm test:failures | 14 passed /0 failed /0 skipped | 실제DB중단·복구/지연·rollback/프로세스 signals/restart |
| pnpm build | 통과 | recursive TS+Vite production |
| pnpm test:e2e | 8 passed /0 failed /0 skipped | desktop/mobile Chromium, 실제API+DB, API오류는 명시mock |
| 기존 Python 정책 | 45 passed /0 failed /0 skipped | 기존 Guarded Auto Merge 유지 |
| Actions YAML / Shell syntax | 통과 | actionlint1.7.12 / bash -n |
| public path/known-secret-pattern | 통과 | 임의PII의 완전부재 보장은 아님 |
| pnpm audit | known vulnerabilities0 | esbuild transitive override 후 |

기능 구현전 F01–30 전체물류장애/50SKU 원장·보충·성능, 실제운영 API/Pi/복원은 **NOT RUN**.
Mac/Windows/iOS/Android실기기 및 ARM64 실행은 **NOT RUN**. mobile은 Chromium emulation.

## Self Review / 수정
1. root CLI/tests workspace dependency 연결 누락을 수정, source/dist 조건 분리로 clean typecheck와 topological build.
2. worker startup 중 shutdown 경쟁과 동시 stop 자원해제 중복 수정, startup-stop/close failure 테스트.
3. Fastify raw request/error logging 금지, ID validation·no-store·추가query 거부, 내부예외/DB암호 미노출 검증.
4. 별도 test URL/schema/container guard 및 실제 migration rollback/hash tamper/PG stop-start 검증.
5. Playwright download 완료 전 최초6건 실행 실패: 설치완료 후 동일 테스트 통과, 테스트 skip/완화 안함.
6. artifact root가 Playwright output 정리에 지워질 위험 수정, browser output 하위분리.
7. Drizzle-kit transitive esbuild0.18 moderate를 해당경로0.25.12로 변경, CLI generate/audit 재검증.
8. muted text 대비/모바일 hidden nav inert/Escape·focus/터치영역 보완, 정적cache allowlist/write queue0.
9. 최신 PostgreSQL17 minor17.11/ARM64 manifest 확인 후17.9에서 업데이트·재검증.
10. 오래된 DEV00 PR1미병합/보호없으면모든자동병합불가/native auto flag false 표현을 최신원격사실로 정정.

## 이전 요구사항 감사
R01: Page25/100·bigint contract/60fixture 보존; 실제CRUD/50SKU엔진은DEV03/04/14.
R02–09/R23–24: domain에 infra의존0, metadata 외 업무schema·원장·돈·출고기능은 미구현, 안전계약 보존.
R10/11/15/16: Worker readonly 시작/정지·DB성공만, 알림/outbox/backup/업무감시 성공으로 오인하지 않음.
R12: 15route/PWA/i18n/responsive 기반 구현. R13/21: 위험쓰기0/운영차단, 인증은DEV02.
R14/17: Dockerdev/ARMmanifest, Pi실물없음/자체창고는후속. R18/22: Dot·유료AI·유료DB의존0.
R19/20/25: 기존Actions guarded merge 유지, 이번 고위험Draft/manual; 매DEV 검증·Sol Medium/Astra FINAL 정책 유지.
[세부 추적](../REQUIREMENTS_TRACEABILITY.md), [설치·계약](../DEVELOPMENT.md).

## 위험/후속/롤백
이 브랜치는 개발기반이며 production/auth/business APIs 없음. 개발DBrole은 운영최소권한 아님.
Deprecated @esbuild-kit loader upstream 잔존, 알려진 취약점은 override로 제거; nativeARM실행은DEV12.
소유자 label/현재SHA 승인 메시지는 자동 생성하지 않는다. CI/pkgs/db/infra 수동검토 후 직접병합 필요.
rollback: 새 revert PR, main force/direct push 금지; metadata migration을 down/drop으로 자동되돌리지 않음.
운영배포0. 개발volume은 down에서 보존, down-v는 명시파괴행위로만 안내.

## 원격 결과
Commit/Push/PR/현재SHA Actions 결과를 확인 후 아래에 실제 증거를 추가한다. 현재 pending 상태를 성공으로 추정하지 않는다.

## 실행 환경 및 실측 (Pi 수치 아님)
Linux amd64, Node24.19.0, AMD EPYC 9V74, availableParallelism4, host RAM약34088MiB.
Docker28.4.0/Compose2.40.3, PostgreSQL17.11 실제 SHOW server_version 확인.
최종 로컬 단위34/DB통합4/장애14/browser8/Python45 =105 passed, 실패/skip0.
실제 업무테스트/실제ARM64/Pi/실기기 모바일·Windows·macOS는 별도 미실행.
compiled Node 앱을 별도포트3301/3302로 실행해 준비완료까지 API 589.29ms / Worker 460.99ms.
시작 직후 약1초 RSS API 336.1MiB / Worker 206.84MiB(현 호스트 Node runtime 포함, 장기안정치 아님).
각100회 sequential loopback HTTP: live p50/p95 0.455/0.811ms,
ready 1.172/1.593ms. synthetic·비인증 상태조회이며 업무처리 throughput/SLO 검증 아님.
Vite 최종 build: index JS235.33kB(gzip74.61), CSS11.56kB(gzip3.56), indexHTML0.63kB.
Docker 관측: dev/test PG 각각약21.7MiB RSS, CPU약4%(단일시점 healthcheck 포함, 부하테스트 아님).
Chromium 새 context의 첫 navigation: DOMContentLoaded 38.10ms / load 38.20ms(현 로컬호스트·단일표본).
개발 Compose 실제 down/up/repeated-up과 synthetic metadata 보존 확인, 자신의 probe행 제거.
개발 migration2회 및 testmigration 반복, actualDB복구, API/worker compiled 직접실행·정상종료를 확인.
License metadata8종검토(MIT/Apache/ISC/BSD2/BSD3/CC-BY4/MPL2/BlueOak), attribution/소스 의무는 배포때 유지.

## 변경 파일 (이번 DEV)

- `.env.example`
- `.github/workflows/pr-ci.yml`
- `.gitignore`
- `.node-version`
- `.npmrc`
- `ARCHITECTURE.md`
- `DEPLOYMENT.md`
- `DEV_PROGRESS.md`
- `PROJECT_STATUS.md`
- `README.md`
- `RELEASE_CHECKLIST.md`
- `REQUIREMENTS.md`
- `SECURITY.md`
- `TEST_PLAN.md`
- `apps/api/package.json`
- `apps/api/src/app.ts`
- `apps/api/src/main.ts`
- `apps/api/tsconfig.build.json`
- `apps/web/index.html`
- `apps/web/package.json`
- `apps/web/public/icon.svg`
- `apps/web/public/manifest.webmanifest`
- `apps/web/pwa-build.ts`
- `apps/web/src/App.tsx`
- `apps/web/src/i18n.ts`
- `apps/web/src/main.tsx`
- `apps/web/src/routes.ts`
- `apps/web/src/styles.css`
- `apps/web/src/vite-env.d.ts`
- `apps/web/vite.config.ts`
- `apps/worker/package.json`
- `apps/worker/src/main.ts`
- `apps/worker/src/worker.ts`
- `apps/worker/tsconfig.build.json`
- `docs/ARM64.md`
- `docs/DECISIONS.md`
- `docs/DEVELOPMENT.md`
- `docs/GITHUB_WORKFLOW.md`
- `docs/REQUIREMENTS_TRACEABILITY.md`
- `docs/RISK_REGISTER.md`
- `docs/SAFETY_GATES.md`
- `docs/dev-reports/DEV-01.md`
- `eslint.config.js`
- `infra/compose/compose.test.yaml`
- `infra/compose/compose.yaml`
- `package.json`
- `packages/contracts/package.json`
- `packages/contracts/src/index.ts`
- `packages/contracts/tsconfig.build.json`
- `packages/db/drizzle.config.ts`
- `packages/db/migrations/0000_foundation.sql`
- `packages/db/migrations/meta/0000_snapshot.json`
- `packages/db/migrations/meta/_journal.json`
- `packages/db/package.json`
- `packages/db/src/index.ts`
- `packages/db/src/schema.ts`
- `packages/db/tsconfig.build.json`
- `packages/domain/package.json`
- `packages/domain/src/index.ts`
- `packages/domain/tsconfig.build.json`
- `packages/integrations/package.json`
- `packages/integrations/src/index.ts`
- `packages/integrations/tsconfig.build.json`
- `packages/runtime/package.json`
- `packages/runtime/src/index.ts`
- `packages/runtime/tsconfig.build.json`
- `playwright.config.ts`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`
- `scripts/check-boundaries.ts`
- `scripts/db-cli.ts`
- `scripts/dev-setup.ts`
- `scripts/run-browser-tests.mjs`
- `scripts/run-tests.mjs`
- `scripts/validate_docs.py`
- `tests/e2e/web.spec.ts`
- `tests/fault/database.test.ts`
- `tests/fault/fixtures/shutdown-error.ts`
- `tests/fault/processes.test.ts`
- `tests/helpers.ts`
- `tests/integration/postgres.test.ts`
- `tests/unit/api-worker.test.ts`
- `tests/unit/foundation.test.ts`
- `tsconfig.base.json`
- `tsconfig.json`
- `vitest.config.ts`
