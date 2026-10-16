# DEV01 개발/DB/API/Worker 실행 계약

## 버전/패키지 경계
Node24.19.0 / pnpm10.34.7 / TypeScript5.9.3 / React19.3.1 / Vite7.3.7 / Tailwind4.3.3 /
Fastify5.12.7 / Drizzle ORM0.45.4 / PostgreSQL17.11(bookworm index digest 고정).
추가 공통 `runtime` 패키지는 실제 공유되는 설정·안전 로그·종료 coordinator만 담당합니다.
`domain`은 프레임워크/DB 의존0, `contracts→domain`, `db→contracts`, API/worker→db/contracts/runtime,
web→contracts, integrations는 disabled capability metadata만. root dev dependencies는 테스트/CLI용 workspace 참조입니다.
`pnpm check:boundaries`는 선언된 workspace cycle/domain 외부 의존을 검사합니다.
exports.source는 tsx/Vitest/tsc noEmit에, default/dist는 build 이후 Node에 사용합니다. recursive build는 의존 순서입니다.

## 환경
NODE_ENV는 development/test만 허용; production은 향후 인증/배포 gate 전까지 차단.
HOST는 loopback, API_PORT3001/WORKER_PORT3002(1–65535), DB_POOL_MAX 기본5(1–20),
DB_TIMEOUT_MS1000(50–10000): acquisition/connect/SQL statement timeout 및 추가100ms client query timeout.
DATABASE_URL은 PostgreSQL URL만, 비밀을 오류에 출력하지 않습니다. secret 없는 operational 서비스는 존재하지 않습니다.
개발 .env의 로컬 임의 자격증명과 CI synthetic wms_test_only는 모두 운영 사용 금지.

## DB/마이그레이션
`pnpm db:generate`는 Drizzle schema에서 SQL/snapshot/journal을 생성합니다.
`pnpm db:migrate`는 .env의 loopback wms_dev user/DB(또는 test의 wms_test)에만, `pnpm db:migrate:test`는 엄격한 TEST_DATABASE_URL guard를 거칩니다.
허용 테스트 대상: loopback 또는 db-test, DB명/사용자 wms_test, query 옵션 없음.
production DB 실행/자동 reset/drop 명령은 제공하지 않습니다. 앱 시작은 migration을 실행하지 않습니다.

최소 테이블은 `foundation_metadata(key PK text,value text NOT NULL,updated_at timestamptz)`뿐입니다.
상품/원장 테이블은 DEV03/04 예정입니다. typed Drizzle insert/select를 실제 PostgreSQL에서 검증합니다.
runner는 readMigrationFiles의 SHA256/시간ID와 `wms_migrations` 기록을 대조하고 advisory transaction lock으로 중복 실행을 직렬화합니다.
한 번의 transaction에서 pending SQL+기록을 commit, SQL 실패 시 신규 테이블/기록 모두 rollback.
순서/해시/알 수 없는 기록이 다르면 중지합니다. 기존 migration 파일을 고치지 말고 forward migration을 추가하세요.
과거 해시 손상은 원인·릴리스 파일부터 대조, 장부를 억지로 수정해 통과시키지 않습니다.
롤백은 expand/contract 호환 릴리스 또는 백업 복원+외부 상태 대조(DEV12/13), 자동 down migration 없음.

테스트는 검증된 테스트 DB 안에 `wms_test_<uuid>` schema를 만들고 종료 후 자신의 schema만 제거합니다.
장애 테스트도 container ID·synthetic DB/user·port를 검증 후 정지합니다. 실제 운영 대상은 거부합니다.

## API 계약
모두 loopback의 비민감 GET, `Cache-Control: no-store`, `x-request-id` 헤더.
- `/api/v1/health/live`:200, 프로세스 응답. DB가 없어도 정상.
- `/api/v1/health/ready`:200이면 DB 연결/기초 테이블/모든 migration hash·개수 일치; 아니면503.
- `/api/v1/version`:200, name/version/apiVersion만.
- 나머지 경로/업무쓰기:404 공통 오류. API base `/api/v1`.

오류 `{code,messageKey,requestId,retryable,details:null}`.
validation400/oversize413/unsupported415/NOT_FOUND404/INTERNAL_ERROR500/SERVICE_UNAVAILABLE503. stack/SQL/환경값 노출0.
x-request-id는 8–64 ASCII 안전문자만 전달하고 누락/변형은 UUID로 교체; correlation ID는 DEV01에서 requestId와 동일.
GET live query는 추가 필드를 거부합니다. API server 일반 logging을 끄고 allowlist metadata만 JSON으로 기록합니다.
요청 원문 URL/query/header/cookie/body/error.message와 DB URL은 로그하지 않습니다.
앱 비정상 startup/설정/종료는 code와 nonzero exit. SIGINT/SIGTERM은 새로운 요청 수락중지·서버close·pool.end,
10초 초과시 실패 종료. 인증/RBAC/CSRF 및 업무 endpoint는 DEV02 이후입니다.

