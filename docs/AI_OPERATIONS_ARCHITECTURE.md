# AI 운영 자동화 아키텍처 — Ubuntu 독립 실행 / Windows + Dots 선택 운영

상태: **장기 요구사항 및 구현 로드맵 명세** (실제 Dots 연결/운영 판매 자동화 구현 완료가 아님).
기준: 2026-10-19. 상세 요구 R26–R31, 개발 단계 [DEV_PROGRESS.md](../DEV_PROGRESS.md), [결정](DECISIONS.md), [검증](../TEST_PLAN.md).

## 1. 변경 불가능한 최상위 조건

**Ubuntu 상시 서버가 System of Record이자 유일한 업무 트랜잭션 실행 주체다.**
Windows PC와 Dots를 모두 종료하거나 네트워크에서 제거해도, 승인된 정상 판매 프로세스는 Ubuntu 서버에서 계속 수행되어야 한다. Windows 또는 Dots가 종료됐다는 이유로 판매 주문 수집, 재고 예약, 출고 처리, 채널 동기화, 작업 재시도, 감사 로그가 정지하면 출시 불가다. 단 Ubuntu·DB·외부 Provider 자체 장애 시에는 안전한 보류와 복구를 적용하며 무조건 성공을 보장하지 않는다.

- **Ubuntu 노트북(x86-64)**: 초기 운영 우선. API/Web/Worker/Scheduler/PostgreSQL/Outbox/Inbox/Marketplace 어댑터/백업/감시를 실행. Windows, AI, Dots 프로세스·세션·라이선스가 업무 실행의 선행조건이 아니다.
- **Windows**: 웹브라우저를 통한 운영 단말. 로그인/MFA 및 검증된 WMS API를 사용하고, 서버에 DB 직접 접근하지 않는다. Windows 장치가 꺼져도 DB·Worker·Scheduler는 계속 동작한다.
- **Dots**: 선택적 AI 운영 관리자. 읽기·분석·이상 징후 분류·보고서·관리자에게 제안·정책 내 안전한 운영 명령에 사용. **업무 상태의 원천, 예약·원장 작성자, 유일한 스케줄러, 무인 외부 발송 엔진이 아니다.**
- **향후 Raspberry Pi(ARM64)**: 교체 가능한 호스트. 운영을 Windows로 이전하지 않고 동일한 Compose·정확한 DB 백업/복원·아키텍처별 빌드 및 실측 성능을 검증한다. Ubuntu Server x86-64를 먼저 검증하되 ARM64 이식성을 유지한다.

## 2. 기능 경계 및 명령 흐름

```text
Amazon JP (승인된 SP-API)        Rakuten (RMS/RSL/계약 또는 CSV)
           │                               │
           └── Provider adapters (capability / rate-limit / trust) ──┐
                                                                       ▼
Ubuntu: Scheduler → Inbox/Staging → Order Validation → Order State Machine
                          │                  │
                          │           Inventory Reservation Port
                          │                  ▼
                          │         Immutable Double-entry Ledger
                          │                  │
                          └─ Outbox/Jobs → 승인 정책 → Outbound/Documents/Email/Carrier
                                              │
                                 Confirmed evidence → Shipment/Receipt/Sync
                                              │
                                 Audit/Exceptions/Reports/Monitoring
                                              │
                           WMS authenticated, versioned Admin API / PWA
                                     ▲                     ▲
                              Windows browser          Optional Dots
```

원장 변경은 기존 DEV04 Inventory Application Command/Posting/UoW에서만 허용. 원장 테이블 직접 UPDATE/DELETE, AI의 SQL 실행, AI 지시를 통해 검증 우회, 브라우저 값 신뢰 금지. 주문 수집·문서 생성·이메일 발송·실제 출발·실제 도착은 서로 다른 증거/상태이며 임의 동치 처리 금지.

## 3. Ubuntu 독립 주문 처리 계약 (OPS-01)

**업무별 Source of Truth**를 정의한다: 주문 상태는 검증된 Provider Event와 내부 Order Aggregate, 재고는 DEV04 원장, 승인 상태는 승인 엔진, 외부 발송 완료는 명확한 Provider 증거. 외부 Provider 결과 불명은 성공·실패를 추측하지 않는다.

