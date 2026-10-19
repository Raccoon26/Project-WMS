# Project-WMS

일본 전자상거래용 WMS. **DEV-04 내부 재고·물류 엔진 구현 / 실운영·외부 전송 미활성**.
React·TypeScript·Vite·Tailwind 웹, Fastify API, PostgreSQL/Drizzle, 독립 Worker.
최소50 SKU는 수용 목표이며 상한이 아닙니다. Dot/유료 AI/운영 API 키 없이 실행합니다.

## 처음 실행하기

준비: Node **24.19.0**, pnpm **10.34.7**(packageManager 고정), Docker Engine/Desktop + Compose v2.
Windows에서는 Linux 컨테이너 모드를 사용합니다. 이 작업의 실증 환경은 Linux amd64이고 macOS/Windows 실제 실행은 미검증입니다.

```bash
git clone https://github.com/Raccoon26/Project-WMS.git
cd Project-WMS
corepack enable
pnpm --version
pnpm install --frozen-lockfile
cp .env.example .env
pnpm dev:setup
pnpm db:up
pnpm db:migrate
pnpm auth:setup
pnpm auth:bootstrap
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
preview에서 로그인하려면 API 실행 환경의 AUTH_ORIGIN을 `http://127.0.0.1:4173`으로 명시하고 API를 다시 시작합니다. 기존 .env 키를 재생성하지 마세요.
현재 NODE_ENV=production 실행은 DEV12 HTTPS·운영 배포 gate가 없어 의도적으로 중단됩니다.

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

PowerShell에서는 `cp` 대신 `Copy-Item .env.example .env`를 사용합니다. 나머지 최초 실행 명령은 동일합니다.
`pnpm auth:setup`은 기존 .env를 유지하며 무작위 암호화 키를 추가합니다. `pnpm auth:bootstrap`의
로그인 ID/표시 이름/숨김 비밀번호를 입력하고 출력되는 일회 등록 URI를 Authenticator 앱에 등록한 뒤
현재 코드를 확인하세요. 복구 코드는 한 번만 표시되므로 별도 안전한 장소에 저장합니다.
로그인 화면에서 ID/비밀번호→MFA를 입력합니다. 공개 기본 계정이나 고정 비밀번호는 없습니다.
Windows Terminal/PowerShell의 TTY가 필요하며 입력 리다이렉션은 거부합니다. 실제 Windows 실행은 NOT RUN입니다.
전체 CLI PTY integration suite는 POSIX/Python3를 사용하므로 Windows에서는 WSL2/Linux에서 실행합니다.
개발 전용 비밀번호·MFA 복구는 `pnpm auth:recover`, 실제 운영 복구 절차는 DEV12/13 별도입니다.
기존 키가 있으면 auth:setup은 덮어쓰지 않고 중단합니다.

테스트 환경은 아래처럼 설정합니다.

```powershell
$env:TEST_DATABASE_URL = 'postgresql://wms_test:wms_test_only@127.0.0.1:5433/wms_test'
$env:WMS_TEST_CONTAINER = (docker compose -f infra/compose/compose.test.yaml ps -q db-test).Trim()
```

## 문제 해결

- 인증503: `pnpm auth:setup`, root.env AUTH_ORIGIN과 접속 origin의 host/port, migration을 확인합니다. `localhost`와 `127.0.0.1`은 서로 다릅니다.
- TOTP 거부: 이미 사용한 30초 step은 재승인하지 않습니다. 새 코드 또는 사용하지 않은 복구 코드를 사용합니다.
- `CONFIG_INVALID`: NODE_ENV/DATABASE_URL/포트/loopback HOST 확인. 값 자체를 로그/issue에 붙이지 마세요.
- Readiness503 + Liveness200: DB 시작·접근·migration/checksum을 확인합니다. DB 장애만으로 API를 재시작할 필요는 없습니다.
- 비밀번호 불일치: 기존 volume은 최초 비밀번호를 유지합니다. `.env`를 복구하세요. 재생성 전에 개발 데이터 보존을 결정하세요.
- migration 실패/기록 불일치: 초기화하지 말고 [migration 안내](docs/DEVELOPMENT.md)를 따릅니다.
- 브라우저 미설치/캐시: Playwright 설치 완료 후 실행. Service Worker 검증은 production build/preview에서만 가능합니다.
- 포트 사용 중: API_PORT/WORKER_PORT는 설정 가능. 웹 proxy/E2E는 기본3001을 사용하므로 함께 조정해야 합니다.

## 구조와 문서

`apps/{web,api,worker}`, `packages/{domain,contracts,db,integrations,runtime}`, `tests/{unit,integration,fault,e2e}`, `infra/compose`.

[상태](PROJECT_STATUS.md) · [개발 안내](docs/DEVELOPMENT.md) · [DEV01 보고](docs/dev-reports/DEV-01.md) · [인증 계약](docs/AUTHENTICATION.md) · [DEV02 보고](docs/dev-reports/DEV-02.md) ·
[요구](REQUIREMENTS.md) · [구조](ARCHITECTURE.md) · [DB](DATA_MODEL.md) · [업무](OPERATIONS.md) ·
[범위](docs/PROJECT_SCOPE.md) · [모듈](docs/contracts/MODULES.md) · [로드맵](DEV_PROGRESS.md) ·
[테스트](TEST_PLAN.md) · [보안](SECURITY.md) · [배포](DEPLOYMENT.md) · [백업](BACKUP_RECOVERY.md) ·
[연동/비용](INTEGRATIONS.md) · [GitHub](docs/GITHUB_WORKFLOW.md) · [출시](RELEASE_CHECKLIST.md) · [AGENTS](AGENTS.md).

