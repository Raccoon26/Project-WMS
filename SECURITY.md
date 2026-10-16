# 보안 기준 / 공개 저장소

현재 인증 구현 없음(DEV02). 운영 데이터/secret/PII/실제 구매·출고·공급처 계약/DB dump/개인키는 커밋 금지.
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
- 공급망: lock frozen, action SHA pin, 자동 업데이트 PR 수동 위험 검토, 취약점/라이선스 검사 DEV01부터,
  critical/high exploitable 취약점 출시 차단; 예외는 근거/기한/소유자 승인.

보존 목표: 원장·금전 감사7년(일본 세무/법적 요건 확인), 일반로그30일, 실패 첨부/PII는 최소기간·접근 제한.
DB 복제만으로 변조 불가 증거가 되지 않으므로 감사 digest+암호화 오프디바이스 백업으로 대조.
비밀 탐지는 파일명 검사만으로 충분하지 않다. DEV00은 가짜 키 주입 기반 scanner 테스트+현재 diff 검사;
전용 secret scanner/호스팅 secret scanning의 이용 조건 및 전체 history 검사는 별도 증거로 기록한다.

## 보안 사고
자동 부작용 중지→세션/키 회수→증거 보존(비밀 공개 금지)→외부 작업 대조→복구→원인/범위/재발방지 기록.
보안 보고는 GitHub private vulnerability reporting 사용 가능 여부 확인 후 이용; 공개 issue에 secret/PII 첨부 금지.

## DEV01 실행 기반의 실제 경계
production NODE_ENV 및 non-loopback bind를 차단, health/version GET만 제공; 실제 무인증 업무쓰기 없음.
DB credentials는 root.env(ignored), 웹 VITE 변수로 전달하지 않음. 테스트 URL/사용자/DB/schema/container guard.
API/worker 로그는 필드 allowlist로 raw URL/header/cookie/body/error/DB URL을 직렬화하지 않는다.
SW는 build-static allowlist만, API/no-store 및 write queue 없음. DEV02 auth/MFA/RBAC/CSRF와 운영 ingress는 아직 미구현.
개발 app DB role은 Compose 개발 전용 superuser이므로 운영 최소권한 구성으로 오인하지 않는다. DEV12 역할분리 필요.
Drizzle-kit transitive esbuild moderate는0.25.12 override 후 audit/CLI 재검증. 자세한 경계는 [개발 계약](docs/DEVELOPMENT.md).