- **수집**: Amazon/Rakuten별 주문 조회/이벤트/CSV staging; permission/capability 검증, cursor/high-water mark, observed_at, source_event_id, raw payload hash, PII 최소화·보존기한, 중복·역순/지연·취소 선행 처리. API가 불가능하면 명시적 수동 보류 경로 제공(무인 자동운영이라 표시 금지).
- **검증**: SKU mapping, 상태·위치·채널, 가격·통화·수량 BigInt/Decimal, 중복 이벤트, 최신성, 보안 scope, 품절/oversell, invalid row/quarantine. 주문 ID와 order-item별 unique/canonical hash; 주문 생성과 재고 예약을 원자적·멱등 명령으로 처리.
- **예약**: 동일 SKU가 두 마켓에서 팔리는 경합을 실제 PG 행 잠금과 원장 불변식으로 제어. 이미 판매된 수량·예약·운송중 수량의 중복 차감 금지. 불충분 재고는 held + 경고/승인, 절대 음수 확정 금지.
- **채널 재고 동기화**: 매체별 제약/최신성/허용 주문량/안전 재고/버퍼를 고려해 목표 게시량 제안·발행. 재전송은 Provider 별 증명된 idempotency가 있을 때만; unknown/429/부분 성공은 조회·대조/hold. 공급처의 처리량/지연 때문에 '항상 양쪽 채널에 정확한 실시간 재고'를 보장한다고 주장하지 않는다.
- **출고·배송**: 출고 계획→예약→DEV05 문서→DEV06 외부지시 또는 지원된 Provider→ACK/피킹→실제 출발 증거→운송→수령 증거. 이메일 전송, 문서 생성, Provider ACK는 실제 shipped 증거가 아니다. Tracking 업데이트도 idempotent·versioned·provider capability 기반.
- **취소·반품**: 결제 전 취소, 출고 전 취소, 출고 중/후 취소 요청, 배송 반품, 미수령, 부분 취소, 부분 반품을 명시적으로 분리. 출고 중에는 외부 취소 확인 전 예약을 해제하지 않는다. 반품 물품은 증거 기반 Good/Damaged/Quarantine 검사 이후 원장 반대·새 거래로 기록한다.
- **환불/금전**: 확인 가능한 금액·통화·세금·수수료, 결제와 환불의 차이를 분리. 실금액 외부 부작용은 별도 정책/권한·관리자 승인과 결과 조회가 필수; 미승인·Unknown 자동 재실행/환불 금지. Provider/계약이 없으면 검토대기·수동증거로 분리한다.
- **실행**: Ubuntu worker/scheduler에서 DB 내 durable job, lease/fencing, transactional inbox/outbox, dead-letter, bounded retry/backoff, circuit breaker, per-provider quota, restore epoch 격리, 장애 알림. 모든 상태 변경은 audit actor/system ID 및 request/job/correlation trace로 연결한다.
- **관측**: 마지막 sync 성공·staleness, order lag, 예약 충돌, 게시 재고 불일치, outbox unknown, 배송 지연, 반품/환불 보류, 백업 복원/DB/Worker 상태를 분리해 제공한다.

## 4. Dots에 친화적인 관리 화면 및 API

기존 React 일본어 기본/한국어·영어/PWA/접근성·서버 RBAC를 유지하며 다음을 *AI가 없어도 사람에게 동일하게 제공*한다.

