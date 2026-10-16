# 기술 결정 기록

| ADR | 결정 | 이유·대안/영향 |
|---|---|---|
| 001 | Modular monolith, API/worker separate processes, PostgreSQL 단일 DB | 50+ SKU에 충분, DB transaction 경계 유지; microservices/K8s/Redis broker 도입 안함 |
| 002 | React TS/Vite/Tailwind/PWA, Fastify/Drizzle, Node24/Pg17/pnpm10 | 사용자 기본안, ARM64·LTS 기반; 정확 patch/lock/image digest는 DEV01/12에서 실증 |
| 003 | 복식 수량 원장+원자 잔액/예약 | 실물/진행상태 중복합산 방지, append-only+reversal; 단순 snapshot 덮어쓰기 기각 |
| 004 | 외부 불명 부작용 hold | exactly-once remote 보장 불가; blind retry로 중복출고 방지 |
| 005 | 승인 대상 version/hash/nonce/policy 고정 | 변경 후 과거승인 재사용/중복 클릭 방지 |
| 006 | DB outbox/inbox/lease+fence+restore epoch | 신규 유료 큐 없이 durable, DB 밖 부작용은 대조 필요 |
| 007 | money bigint minor/Decimal, 통화·환율·세금version | JS float 오차 및 추정/확정 혼합 방지 |
| 008 | 창고 adapter + 증거기반 공통 command | 외부·자체 공존, 내부 재개발 최소화 |
| 009 | AI disabled, AI01 실제 연결 연기 | 최신 지시 우선; Dot/유료API 없이 출시/전체운영 가능 |
| 010 | main merge와 운영배포 분리, 모든 유형 독립 검증 기반 자동병합 | AUTO-01 최신 지시: 이전 main verifier/기존 baseline으로 자기인증 방지 |
| 011 | 암호화 Drive+정기 실제 restore+독립 heartbeat | 단일 Pi 장애·백업손상·거짓정상에 대비 |
| 013 | 출시후보 개발완료와 실제운영 분리, 출시직전 Astra 감사 | DEV14 첫출시와 DEV18 확장/최종감사 순서 해석 충돌 방지; DEV14 범위 감사 후 운영, DEV18 전체범위 감사 갱신 |
| 012 | 일본어 기본/locale 확장, 정적 shell만 offline | 모바일 편의와 위험command 오프라인 확정 금지 양립 |

## 기존 기준과 이번 지시 차이
초기 파일은 GitHub bootstrap만 있고 시스템 설계가 미완료였다. 기존50 SKU/Dot amendment는 유지하며
전체23+ 문서·모듈/DB/30장애·로드맵을 추가한다. 과거 DEV18 Dot 필수 해석은 최신 지시로 폐기,
Astra는 완성 직전 FINAL-AUDIT-01. 초기 report의 테스트 예정은 실제 실행 결과로 대체하되
운영 기능 미구현을 유지. 과거 automation의 label만 고위험 검증/CI 결과 미확인 문제는 현재SHA 소유자검토·명시 gate로 보완.

미확정 ADR: DEV02 인증 provider, DEV06 이메일 provider/업체양식, DEV08/09 실제 권한/계약,
DEV12 ingress/장비/자원한도, DEV13 키 소유자/외부감시 무료조건. 미래 결정으로 현재 성공을 추정하지 않는다.

## DEV01 결정
ADR014: runtime 공통패키지(config/log/shutdown) 추가, 실제 공유 로직만 이동. Domain에 infra 의존 없음.
ADR015: 최초 foundation_metadata만 migration; 상품/재고 스키마는 DEV03/04로 유지. explicit/transaction+hash+lock migration.
ADR016: DEV01 production/공개 bind 차단; 인증 없는 임시 업무API 금지. 외부 호출 모듈은 metadata disabled.
ADR017: test PostgreSQL 분리·schema/container guard와 zero/skip 판정, browser 결과디렉터리 분리해 이전결과 보존.
ADR018: PostgreSQL17.9 초기 검증 후 공식 최신17 minor17.11을 확인해 digest pin 업데이트·재검증.
ADR019: transitive esbuild0.18 moderate는 해당 경로만0.25.12 override, Drizzle CLI/audit/전체 검증으로 확인.
이전 branch-protection 필수/PR1미병합 표현은 현재 owner-confirmed Actions guarded 모드·PR1–3 병합 사실로 정정.

