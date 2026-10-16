# 요구사항 추적 / DEV00 통합 감사

그룹ID는 [요구](../REQUIREMENTS.md), 사용자 지시 §0–29는 U00–U29로 보존.
각 DEV report는 R-ID+테스트ID+실제 실행SHA/결과 링크를 추가; 문서 반영과 기능 검증을 구분.
DEV01 실행 기반 및 DEV02 인증 기반은 실제 구현·검증하며 물류 업무 기능은 여전히 NOT RUN. DEV00 도구 실행 증거는 [보고](dev-reports/DEV-00.md).

| ID | 요구 그룹 | 구현 기준 문서 | 담당 | 검증 계약 | 상태 |
|---|---|---|---|---|---|
| R01 | 제품·SKU | [DATA_MODEL.md](../DATA_MODEL.md) | DEV-03,14 | 50+ 등록/검색/상태/매핑/페이지, fixture≠실제 기능 | 설계 완료 / 기능 NOT RUN |
| R02 | 원장/예약 | [DATA_MODEL.md](../DATA_MODEL.md) | DEV-04 | F07/08/12/21/28, 불변식 | 설계 완료 / 기능 NOT RUN |
| R03 | 입출고/이동 | [DATA_MODEL.md](../DATA_MODEL.md) | DEV-04,15–17 | F18–20, partial/reservation/소유합 | 설계 완료 / 기능 NOT RUN |
| R04 | 문서양식 | [OPERATIONS.md](../OPERATIONS.md) | DEV-05 | sample watermark/hash/금지필드 | 설계 완료 / 기능 NOT RUN |
| R05 | 이메일창고 | [OPERATIONS.md](../OPERATIONS.md) | DEV-06 | F02–04/10/20/30 | 설계 완료 / 기능 NOT RUN |
| R06 | Amazon | [INTEGRATIONS.md](../INTEGRATIONS.md) | DEV-08 | F13/15/16/17/19 | 설계 완료 / 기능 NOT RUN |
| R07 | Rakuten | [INTEGRATIONS.md](../INTEGRATIONS.md) | DEV-09 | F14–17/19 CSV | 설계 완료 / 기능 NOT RUN |
| R08 | 보충/재발주 | [OPERATIONS.md](../OPERATIONS.md) | DEV-10 | 중복incoming/MOQ/lead/cash | 설계 완료 / 기능 NOT RUN |
| R09 | 금액/분석 | [DATA_MODEL.md](../DATA_MODEL.md) | DEV-10,11 | Decimal/환불/통화·수수료 | 설계 완료 / 기능 NOT RUN |
| R10 | Telegram | [SECURITY.md](../SECURITY.md) | DEV-07 | F05/06/24 | 설계 완료 / 기능 NOT RUN |
| R11 | 자동화/worker | [ARCHITECTURE.md](../ARCHITECTURE.md) | DEV-01,04,06,13 | F02–08/22/23/27 | Worker 기반 구현; scheduler/outbox 후속 |
| R12 | 웹/모바일/PWA/i18n | [ARCHITECTURE.md](../ARCHITECTURE.md) | DEV-01–14 | 15화면/오프라인/중복/접근성 | 웹/PWA/i18n 기반 구현; 실제업무 후속 |
| R13 | 보안 | [SECURITY.md](../SECURITY.md) | DEV-02 | 인증/역할/CSRF/XSS/MFA/세션 | DEV02 실제PG·Browser 검증; 운영 HTTPS 후속 |
| R14 | Pi 운영 | [DEPLOYMENT.md](../DEPLOYMENT.md) | DEV-12 | F09–12/22 ARM64/실장비 | 설계 완료 / 기능 NOT RUN |
| R15 | 백업 | [BACKUP_RECOVERY.md](../BACKUP_RECOVERY.md) | DEV-13 | F23/25/26 실제복원 | 설계 완료 / 기능 NOT RUN |
| R16 | 외부감시 | [DEPLOYMENT.md](../DEPLOYMENT.md) | DEV-13 | F27 업무별 health | 설계 완료 / 기능 NOT RUN |
| R17 | 자체창고 | [docs/contracts/MODULES.md](../docs/contracts/MODULES.md) | DEV-15–17 | 공존/바코드/피킹/택배 | 설계 완료 / 기능 NOT RUN |
| R18 | AI 선택 | [docs/PROJECT_SCOPE.md](../docs/PROJECT_SCOPE.md) | DEV-18,AI-01 | disabled AI E2E | 설계 완료 / 기능 NOT RUN |
| R19 | GitHub | [docs/GITHUB_WORKFLOW.md](../docs/GITHUB_WORKFLOW.md) | DEV-00–18 | 정책/helper unit+integration, current SHA CI/보호 | AUTO-01 PR5/6/7 및 DEV01 PR4 자동 Ready·병합 실증 완료 |
| R20 | 개별DEV검증 | [TEST_PLAN.md](../TEST_PLAN.md) | DEV-00–18 | 30장애/회귀/보안/이전요구감사 | DEV01 실행증거 report 참조; 물류테스트 NOT RUN |
| R21 | public 보호 | [SECURITY.md](../SECURITY.md) | DEV-전단계 | path/pattern scanner+수동PII검토 | 기반 경계/로그/secret 검사; 운영보안 후속 |
| R22 | 단순·저비용 | [INTEGRATIONS.md](../INTEGRATIONS.md) | DEV-전단계 | 비용 분류/단일DB/no paidAI | 설계 완료 / 기능 NOT RUN |
| R23 | 출처/신뢰 | [OPERATIONS.md](../OPERATIONS.md) | DEV-04,08–10 | freshness/snapshot/CSV evidence | 설계 완료 / 기능 NOT RUN |
| R24 | 승인정책 | [OPERATIONS.md](../OPERATIONS.md) | DEV-02,07,10 | 한도/위험/version/일회 | DEV02 최근 재인증·권한 기반; 실제 업무 승인 DEV07/10 |
| R25 | 모델/단계 | [DEV_PROGRESS.md](../DEV_PROGRESS.md) | DEV-전단계 | Sol Medium/Astra FINAL/AI01 분리 | 설계 완료 / 기능 NOT RUN |