1. 주문·재고·출고·채널별 통합 대시보드(최신성/출처/실제 vs 추정 명확히).
2. Provider별 건강상태(권한, 만료, 401/403/429, quota, last success, backlog, stale).
3. 불일치/지연/중복 의심/unknown/재고부족/반품·환불 hold 등 Exception Queue.
4. 상세 원인·증거·전이·연관 SKU/Order/Shipment를 보여주는 사건 Drill-down.
5. 허용된 안전 명령('sync 조회 다시 실행', '보류 이유 확인', '재대조 요청' 등)과 위험 작업 승인 요청의 구분.
6. 짧고 안정적인 화면 경로/명확한 라벨/키보드 포커스/명시적 상태/확인 모달/서버 Version 및 Idempotency 결과; 브라우저 UI만을 권한 경계로 사용하지 않음.
7. 읽기 전용 보고서/export: 근거·시각·상태·신뢰도를 포함하고 PII 마스킹.
8. AI 수행 의도가 기록될 때는 actor=service/AI-assistant와 delegated_user/source_session/command/reference/approval_id/model-tool provenance을 구분해 Audit. 'Dots가 작업했다고 말했다'는 실행 증거가 아님.

**AI 작업 경계**: 초기는 읽기 전용/제안. 추가 권한은 AI-01 실제 지원과 사용자 허가가 확인된 경우 제한된 명시적 서버 Operation API에만 제공. Idempotency-Key + If-Match + MFA/위임 Scope + 보류 정책 + 결과 검증을 적용. **AI에게 PostgreSQL 계정, 운영 쉘/SSH, Migration, raw ledger write, Secrets, 일반 Admin 계정, 무제한 결제/환불 권한을 부여하지 않는다.** 정책 변경, 대량 출고, 위험 재고조정, 취소/환불 및 실제 외부 금전 부작용은 사람이 검토·승인하고 실행 시 재검증; AI 자기 승인 금지. 조회 재시도처럼 무해한 명령도 rate limit/audit 필요.

## 5. Dots 기능 확인 및 접근 방식

공식 문서: https://help.openai.com/en/articles/20001530-getting-started-with-your-dot (2026-10-19 확인).
Dots는 자체 **클라우드 컴퓨터**가 있으며, 제공 계정/플랜/출시 지역/Workspace 허가에 따라 기능이 달라진다. Windows ChatGPT 데스크톱 앱의 **사용자가 직접 허용한 로컬 접근**이 있는 경우 로컬 파일/작업, 제한된 로컬 브라우저 접근을 사용할 수 있다. PC가 오프라인이면 해당 로컬 작업은 불가능; Dots 클라우드 브라우저와 로컬 앱 세션은 별개. 이것을 임의 GUI 컨트롤·특정 WMS 기능·항상 사용 가능한 API로 간주하지 않는다.

지원 UI/허가 정책/유료 이용 가능 여부/실제 연결은 AI-01 시작 시 공식 Help Center + 실제 사용자 환경에서 다시 검증한다. 개발/출시·백업·비용·무인 판매에는 Dots를 요구하지 않는다. 다른 컴퓨터로 원격 제어가 가능한지와 해당 화면을 안정적으로 제어할 수 있는지는 실사용 테스트 대상이다.

## 6. 실패 안전 원칙

- Windows 종료 + Dots 완전 미연결 + AI feature flag OFF + 외부 AI 네트워크 차단 상황의 독립 주문·재고·출고·동기화 연속 실행이 출시에 필수.
- Ubuntu 서버 자체/DB가 중단되면 안전한 fail-closed와 restore/reconcile 후 재개. 백업·원장 정합성·외부 부작용 재실행 격리를 우회하지 않는다.
- 주문 중복/역순/부분 주문/환불 중복/Provider ACK 소실/429/401/네트워크 분할/서버 종료/원장 커밋 실패/예약 경합에서 음수 재고·두 번 출고·두 번 환불이 없어야 한다.
- 사용자 승인 경계를 개발용 GitHub AUTO-01 PR 자동 병합 정책과 혼동하지 않는다. 개발 PR은 기존 독립검증 통과 시 자동병합; 실물·금전 부작용은 별도 운영 승인.
- 공개 GitHub에는 운영주문, 고객/공급처, 토큰, 인증정보, 백업을 절대 업로드하지 않는다.

## 7. DEV별 구현 분할 (계획일 뿐, 현재 완료 아님)

