# DEV-02 — Authentication, Authorization, MFA, Session Security & Audit

2026-10-16. 개발·합성 검증 환경의 구현 보고다. 운영 준비/배포/실제 물류 완료를 의미하지 않는다.
원격 DEV02 CI·자동 병합은 실행 후 이 문서의 GitHub 증거 구간에만 기록한다.

## 구현 범위와 선택

기존 React/Fastify/PostgreSQL/Drizzle/Worker workspace를 유지했다. AuthService와 HTTP adapter,
비밀 없는 공통 DTO/IdentityProvider, Permission 평가기, 실제 PG 저장소와 웹 AuthGate/보안·사용자·감사 panel을 추가했다.
OIDC 대신 무료·로컬 Argon2id + TOTP + opaque PG session을 선택했다. [ADR](../DECISIONS.md#adr-dev02-01--로컬-인증--2026-10-16),
정확한 파라미터/API/RBAC/경계는 [구현 계약](../AUTHENTICATION.md)이 기준이다.

- Argon2id19,456KiB/time3/parallelism1, 프로세스 동시2개. 알 수 없는 ID는 dummy 검증, 로그인 식별자 ASCII 정규화.
- 256-bit opaque token의 hash만 저장. HttpOnly/Strict/path=/api, loopback HTTP 개발 예외, HTTPS면 Secure.
- idle30분/absolute12시간, MFA 제한 세션5분, 중요 재인증5분 미만. logout/epoch/상태/현재 grant 재검증.
- TOTP Secret AES-GCM+owner AAD 암호화, 제한된 시간창·step replay 거부. 복구 코드128-bit×10 hash 일회 소비.
- 5역할/17Permission, self role 변경·마지막 활성 관리자 제거 거부, 창고 미구현 scope는 실제 권한으로 허용하지 않음.
- Origin+session CSRF, durable account/IP/session rate, schema 추가필드 거부, CSP/escaping, 구조화 allowlist log.
- 감사 append-only trigger와 시각·policy까지 결합한 predecessor digest, 중요 변경과 같은 transaction.
- local auth:setup/bootstrap/recover, 고정 관리자·공개 가입/복구 API 없음. 실제 CLI PTY 검사 포함.

## Migration 및 통합

기존0000은 수정하지 않았다. `0001_auth.sql`/Drizzle schema/snapshot은 users,roles,permissions,
role_permissions,user_roles,sessions,mfa_credentials,mfa_codes,auth_attempts,auth_bootstrap,audit_events를 추가한다.
FK/unique/active grant partial unique/CHECK/index/append-only trigger를 실제PG17.11에서 검증했다.
Drizzle-kit BigInt default 직렬화 오류는 SQL literal default(-1)로 해결, `pnpm db:generate` 재실행에서 schema 차이0 확인.
생성 FK의 public 고정을 제거하여 validated search_path의 독립 test schema에 올바르게 연결했다.
DEV01-only schema→새 migration 실제 업그레이드에서 기존 foundation 행 보존, 반복·동시 적용/hash mismatch/누락 이력/실패 rollback 확인.
Worker는 기존 읽기 전용 프로세스 그대로이며 사용자 cookie/key를 요구하지 않는다. 운영 쓰기·외부 발송·출고0.

## 웹

기존15개 화면·라우트·레이아웃·모바일 drawer를 보존했다. 미구현 물류 기능은 未実装 유지.
실제 로그인/잘못된 비밀번호/MFA 등록·오류·복구코드/보안 설정/중요 재인증/사용자 생성·역할 부여/감사 페이지를 추가했다.
ja/ko/en, 원래 로컬 경로 복귀, 권한 메뉴/직접 API 거부, logout/Back/직접 URL/만료/다중 탭 동기화 포함.
오프라인에서는 identity를 지우고 민감 데이터를 표시하지 않는다. PWA static cache/API no-store/write queue0 유지.
Authenticator 앱으로 전환하는 제한 MFA 흐름은 유지하며, 완전 세션은 foreground에서 현재 권한을 재조회한다.
로그아웃 뒤 늦게 도착한 실제 me 응답은 generation으로 무효화한다.

## 실제 테스트

Linux x64 cloud, Node24.19.0/pnpm10.34.7/PG17.11 Docker. 최신 runner 결과는 실행 후 아래에 기록한다.
기존 DEV01의 unit34/PG4/fault14/browser8 assertion을 유지했다. 익명 UI 테스트는 main-owned 실제 로그인 fixture로 전환했다.
Unit 목록 중 DB가 필요한 계정/epoch/감사/회수 항목은 Mock 통과 대신 실제PG Integration에서 검증했다.
0개/skip/todo/flaky는 성공 처리하지 않는다. 운영 데이터/API key는 사용하지 않았다.

실제 명령: frozen install/audit/check:boundaries/lint/typecheck/db:migrate:test/test:unit/test:integration/
test:failures/build/test:e2e, Python 정책 runner/docs/secret scanner, actionlint, 파일별 bash -n.
브라우저는 Desktop+Mobile Chromium, 실제 API/PG/비밀번호/TOTP를 사용했다. 가짜 인증 성공 응답0.
지연 응답 검사는 실제 fetch Response 전달만 늦춰 경합을 만든다.

### 보안 음성 시나리오 추적

| ID | 실제 검증 및 범위 |
|---|---|
| S01–S03 | 미인증/비밀번호 실패/MFA 미완료 보호 API401; 실제 실패 감사 |
| S04 | 잘못된 TOTP·복구 코드 반복 시429, 계정/IP/session bucket |
| S05,S08 | 동시 logout 후 복사된 token 재사용401 |
| S06,S07 | 실제DB idle/absolute deadline 만료401 |
| S09,S10 | 역할 회수 기존 session403·경쟁 직렬화, 비활성/epoch401 |
| S11,S12,S14 | Viewer/Operator 관리자 API403, self role 확대403 |
| S13 | 공통 Permission 평가기 unknown/다른 창고 deny; 실제 창고 API는 DEV03 미구현 |
| S15–S17 | CSRF 누락·변조·타세션·악성 Origin403, login 포함 |
| S18 | 실제Browser 저장 표시이름 HTML escape + CSP, 반사 입력 schema 거부 |
| S19 | 동일 계정/IP 실패429, 동시 PG bucket·서비스 재시작 후 횟수 유지 |
| S20,S21 | TOTP/복구코드 동시 사용에서 하나만 성공, 다른 session replay 거부 |
| S22 | 실제 pool 종료 시 auth503/no bypass; 기존 PG stop/start/readiness 회귀 유지 |
| S23 | 실제 Node API 프로세스 SIGTERM→재시작→세션 유지→폐기 후401→SIGINT 종료 |
| S24 | audit INSERT 실패 시 사용자·역할 변경 rollback, 감사 UPDATE/DELETE 거부 |
| S25 | 정확히5분 재인증 만료403, Browser 비밀번호+새 TOTP 재인증 성공 |
| S26 | 마지막 관리자 inactive/locked/MFA disable409 |
| S27 | 빈PG 동시 bootstrap 하나만 성공·완전한 관계/코드; 실제TTY 중복 등록 실패 |
| S28 | 악성 body/header/cookie/password가 응답·로그에 노출되지 않음 |
| S29 | 익명→password→MFA token 교체와 이전 token401 |
| S30 | 실제Browser logout→Back/직접 URL에서 보호 UI 미노출 |

F24 공통 인증·권한 차단은 검증했다. 실제 출고 승인·Telegram·원장 변화0 업무 실증은 DEV07에 남긴다.

## Self Review 및 수정

- 서비스별 dummy hash 병렬 생성이 해싱 한도와 충돌: 공유 hash로 수정, 실제 로그인/실패 재검증.
- MFA 오류401이 challenge를 없앰: 제한 흐름과 완전 session 상실을 구분, 잘못된 후 정상 코드 Browser 검사.
- 로그인 초기 me 응답과 locale 전환 경합: 선택 locale을 로컬 URL에 보존, 기존 locale 회귀 재통과.
- 모바일 Authenticator 전환과 보안 재조회 충돌: 제한 MFA 보존/관리권한 미부여, foreground 재검증 회귀.
- 새 사용자 생성과 페이지 이동 경합/역할 저장 시 페이지 초기화: 생성 완료 확인·현재 cursor 보존, 실제UI 테스트.
- logout 뒤 오래된 me 응답이 UI를 복원할 수 있음: generation 무효화 및 실제 지연 응답+다중탭 regression.
- 새 API default-deny를 추가하고 테스트 전용 비-API 오류 probe와 정책 namespace를 구분. 배포된 업무 API는 모두 /api/v1.
- 거부 감사/감사 시각·policy digest/role grant·revoke 이벤트, last-admin active policy version 검사 보강.
- 기준선 count1/익명 UI 및 browser config 상대 report 경로 충돌을 발견·수정. 실제 실패를 성공으로 숨기지 않았다.
- Token leakage/MFA bypass/IDOR/CSRF/XSS/시간창·재사용/권한 회수/DB race/rollback/PWA/cache/native dependency를 실제 회귀와 대조했다.

## 이전 요구사항 감사

[추적표](../REQUIREMENTS_TRACEABILITY.md)의 R01–R25/U00–U29/D01/D02를 대조했다.
기존 익명 화면 가정·오래된 DEV01 branch 안내·인증 미구현 상태 문구를 정정했다.
원장·예약/출고/결제·메일unknown/시장·업무승인·백업·운영 배포는 후속 DEV03–18 책임 그대로다.
최소50SKU(상한 아님)/60개 fixture/25기본·100최대 페이지/단일PG/저비용/Dot 및 유료AI0/FINAL Astra 정책을 유지했다.
추가 인증 SaaS/Redis/유료 API/외부 계정/실제 사용자·거래 데이터를 도입하지 않았다.

## 자원 및 의존성

2026-10-16 공유 cloud Linux x64 AMD EPYC9V74/Node24.19.0, 다른 검증과 동시에 측정한 참고값:
Argon verify10회 평균17.50ms/최대23.29ms, 실제HTTP password+TOTP 완료1회53.76ms.
측정 프로세스 RSS243,728,384 bytes/peak282,726,400 bytes(테스트 helper·tsx 포함, API 단독 RSS가 아님).
웹 최종 build 크기는 현재 build 로그의 실제 값으로 기록한다. Pi SLO나 p95 합격 수치로 외삽하지 않는다.
Argon2 2.2.2 공개2026-10-06, OTPAuth9.5.2 공개2026-09-03; upstream 둘 다 archived/disabled false,
최근 push 각각2026-10-15/10-12 metadata 확인. MIT 라이선스, pnpm audit 알려진 취약점0.
Linux ARM64 GNU/musl·Windows·macOS binary 제공은 확인했지만 실제 해당 OS/장비 실행은 NOT RUN.

## GitHub 독립 검증과 병합

선행 PR9: [정책 전환](https://github.com/Raccoon26/Project-WMS/pull/9), 실제 squash
`aebdb09773638b2a8c22cd0c93340d93ec1e4818`.
[Quality38871262470](https://github.com/Raccoon26/Project-WMS/actions/runs/38871262470),
[Independent38871446714](https://github.com/Raccoon26/Project-WMS/actions/runs/38871446714),
[Guarded38871651370](https://github.com/Raccoon26/Project-WMS/actions/runs/38871651370) SUCCESS.
이전 HEAD 실행 도중 push된 run의 controller는 오래된 SHA를 거부했으며 최신 실행으로만 병합했다.
DEV02 branch는 최신 main을 정상 merge, force/direct main push 없음.

기존 main 검증기와 verification-baseline.json은 보존, successor는 실제 로그인/동적 migration manifest 검사로 의미를 확장한다.
새 verification-auth.json은 인증 tests/합성 fixture만 보관, 구현 overlay/path 탈출/기존 인증 증거 삭제를 거부한다.
이전 preflight의 호출 계약을 보존하고 추가 auth_preflight를 execute/CLI에 결합해 구 main 회귀와 호환한다.
`auth: privilege escalation` / `auth: session` / `auth: CSRF`는 실제 PG 테스트 이름과 runner 결과다.
AUTO-01의 CI→Independent→Guarded 구조/권한·실패차단 유지. 수동 review/label/comment/Draft 요구0.

DEV02 PR/정확한 HEAD/원격 run/실제 merge SHA는 실행 후 추가한다. 아직 미래 병합을 완료로 기록하지 않는다.

## 남은 제약 / 롤백

- 실제 Pi/Windows/macOS 실행, 운영 HTTPS/Ingress/최소 DB권한/키 escrow/백업·복원/감사7년은 NOT RUN, DEV12/13.
- 실제 warehouse FK/scope는 DEV03. 제품·원장·출고·결제·외부 연동/업무 승인/AI는 이번 범위 밖.
- 개발 credential 복구는 최초 관리자 비밀번호/MFA만 회복한다. 권한 자체와 실제 운영 복구를 자동 해결하지 않는다.
- 세션/rate bucket 보존·정리 schedule은 DEV13, 현재 목록은 bounded/cursor이며 비-health API 요청 제한을 적용한다.
- Branch Protection 없는 자체 수정 CI의 완전한 보안을 보장하지 않는다. 기존 trust/base-CAS 한계 유지.
- 롤백은 검증된 revert PR, 위험 서비스·세션 폐기 후 구버전 적용. 인증 테이블을 자동 DROP/reset하지 않는다.
  새 스키마는 이전 읽기 전용 Worker와 호환하며 운영 DB의 destructive downgrade는 제공하지 않는다.
- DEV03은 원격 DEV02 독립 검증·자동 병합을 실제 확인한 후 시작한다. 운영 배포는 승인하지 않았고 수행하지 않았다.

## 로컬 전체 검증 확정 (원격 CI와 구분)

실제 runner: Python70 / Unit44 / PG Integration23 / Security·Failure36 / Browser38,
총211 passed, failed0/skipped0/todo0/flaky0. 기존 DEV01 고유60개도 모두 포함한다.
Frozen lock/audit/boundary/lint/typecheck/migration/build/docs/Secret/actionlint/bash 구문 검사를 실제 실행했다.
마지막 보강 과정에서 컨테이너 ID를 누락한 별도 process regression1건이 명확히 실패했다.
올바른 test container ID를 지정한 전체 Failure36을 재실행해 모두 통과했다. 누락을 Skip/성공 처리하지 않았다.
브라우저의 잘못된 pre-logout 기대값과 Playwright route lifecycle 정리 경합도 수정했으며,
최종38개는 실제 서버 Response 전달 지연 방식과 전체 Desktop/Mobile을 통과했다.

로컬 독립 검증도 성공했다. 별도 합성 checkout에서 이전 main(aebdb09)의 검증기를 사용해
candidate Python70 + main Python68, frozen install/audit/boundary/lint/typecheck/PG migration/
Unit44/Integration23/Failure36/Browser38/build 및 실제 세 auth case를 재검증했다.
local event PR번호0·합성 source SHA이므로 GitHub 원격 증거나 실제 PR 병합으로 사용하지 않는다.
웹 번들에 실제 로컬 암호화 키/서버 DB·키 설정 문자열이 포함되지 않는 검사도 통과했다.