## 사용자 지시 전체 섹션 대조
| ID | 원문 영역 | 연결 요구 | 감사 결과 |
|---|---|---|---|
| U00 | §0 프로젝트/GitHub | R19,R25 | 기준선에 반영; 구현/운영 증거는 각 DEV |
| U01 | §1 목표·SKU | R01,R17 | 기준선에 반영; 구현/운영 증거는 각 DEV |
| U02 | §2 최상위목표 | R01–R18,R24 | 기준선에 반영; 구현/운영 증거는 각 DEV |
| U03 | §3 Dot정책 | R18,R25 | 기준선에 반영; 구현/운영 증거는 각 DEV |
| U04 | §4 스택 | R22 | 기준선에 반영; 구현/운영 증거는 각 DEV |
| U05 | §5 웹 | R12 | 기준선에 반영; 구현/운영 증거는 각 DEV |
| U06 | §6 모듈 | R02–R18,R22 | 기준선에 반영; 구현/운영 증거는 각 DEV |
| U07 | §7 외부창고 | R04,R05 | 기준선에 반영; 구현/운영 증거는 각 DEV |
| U08 | §8 Amazon/Rakuten | R06,R07,R23 | 기준선에 반영; 구현/운영 증거는 각 DEV |
| U09 | §9 재고무결성 | R02,R03,R11 | 기준선에 반영; 구현/운영 증거는 각 DEV |
| U10 | §10 30장애 | R20 | 기준선에 반영; 구현/운영 증거는 각 DEV |
| U11 | §11 보충/재발주 | R08,R09 | 기준선에 반영; 구현/운영 증거는 각 DEV |
| U12 | §12 Telegram | R10,R24 | 기준선에 반영; 구현/운영 증거는 각 DEV |
| U13 | §13 Pi | R14 | 기준선에 반영; 구현/운영 증거는 각 DEV |
| U14 | §14 백업 | R15 | 기준선에 반영; 구현/운영 증거는 각 DEV |
| U15 | §15 외부감시 | R16 | 기준선에 반영; 구현/운영 증거는 각 DEV |
| U16 | §16 보안 | R13,R21 | 기준선에 반영; 구현/운영 증거는 각 DEV |
| U17 | §17 자체창고 | R17 | 기준선에 반영; 구현/운영 증거는 각 DEV |
| U18 | §18 로드맵 | R25 | 기준선에 반영; 구현/운영 증거는 각 DEV |
| U19 | §19 GitHub | R19 | 기준선에 반영; 구현/운영 증거는 각 DEV |
| U20 | §20 자동병합 | R19 | 기준선에 반영; 구현/운영 증거는 각 DEV |
| U21 | §21 DEV완료 | R20 | 기준선에 반영; 구현/운영 증거는 각 DEV |
| U22 | §22 50SKU | R01,R20 | 기준선에 반영; 구현/운영 증거는 각 DEV |
| U23 | §23 문서 | R20 | 기준선에 반영; 구현/운영 증거는 각 DEV |
| U24 | §24 비용 | R22 | 기준선에 반영; 구현/운영 증거는 각 DEV |
| U25 | §25 범위제한 | R20,R25 | 기준선에 반영; 구현/운영 증거는 각 DEV |
| U26 | §26 실제검증 | R19,R20,R21 | 기준선에 반영; 구현/운영 증거는 각 DEV |
| U27 | §27 통합감사 | R01–R25 | 기준선에 반영; 구현/운영 증거는 각 DEV |
| U28 | §28 GitHub/보고 | R19,R20 | 기준선에 반영; 구현/운영 증거는 각 DEV |
| U29 | §29 절대원칙 | R02,R03,R09,R11,R15,R18,R19 | 기준선에 반영; 구현/운영 증거는 각 DEV |