| 단계 | 담당 / 선행 | 최소 증거 |
|---|---|---|
| DEV-05 | 기존 출고 템플릿 범위 유지 | 문서 생성 ≠ 실제 출고, 샘플 발송 차단 |
| DEV-06 | 외부창고 전송/Inbox/Outbox | 미확인 송신 unknown, 중복/결과 유실 보류 |
| DEV-07 | 정책/권한/승인 | nonce·actor·version·한도/인간 승인, AI 자기 승인 차단 |
| DEV-08 | Amazon: 적법한 역할·SP-API 기반 주문/품목/상태 수집·증거·재고/배송 양방향 Adapter | API 권한·rate limit·중복·역순·부분 취소·배송 정보 시험; 미허가는 차단 |
| DEV-09 | Rakuten: 계약·RMS/RSL/BOSS capability별 주문/품목/배송·동기화, 승인된 API/CSV 대안 | 권한별 기능표·CSV 격리·외부 결과 불명 보류 |
| **OPS-01-1** | DEV04/06/07/08/09 계약 → Provider-neutral Order/Ingestion/Reservation 모델 | 주문 상태 전이·중복 이벤트·양 채널 재고경합·실제PG |
| **OPS-01-2** | OPS-01-1 → 채널 재고 게시/출고·배송 연결/취소·반품·환불 보류 및 승인 흐름 | 재시도/ACK 유실/재고 게시 차이/부분 상태, 실제 외부 실행은 허가된 범위만 |
| **OPS-01-3** | OPS-01-2 → durable Worker/Observer/Operator API + 모든 장해 통합 | Windows/Dots OFF 실제 E2E, 백업/재개, 회귀·감사 |
| DEV-10 | OPS-01 + 판매 데이터: 제안/조달 | 재고·incoming 중복 차감 및 금전 승인 |
| DEV-11 | OPS-01/DEV10: 통합 대시보드·Exception Queue·보고서 | PII 보호/권한/출처/최신성/상태 |
| DEV-12 | Ubuntu x86-64 laptop Docker 우선 배포; ARM64 포터빌리티 유지 | 단독 부팅, 재시작, HTTPS, 실제 호스트 검증; Pi 실증은 Pi 확보 후 |
| DEV-13 | 백업·복원·독립 감시 | 6h 암호화 백업, 실제 복원/worker 상태, Windows/Dots OFF |
| DEV-14 | OPS-01 + DEV00–13 + FINAL-AUDIT 출시 게이트 | 최소50SKU, 다채널 주문→예약→출고/취소→동기화+복구 E2E; 계약 미허가 흐름은 실제 출시 허용 안함 |
| DEV-15–17 | 기존 자체창고 barcode/picking/carrier 확장 | 독립 Ubuntu 운영, AI 없음 경로 보존 |
| DEV-18 | 운영 UX/통합/기본 OFF AI adapter | AI 없는 완전 운영 E2E, API capability 제한 |
| **AI-01-1/2/3** | 지원 자격 확인/연결 → 읽기 운영지원 → 제한된 API 명령과 실증 | 실제 Windows/Cloud capability·위임/권한·감사·승인·AI 제거 후 무중단 검증 |

각 명령서는 긴 경우 `DEV-XX-1`, `DEV-XX-2` 등으로 분할한다. 모든 하위 작업이 완료될 때만 상위 단계 완료로 표시한다. OPS-01은 DEV-10 이전에 완료하는 새 선행 단계이며 **기존 DEV-05의 완료 조건을 수정하지 않는다**.

## 8. 미확정 항목

Amazon SP-API Orders/Feeds/FBA 실제 앱 역할·리전, Rakuten RMS/RSL/BOSS 계약·지원 기능, 취소/환불/반품 명령 가용성, 실외부창고 ACK, 운영 보안키·도메인, 배송사 계약, Dots 구독/로컬 제어 지원은 확인 전 **NOT VERIFIED**. 어댑터 capability가 없으면 mock/sandbox/CSV 수동 확인을 구분하고 운영상 자동 처리된 것으로 주장하지 않는다.

서버의 Windows/Dots 독립성은 AI-01 실험이 아니라 **DEV-12~14 출시 필수 테스트**이다. GitHub 문서·로드맵 반영만으로 구현 완료나 운영 출시로 승격하지 않는다.