Public 저장소입니다. 실제 고객/공급처/원가/거래/운영키/설정/백업을 올리지 마세요.
CI·DB·API·Worker·패키지·인프라를 포함한 모든 변경은 main 소유 독립 검증과 필수 테스트 성공 시 승인 없이 병합합니다. main 병합은 운영 배포가 아닙니다.

## DEV03 상품·SKU·창고 사용

기존 DEV02 설치는 `.env`·암호화 키·관리자를 보존한 채 frozen install → DB up → migration으로 업그레이드합니다.
로그인 후 상품 화면에서 상품 생성/수정/상태 변경, 행의 SKU에서 내부 코드/바코드와 외부 mapping을 관리합니다.
창고 화면은 external_email/internal/fba/rsl 마스터와 기본 위치 계층을 관리합니다.
외부 연동 화면은 **비밀 없는 계정 참조와 로컬 코드 매핑**만 제공하며 실제 Provider 호출은 없습니다.
설정의 창고별 권한은 실제 창고 ID에 연결됩니다. 정상 상품 수정은 반복 MFA 없이 가능하지만 권한·매핑 등은 최근 재인증이 필요합니다.
기본25/최대100 keyset 페이지, 검색/정렬/필터/409 충돌 안내, 실패 입력 보존을 제공합니다.
재고는 미연동·미측정이며 알 수 없는 수량을0으로 표시하지 않습니다. 원장/입출고는 DEV04 이후입니다.
[Catalog 계약](docs/CATALOG.md) · [Windows PowerShell/문제 해결](docs/DEVELOPMENT.md#dev03-windows-powershell-개발-순서) · [DEV03 증거](docs/dev-reports/DEV-03.md).

## DEV04 현재 작업

불변 복식 재고 원장·예약·증거·부분 입출고·이동·정정·대조를 기존 Catalog/Auth UUID에 연결한다. 내부 구현·로컬 검증을 완료했다. GitHub 병합은 연결된 실제 PR 결과로 별도 판정하며 운영 배포가 아니다. [구현 계약](docs/INVENTORY_LEDGER.md) · [실제 검증/미실행 범위](docs/dev-reports/DEV-04.md). 미검증 수동/외부 증거와 위험 조정은 보류한다.

## DEV04 — 합성 재고를 로컬에서 확인

먼저 위 Node/pnpm/DB/Migration/인증 Bootstrap/MFA 안내를 완료한다. 실제 운영 재고를 자동으로 가져오거나 입력하는 단계가 아니다.

1. 기존 명령 `pnpm db:up`, `pnpm db:migrate`로 보존형 forward Migration을 적용한다. `down -v`/DB reset 금지.
2. API·Worker·웹은 기존대로 실행한다. 일반 기본값에서 수동/외부 재고증거는 보류된다.
3. 합성 재고를 명시적으로 실습할 때만 API 터미널에서 아래 opt-in을 설정한다. 실제 상품/실재고를 사용하지 않는다.

```bash
# Linux/macOS 개발 터미널 — 해당 API 프로세스에만 적용
WMS_SYNTHETIC_INVENTORY=true pnpm dev:api
```

```powershell
# Windows PowerShell / Docker Desktop+WSL2
$env:WMS_SYNTHETIC_INVENTORY="true"
pnpm dev:api
# 종료 후 opt-in 제거
Remove-Item Env:WMS_SYNTHETIC_INVENTORY
```

4. 기존 웹에 MFA 로그인하고 상품/SKU, 서로 다른 테스트 창고2개를 등록한다. 실제 UUID가 표시되는 상세에서 참조한다.
5. Inventory에서 SKU 검색·선택, 출발/대상 창고, `合成初期在庫`, 정수 수량·사유·증거 참조를 입력한다. 출처는 `合成テスト専用`을 명시 선택하고 저장한다. 기본단계에는 합성 seed가 자동실행되지 않는다.
6. Outbound/Transfer 계획→예약→명시된 부분 출발/수령 증거를 기록한다. 수령은 Inbound version과 Shipment line ID를 사용한다. 상세·원장·보류 상태를 확인한다. 같은 증거 재입력은 거부된다.
7. Ctrl+C로 정상 종료한다. 실습 flag를 해제하고 기존 DB/인증 Secret을 보존한다.

자동 검증은 기존 `pnpm test:unit`, `pnpm test:integration`, `pnpm test:failures`, `pnpm build`, `pnpm test:e2e`. Failure suite는 격리 테스트DB의 검증된 `WMS_TEST_CONTAINER`가 필요하며 다른 DB suite/브라우저와 동시 실행하지 않는다. [재고 계약](docs/INVENTORY_LEDGER.md), [DEV04 증거](docs/dev-reports/DEV-04.md).

## DEV05-1 문서 기반

문서 DB/내부 Snapshot application port만 추가한 단계다. 실제 XLSX/PDF 생성·미리보기·다운로드 명령/웹 화면은 아직 없다. 기존 개발 명령을 유지하고 Migration은 초기화 없이 forward 적용한다. 모든 문서는 Sample/발송 불가이며 기록으로 재고를 바꾸지 않는다. [문서 아키텍처·복구 계약](docs/DOCUMENTS.md) · [실제 진행/검증](docs/dev-reports/DEV-05.md).