## Worker
`pnpm dev:worker`(watch) 또는 `pnpm start:worker`. 독립 PID, DB/schema 확인 후 readonly idle 상태.
HTTP `/health/live`, `/health/ready`(3002). readiness는 요청마다 실제 DB 확인, 주기30초 probe는 lightweight/비중첩.
worker heartbeat는 미래 업무 성공 여부를 뜻하지 않습니다. 업무 backlog 감시는 DEV13.
중복 start/stop, startup 도중 stop, SIGTERM/SIGINT, 실패 exit 및 재시작은 별도 검증.
정지시 probe 타이머 취소→진행 probe/start 대기→HTTP close→DB close. 예외는 숨기지 않고 coordinator가 실패로 기록.
scheduler/outbox/task claim·메일·출고·판매API쓰기·매입·결제·Telegram은 미구현이며 아무 외부 호출도 없습니다.

## PWA/i18n
일본어 기본, ja/ko/en selector. ko/en 미번역 key는 일본어 fallback, 잘못된 locale=ja.
내부시각 UTC, Intl 표시는 Asia/Tokyo; bigint 수량은 decimal string, JPY format은 bigint 그대로 처리합니다.
15 화면은 nav/라우팅/active/404/모바일 drawer/키보드/에러 UI만. 실제 업무는 未実装.
Dashboard는 API/DB readiness와 마지막 확인시각·개발상태만 표시, 실제 재고처럼 보이는 수치 없음.
API fetch는 로드/사용자 재확인/온라인·visibility 복귀 때만. 숨은 탭의 반복 polling 없음.

build plugin은 고정 index/manifest/icon와 hash JS/CSS만 precache. 인증 API 응답·network 문서 응답을 저장하지 않습니다.
API 경로/비GET/다른 origin/query는 SW 처리 대상 제외. 등록된 UI route의 offline navigation만 정적 shell fallback.
write queue/background sync 없음, offline은 경고/서버작업 불가 표시. HTTPS 또는 브라우저가 허용하는 localhost 필요.
아이콘은 자체 SVG 벡터, Manifest sizes:any/maskable; iOS 실제 설치/실기기 브라우저 검증은 아직 하지 않았습니다.

## 테스트/CI/의존성 검토
필수 runner는 unit/integration/fault JSON의 실제 count 및 failed/pending/todo0을 검증; browser도 expected>0/skipped/flaky0.
CI PostgreSQL service·로컬 Compose test DB를 사용, fault는 실제 stop/start, browser는 build+실제 API+DB와 desktop/mobile Chromium.
results JSON만 CI artifact(7일)로, .env/로그/전체workspace/DB는 upload 안함. browser outputDir은 별도 하위경로로 unit결과 보존.
`pnpm audit`에서 Drizzle-kit의 @esbuild-kit/core-utils→esbuild0.18.20 moderate(CORS dev server) 발견;
해당 dependency만0.25.12로 override(검증/서명 무력화 아님), generate/typecheck/build/tests 및 audit 재검증.
deprecated loader 자체의 upstream 교체는 추적하되 현재 알려진 vulnerability0. 라이선스는 별도 SPDX inventory 확인.

Windows/macOS는 실행 문서/플랫폼 중립 Node/패키지 지원을 준비했지만 실제 OS 테스트는 미실행.
ARM64 manifest/native optional package 존재는 사전검증일 뿐 Pi 실측/arm64 실행/전원검증을 대신하지 않습니다.

라이선스 metadata inventory: MIT/Apache-2.0/ISC/BSD-2/BSD-3/BlueOak-1.0.0, caniuse-lite CC-BY-4.0, LightningCSS MPL-2.0. 배포 시 LICENSE/NOTICE 및 관련 소스 의무를 유지하며 자동 법률준수 보증으로 보지 않는다.

Vitest SSR은 explicit workspace source alias로 fresh checkout에서도 build 없이 unit/integration을 실행한다. 로컬 dist를 지운 상태로 CI 순서 검증 완료.

## Codex cloud의 읽기전용 홈에서 실행
일반 개발자 홈은 이 설정이 필요 없습니다. 이번 cloud 인스턴스는 홈 쓰기가 제한되어 아래 cache/tool 경로를 사용했습니다.

```bash
export COREPACK_HOME=/workspace/.cache/corepack
export XDG_CACHE_HOME=/workspace/.cache
export XDG_DATA_HOME=/workspace/.local/share
export PNPM_HOME=/workspace/.local/pnpm
export PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright
export DOCKER_CONFIG=/workspace/.docker
mkdir -p /workspace/.wms-tools/bin
corepack enable --install-directory /workspace/.wms-tools/bin pnpm
export PATH="/workspace/.wms-tools/bin:$PATH"
pnpm install --frozen-lockfile --store-dir /workspace/.cache/pnpm-store
```

기존 사용자 자격증명을 복사/출력하지 않습니다. cloud별 cache 경로를 repository 설정에 하드코딩하지 않습니다.
일반 CI는 Actions가 준비한 Node/pnpm과 정상 홈을 사용합니다.