## 누락 감사 결과
기존 구현은 GitHub bootstrap뿐으로 과거 완료 기능 없음. 초기의 미완료 설계 문서/데이터 모델/30장애/50SKU전략을 보완.
재고 상태 합산 오류·부분95/93·메일unknown·복원replay·위험경로/rename/현재SHA검사 누락을 설계/도구에서 수정.
외부 계정/양식/가격/장비 미확인은 각 담당 단계 prerequisite로 명시; 운영 성공으로 처리 안함.
역사적 DEV00 미병합 blocker는 PR1–3 병합/guarded auto-merge 실증으로 해소. 현재 상태는 PROJECT_STATUS가 기준.

## DEV01 지시서 §0–32 대조

| ID | 요구영역 | 구현/범위판정 | 실제검증·증거 |
|---|---|---|---|
| D01-00 | 모델/작업환경 | 기존branch 재사용, main/PR1–3 원격재확인; 모델정책 유지 | GitHub 확인/DEV01 report |
| D01-01 | 필수문서 | 17문서·최신scope/상태/안전 확인 및 오래된GitHub현황 정정 | PROJECT_STATUS/DEV_PROGRESS/GITHUB_WORKFLOW |
| D01-02 | 목표/범위 | 실제웹/API/DB/Worker/개발CI, 실제업무기능 제외 | apps/packages/tests |
| D01-03 | 기술/버전 | Node24.19/pnpm10.34.7/TS5.9/Postgres17.11 정확pin+lock | frozen install/build/typecheck |
| D01-04 | 디렉터리/경계 | 요청구조+공유runtime, source import/declared graph 검사 | pnpm check:boundaries |
| D01-05 | 웹 | 15route/nav/active/404/error/desktop/mobile/未実装 | browser routing tests |
| D01-06 | i18n | ja 기본/ko/en fallback/잘못된locale/AsiaTokyo/정확bigint | unit locale/format + browser |
| D01-07 | PWA | manifest/icon/static-only cache/no write queue/offline UI | browser cache/offline/no replay |
| D01-08 | Fastify | live/ready/version/404/error/ID/input/loopback/no write | unit/API integration/fault |
| D01-09 | PostgreSQL | actual PG pool/Drizzle/migration hash-lock-transaction/schema | integration4/fault DB cases |
| D01-10 | Compose | digest17.11/health/volume/loopback/dev-test 분리/정지재개 | 실제 up/down/up/DB fault/evidence |
| D01-11 | Worker | 독립readonly process/DB/status/signals/drain/restart | unit lifecycle/fault processes |
| D01-12 | 환경 | schema validation/missing/bad port/env/url/production deny | unit config/fault startup |
| D01-13 | 로그 | JSON allowlist/service/time/code/ID/duration, raw values 제외 | unit redaction/fault secret marker |
| D01-14 | 공통계약 | 오류/page25–100/UTC/ID/bigint string; framework-free domain | contract unit/source boundary |
| D01-15 | 테스트환경 | 실제실행/count>0/skip0 guard/results JSON/실제DB | runner reports |
| D01-16 | Unit | 설정/error/ID/locale/date/routes/worker/config generation | test:unit |
| D01-17 | DB통합 | 연결/migrate/repeat/schema/query/close/ready/격리 | test:integration+fault |
| D01-18 | 장애 | PG delay/stop-recover/rollback/auth fail/signals/stop error | test:failures |
| D01-19 | 웹통합 | actual browser desktop+mobile / API실패 mock명시 | test:e2e 8 cases |
| D01-20 | CI | 기존workflow유지+실제PG/frozen/lint/TS/tests/build/browser/artifact | Quality CI current SHA 확인 |
| D01-21 | 병합정책 | 모든 영역 독립 검증, 일반 PR, 기존 Draft Ready, 실제 suite 누락/실패 차단 | AUTO-01 live Actions/report |
| D01-22 | Pi | 실물없음; Node/Pg ARM64manifest/nativeoptional 사전확인 | docs/ARM64; 실기기 NOT RUN |
| D01-23 | 50SKU | 60 fixture 보존; page/ID/bigint; 실제CRUD엔진 후속 | 기존fixture tests+contract |
| D01-24 | Dot/비용 | AI/유료backend/managedDB 의존0 | dependencies/source review |
| D01-25 | 보안 | public/ignored env/secret/loopback/no unauthwrite/logredaction | scanner/unit/fault |
| D01-26 | 성능 | buildsize/API/workerRSS/docker 관측; Pi 추정금지 | report 환경·측정값 |
| D01-27 | 문서 | README beginner steps+개발/DB/API/worker/CI/문제해결 | validate_docs + 실제실행 |
| D01-28 | 이전감사 | R01–25/DEV00 설계대조, 후속업무 미완료보존 | report/trace/RISK_REGISTER |
| D01-29 | 체크리스트 | 실제테스트증거로만 상태표시, 구현과병합 분리 | report/status |
| D01-30 | SelfReview | 의존성/자원/예외/로그/캐시/keyboard/CI차이 점검수정 | report 수정목록 |
| D01-31 | 완료조건 | 실제실행·테스트·commit/push/PR/CI 확인; 병합별도 | 최종보고/GitHub |
| D01-32 | 최종보고 | 요청13항목 순서대로 실제증거·미실행 표기 | 최종보고 |

