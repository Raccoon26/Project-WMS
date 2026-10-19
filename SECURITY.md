# 보안 기준 / 공개 저장소

DEV02 인증 구현 계약은 [AUTHENTICATION](docs/AUTHENTICATION.md). 운영 준비 완료와 구분한다. 운영 데이터/secret/PII/실제 구매·출고·공급처 계약/DB dump/개인키는 커밋 금지.
`.env.example`은 이름/비밀 아닌 기본값만. secret은 운영 권한 제한 파일/vault에 별도 주입, 로그 마스킹,
CI는 sandbox/mock만 사용. 공개 Git 이력에 노출되면 즉시 폐기·회전 후 이력 대응; 삭제 커밋만으로 회복 아님.

## 위협·통제
- 관리자 탈취: OIDC+MFA 또는 Argon2id 비밀번호·TOTP; DEV02 ADR에서 선택. Access는 추가 경계이며 API RBAC 대체 아님.
- 세션: 서버 저장 opaque token hash, Secure/HttpOnly/SameSite, 로그인 rotation, idle30분/절대12시간,
  중요 승인 재인증5분; logout/revoke epoch, 브라우저 localStorage token 금지.
- CSRF: same-origin+Origin 검사+CSRF token; CORS allowlist. XSS: React escaping, CSP nonce, no raw HTML, 첨부 sandbox.
- 입력: Fastify schema/DB constraint/parameterized Drizzle, CSV formula sanitization, 크기/행수/파일 형식 제한,
  허용 MIME만, 매크로 실행 금지, 파일명/경로 traversal·SSRF endpoint 차단.
- 권한: 서버 action/scope/창고/금액 검사, 기본 deny, 권한 변경 audit+승인, 관리자 출고 승인 무권한 403.
- webhook: provider가 지원하는 서명/secret/재전송 timestamp 검증, raw bytes 검증 후 파싱;
  서명 미지원이면 pull 대조/계정 및 증거 검토, 이메일 From만으로 신뢰 금지.
- Telegram: 설정된 numeric user ID/chat ID allowlist, username 신뢰 금지; webhook secret header,
  callback token 서버 조회·hash 저장, 짧은 만료/일회 CAS; payload에 비밀/직접 권한 명령 미포함.
- rate limit: 로그인/IP·사용자·명령별, proxy trust는 tunnel 지정 경로만, brute-force 차단/외부 알림.
- 로그: correlation ID, 비밀/이메일 본문/고객 주소 최소화, 감사 append-only, 운영자 원장 UPDATE 권한 금지.
- DB: 외부 포트 미공개, migration/app/backup 역할 분리, 최소권한·volume 암호화 검토, TLS 경계.
- 공급망: lock frozen, action SHA pin, 의존성 갱신 PR도 main-owned 독립 자동 검증, 취약점/라이선스 검사 DEV01부터,
  critical/high exploitable 취약점 출시 차단; 예외는 근거/기한/소유자 승인.

보존 목표: 원장·금전 감사7년(일본 세무/법적 요건 확인), 일반로그30일, 실패 첨부/PII는 최소기간·접근 제한.
DB 복제만으로 변조 불가 증거가 되지 않으므로 감사 digest+암호화 오프디바이스 백업으로 대조.
비밀 탐지는 파일명 검사만으로 충분하지 않다. DEV00은 가짜 키 주입 기반 scanner 테스트+현재 diff 검사;
전용 secret scanner/호스팅 secret scanning의 이용 조건 및 전체 history 검사는 별도 증거로 기록한다.

## 보안 사고
자동 부작용 중지→세션/키 회수→증거 보존(비밀 공개 금지)→외부 작업 대조→복구→원인/범위/재발방지 기록.
보안 보고는 GitHub private vulnerability reporting 사용 가능 여부 확인 후 이용; 공개 issue에 secret/PII 첨부 금지.

## DEV01 실행 기반의 실제 경계
DEV01 시점: production NODE_ENV 및 non-loopback bind를 차단, health/version GET만 제공; 실제 무인증 업무쓰기 없음.
DB credentials는 root.env(ignored), 웹 VITE 변수로 전달하지 않음. 테스트 URL/사용자/DB/schema/container guard.
API/worker 로그는 필드 allowlist로 raw URL/header/cookie/body/error/DB URL을 직렬화하지 않는다.
SW는 build-static allowlist만, API/no-store 및 write queue 없음. 인증/MFA/RBAC/CSRF는 DEV02에 구현; 운영 ingress는 DEV12 예정.
개발 app DB role은 Compose 개발 전용 superuser이므로 운영 최소권한 구성으로 오인하지 않는다. DEV12 역할분리 필요.
Drizzle-kit transitive esbuild moderate는0.25.12 override 후 audit/CLI 재검증. 자세한 경계는 [개발 계약](docs/DEVELOPMENT.md).

## DEV02 현재 검증 범위

Argon2id/TOTP 암호화·replay/복구코드 일회 사용/세션·epoch/CSRF/권한 회수/감사 rollback을 실제PG에서 검증한다.
로그아웃·offline·오래된 me 응답은 UI identity를 지우며 PWA는 민감 API를 캐시하지 않는다.
정확한 파라미터·제한·공개 경로·DB 역할 한계·실제 결과는 [인증 계약](docs/AUTHENTICATION.md)과 [보고](docs/dev-reports/DEV-02.md).
실제 HTTPS/DB role 분리/키 escrow/백업 복원/7년 보존/Pi 검증은 아직 NOT RUN, DEV12/13에서 완료한다.

## DEV03 현재 구현

Warehouse grant를 실제 FK와 SQL 범위 필터에 연결했다. 공유 Catalog read와 Global 정의 변경을 분리하며 scope만으로 users/roles/상품 전역 쓰기를 허용하지 않는다. mapping/account/역할 중요 변경은 기존 최근 MFA, 일반 metadata 수정은 session/CSRF/Permission을 매 transaction 재평가한다. no-store/static-only PWA/로그 allowlist/운영 차단을 유지한다.
[Catalog 상세 계약](docs/CATALOG.md). 실제 결과는 [DEV03 보고](docs/dev-reports/DEV-03.md)에서 확인한다.

## DEV04 현재 작업

불변 복식 재고 원장·예약·증거·부분 입출고·이동·정정·대조를 기존 Catalog/Auth UUID에 연결한다. 내부 구현·로컬 검증을 완료했다. GitHub 병합은 연결된 실제 PR 결과로 별도 판정하며 운영 배포가 아니다. [구현 계약](docs/INVENTORY_LEDGER.md) · [실제 검증/미실행 범위](docs/dev-reports/DEV-04.md). 미검증 수동/외부 증거와 위험 조정은 보류한다.

DEV04 synthetic inventory opt-in은 기본false, 이미 production을 차단하는 loopback 개발 API에만 적용한다. 테스트 schema는 엄격한 wms_test UUID namespace+test DB URL 이중 guard를 사용한다. 외부·수동 증거는 validated로 승격하지 않으며 실제 Provider 신뢰/위험 조정 승인 전 held. 제한된 NOLOGIN DB 역할의 원장 SELECT/UPDATE·DELETE 거부는 테스트에서 검증하되, 운영 migration/app/backup 역할 구성과 superuser 공격 저항은 DEV12 책임이다.