AUTO-01: 신규 일반 PR/승인 label·comment·review 제거. 이전 main 검증기·안전성 baseline·영역별 실제 suite를 요구한다. 정책 전환 PR5, 실제 제어 코드 자동병합 PR6/7.

## ADR-DEV02-01 — 로컬 인증 / 2026-10-16

선택: Argon2id(@node-rs/argon2 2.2.2) + TOTP(OTPAuth9.5.2) + PostgreSQL opaque server sessions.
대안 OIDC는 가입/외부 계정/네트워크 및 운영 의존을 추가하므로 현재 선택하지 않았다.
VerifiedIdentity/IdentityProvider 계약은 향후 OIDC의 subject 검증만 수용하고 권한 부여와 분리한다.
단일PG/무료/Node24/native ARM64 사전지원, 비밀번호 해싱 bounded 동시성2·19MiB/time3로 시작하며
Pi 실측은 DEV12에서 결정한다. 시크릿 암호화는 Node AES-GCM으로 위임하고 TOTP/해시 알고리즘을 자체 작성하지 않았다.
보안 파라미터·API·유한 세션·scope 전환·운영 제한은 [구현 계약](AUTHENTICATION.md).

독립 검증의 익명 웹/count1 가정은 PR9의 명시적 main-owned successor로 교체한다.
원래 기준선과 모든 화면 assertion을 보존하며 실제 로그인 fixture/manifest 수 검증으로 의미를 확장한다.
새 인증 테스트·seed는 별도 인증 registry로 보존하고 구현 코드를 overlay할 수 없게 경로를 제한한다.
이 전환은 AUTO-01 workflow/merge 권한 및 실패·skip 차단을 완화하지 않는다.

## ADR-DEV03-01 — Catalog와 실제 창고 Scope

마스터 metadata는 단일 PG 모듈로 구현하고 실제 수량 엔진을 앞당기지 않는다. 기존 Global grant를 보존하는
warehouse_id FK/partial unique를 추가하고 공유 read와 Global write를 분리한다. 권한 버전1 의미를 변경하지 않는
additive catalog-policy-v1을 명시적 SQL로 업그레이드하여 기존 관리자도 Bootstrap 없이 새 Permission을 받는다.
CAS+actor별 command_results+append-only revision/audit, mapping 종료/대체, warehouse row-lock recursive 위치 검사로
중복/경합을 통제한다. code/name keyset B-tree와 표준 PostgreSQL pg_trgm GIN을 사용하며 별도 검색 서비스는 도입하지 않는다.
일반 Catalog 수정은 반복 MFA를 요구하지 않고 mapping/account/역할 변경은 최근 재인증을 유지한다.
기존 검증 snapshot/워크플로를 유지하고 Catalog profile과 새 테스트만 확장한다.

## DEV-04 / ADR-Inventory — PostgreSQL Commit 안전장치와 증거 분리

원장 INSERT Trigger로만 수량 Projection을 갱신하고 Deferred Constraint로 SKU별 균형·잔액·예약·출고·수령 합계를 Commit 검증한다. 기존 Auth/Catalog 잠금과 충돌하지 않게 Session/User→Aggregate→metadata share→정렬 Account→예약→Audit 순서를 사용하며 전체재고 전역74002 mutex는 추가하지 않는다. 위험 조정과 미검증 Manual/External Evidence는 DEV07/08/09 Port가 없으므로held. 합성Posting은 isolated Test DB 또는 명시적인 loopback 개발 flag만 허용하며 운영활성화와 분리한다. DB timestamp는 JS Date로 복사하지 않는다. [구현 계약](INVENTORY_LEDGER.md).
