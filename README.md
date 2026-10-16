# Project-WMS

일본 전자상거래용 WMS. **DEV-01 실행 기반 구현 / 운영 업무 미구현**.
React·TypeScript·Vite·Tailwind 웹, Fastify API, PostgreSQL/Drizzle, 독립 Worker.
최소50 SKU는 수용 목표이며 상한이 아닙니다. Dot/유료 AI/운영 API 키 없이 실행합니다.

## 처음 실행하기

준비: Node **24.19.0**, pnpm **10.34.7**(packageManager 고정), Docker Engine/Desktop + Compose v2.
Windows에서는 Linux 컨테이너 모드를 사용합니다. 이 작업의 실증 환경은 Linux amd64이고 macOS/Windows 실제 실행은 미검증입니다.

```bash
git clone https://github.com/Raccoon26/Project-WMS.git
cd Project-WMS
# DEV-01 PR 미병합 동안만 아래 브랜치로 이동합니다. 병합 후에는 이 줄을 생략합니다.
git switch dev/dev-01-foundation
corepack enable
pnpm --version
pnpm install --frozen-lockfile
cp .env.example .env
pnpm dev:setup
pnpm db:up
pnpm db:migrate
```

`dev:setup`은 예제의 placeholder만 로컬 무작위 값으로 바꾸며 비밀값을 출력하지 않습니다.
기존 사용자 `.env`가 있으면 덮어쓰지 않습니다. 생성된 개발 설정은 운영에 사용하지 마세요.
개발 DB는 `127.0.0.1:5432`로만 바인딩됩니다. `.env`는 커밋 금지입니다.

별도 터미널에서 각각 실행합니다.

```bash
pnpm dev:api
pnpm dev:worker
pnpm dev:web
```

브라우저 주소: `http://127.0.0.1:5173`. 웹은 `/api`를 API의 loopback3001로 proxy합니다.
API와 Worker는 root `.env`를 읽습니다. 웹에는 DB 주소·비밀번호를 전달하지 않습니다.
개발 watch가 필요 없으면 `pnpm start:api`, `pnpm start:worker`를 사용합니다.
Production build 검증은 `pnpm build`, 정적 build 확인은 `pnpm --filter @wms/web preview`입니다.
현재 NODE_ENV=production 실행은 DEV02/12 보안·배포 gate가 없어서 의도적으로 중단됩니다.

```bash
curl --fail http://127.0.0.1:3001/api/v1/health/live
curl --fail http://127.0.0.1:3001/api/v1/health/ready
curl --fail http://127.0.0.1:3001/api/v1/version
curl --fail http://127.0.0.1:3002/health/ready
```

종료: 각 앱 터미널 Ctrl+C(SIGINT) → `pnpm db:down`. 기본 종료는 volume을 보존합니다.
**`docker compose down -v`는 해당 개발/테스트 DB를 삭제합니다. 운영 DB에서 사용하지 마세요.**

## 테스트

개발 DB와 다른 PostgreSQL/volume/사용자/포트5433을 사용합니다. 실제 PostgreSQL이 필수이며 SQLite로 대체하지 않습니다.

```bash
pnpm db:test:up
export TEST_DATABASE_URL=postgresql://wms_test:wms_test_only@127.0.0.1:5433/wms_test
export WMS_TEST_CONTAINER="$(docker compose -f infra/compose/compose.test.yaml ps -q db-test)"
pnpm db:migrate:test
pnpm lint
pnpm typecheck
pnpm check:boundaries
pnpm test:unit
pnpm test:integration
pnpm test:failures
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
PYTHONPATH=scripts python3 -m unittest discover -s scripts -p 'test_*.py' -v
pnpm db:test:down
```

Linux 브라우저 라이브러리가 없으면 `pnpm exec playwright install --with-deps chromium`가 OS 패키지 권한을 요구할 수 있습니다.
0개·skip·failed 테스트는 성공으로 취급하지 않으며 최신 JSON 결과는 ignored `test-results/`에 기록합니다.
장애 테스트는 지정된 **테스트 컨테이너만 실제 stop/start**합니다. 다른 DB와 동시 테스트하지 마세요.
GitHub CI는 고정 이미지의 별도 PostgreSQL service와 같은 명령, 데스크톱·모바일 Chromium E2E를 실행합니다.

PowerShell에서는 `Copy-Item .env.example .env`를 사용하고 테스트 환경을 아래처럼 설정합니다.

```powershell
$env:TEST_DATABASE_URL = 'postgresql://wms_test:wms_test_only@127.0.0.1:5433/wms_test'
$env:WMS_TEST_CONTAINER = (docker compose -f infra/compose/compose.test.yaml ps -q db-test).Trim()
```

## 문제 해결

- `CONFIG_INVALID`: NODE_ENV/DATABASE_URL/포트/loopback HOST 확인. 값 자체를 로그/issue에 붙이지 마세요.
- Readiness503 + Liveness200: DB 시작·접근·migration/checksum을 확인합니다. DB 장애만으로 API를 재시작할 필요는 없습니다.
- 비밀번호 불일치: 기존 volume은 최초 비밀번호를 유지합니다. `.env`를 복구하세요. 재생성 전에 개발 데이터 보존을 결정하세요.
- migration 실패/기록 불일치: 초기화하지 말고 [migration 안내](docs/DEVELOPMENT.md)를 따릅니다.
- 브라우저 미설치/캐시: Playwright 설치 완료 후 실행. Service Worker 검증은 production build/preview에서만 가능합니다.
- 포트 사용 중: API_PORT/WORKER_PORT는 설정 가능. 웹 proxy/E2E는 기본3001을 사용하므로 함께 조정해야 합니다.

## 구조와 문서

`apps/{web,api,worker}`, `packages/{domain,contracts,db,integrations,runtime}`, `tests/{unit,integration,fault,e2e}`, `infra/compose`.

[상태](PROJECT_STATUS.md) · [개발 안내](docs/DEVELOPMENT.md) · [DEV01 보고](docs/dev-reports/DEV-01.md) ·
[요구](REQUIREMENTS.md) · [구조](ARCHITECTURE.md) · [DB](DATA_MODEL.md) · [업무](OPERATIONS.md) ·
[범위](docs/PROJECT_SCOPE.md) · [모듈](docs/contracts/MODULES.md) · [로드맵](DEV_PROGRESS.md) ·
[테스트](TEST_PLAN.md) · [보안](SECURITY.md) · [배포](DEPLOYMENT.md) · [백업](BACKUP_RECOVERY.md) ·
[연동/비용](INTEGRATIONS.md) · [GitHub](docs/GITHUB_WORKFLOW.md) · [출시](RELEASE_CHECKLIST.md) · [AGENTS](AGENTS.md).

Public 저장소입니다. 실제 고객/공급처/원가/거래/운영키/설정/백업을 올리지 마세요.
CI·DB·API·Worker·패키지·인프라를 포함한 모든 변경은 main 소유 독립 검증과 필수 테스트 성공 시 승인 없이 병합합니다. main 병합은 운영 배포가 아닙니다.