이 표는 구현 연결표이며 결과 자체는 [DEV01 보고](dev-reports/DEV-01.md)의 실제 실행과 현재SHA CI가 기준이다. 물류/원장/운영연동은 NOT RUN 유지.

AUTO-01 최신 지시 §0–16: 수동 승인 제거/일반 PR/Ready·metadata 분리/영역별 실제 suite/main-owned 독립 검증/최초 전환/PR4 보존/이벤트 호환성/운영 배포 분리를 [실행 대장](dev-reports/GITHUB-AUTOMATION-01.md)으로 추적한다.

## DEV02 지시서 §0–30 대조

| ID | 범위 | 구현·증거 / 후속 경계 |
|---|---|---|
| D02-00 | 최신상태/문서 | main86d8ea5 확인, DEV02 새 branch, 선행 baseline PR9 자동병합; 문서·실구조 감사 |
| D02-01 | 통합 목표 | AuthService/Policy/UI/PG 통합; 운영 물류 없음 |
| D02-02 | 선택/스택 | Argon2id/TOTP/local sessions, ADR-DEV02-01, npm metadata/audit, 선택OIDC port |
| D02-03 | 스키마 | forward0001/Drizzle snapshot,11테이블+기존 foundation, realPG lock/hash/rollback |
| D02-04 | Bootstrap | local TTY 숨김입력/실제TOTP/경쟁1명/중복차단, 개발 credential 복구 |
| D02-05 | 비밀번호 | 14자/Argon2id19MiB t3 p1/bounded2/dummy hash, 실제 검증 |
| D02-06 | session | 서버hash/cookie/30분·12시간/epoch/rotation/실제프로세스재시작 |
| D02-07 | MFA | 등록·교체·일회복구/replay경쟁, 미완료세션5분/관리차단 |
| D02-08 | RBAC | 5역할/17permission/현재 grant 평가/self상승거부/lastadmin; 창고 scope는 DEV03 FK 전까지 거부 |
| D02-09 | API | AUTHENTICATION API표, schema/401·403·429·503/no-store/기본deny |
| D02-10 | CSRF/CORS/XSS | Origin+session CSRF/기본same-origin/React escape/CSP/실제Browser |
| D02-11 | rate | PostgreSQL account/IP/session UPSERT, 경쟁·재시작/forwarded header 불신 |
| D02-12 | 감사 | append trigger/hash chain/시각·policy digest/critical tx rollback;7년 운영 보존DEV13 |
| D02-13 | 웹 | 기존15route, ja/ko/en, 로그인/MFA/설정/관리/감사/권한 메뉴 |
| D02-14 | PWA | static-only/민감 no-cache/no queue/offline clear/다중탭 logout/지연 응답 차단 |
| D02-15 | 기존API·Worker | health/version/오류/로그/종료 유지, Worker readonly/no browser session |
| D02-16 | 개발설정 | auth:setup 기존env 보존, Windows CLI 안내, production 차단 유지 |
| D02-17 | Unit | 실제 runner 개수 보고, DB 의존 항목은 realPG suite로 추가 검증 |
| D02-18 | Integration | actualPG17 제약/경쟁/회수/rollbacks/CLI/migration/데이터보존 |
| D02-19 | Security/Failure | 보고서 S01–S30 개별 mapping; 실제 출고승인은 DEV07 미실행 |
| D02-20 | Browser | 실제 API/PG Desktop+Mobile, 인증 Mock 성공 사용0 |
| D02-21 | AUTO01 | PR9 successor+인증 baseline 확장, main 검증기/세 workflow 유지 |
| D02-22 | 회귀 | 기존Unit34/PG4/Failure14/Browser8의 assertion 보존; 익명 UI→실제 로그인 fixture |
| D02-23 | 자원 | shared Linux x64 실측, Argon concurrency2, bounded 목록/pool; Pi NOT RUN |
| D02-24 | Self Review | 경합·토큰/Secret·MFA·CSRF·audit·PWA·native dependency 검토와 회귀 |
| D02-25 | 이전감사 | R01–25/U00–29 유지, 실제 업무·운영 미완료 구분 |
| D02-26 | GitHub | 실제 PR/현재head CI/Independent/Guarded/merge 증거는 DEV02 report 최신 구간 |
| D02-27 | 문서 | README/보안/구조/모델/계약/위험/상태/테스트/report 업데이트 |
| D02-28 | 완료조건 | 로컬 구현·검증과 원격 병합을 분리; 결과를 추정하지 않음 |
| D02-29 | 보고 | runner count/source SHA/run URL/실제 merge commit만 기록 |
| D02-30 | 운영원칙 | 운영배포/외부창고/결제/출고 부작용0, Dot/paid AI0 |

R01–R10/R14–R17/R23 물류·운영/시장/백업 기능은 담당 DEV에 이관, 구현 완료로 바꾸지 않았다.
R11/R12/R13/R19/R20/R21/R22/R24/R25 중 DEV02 관련 부분만 구현·검증했다.
U00–U29의 범위/순서/최소50 SKU/60개 fixture/AI01·FINAL 감사·운영승인 분리는 그대로 유지한다.

DEV02 PR10은 실제 자동병합 ef3566c/원격211개 통과. 최종 UI 제한·만료 안내/동일IP공격/
MFA lifecycle·세션회수 정상 경로는 새 파일로 추가, 이전 인증 snapshot은 보존했다. 최신219개 로컬 결과 및 원격 증거는 DEV02 보고에 연결한다.
