# DEV 로드맵

개발 모델 정책: GPT-6.1 Sol Medium(DEV00–18). 모델명/effort는 실행 플랫폼 설정이며 저장소가 자체 강제하지 못한다.
실제 런타임 모델을 확인할 API가 없으면 확인했다고 주장하지 않는다. Astra는 FINAL-AUDIT-01 전용.
현재 운영 기능은 없다. 각 단계 완료는 요구사항+unit/integration/장애/회귀/보안/이전 요구 누락감사+
문서+commit/push/PR/현재 SHA CI+병합 확인을 포함한다. 모든 변경 유형은 main-owned 독립 검증과 실제 필수 테스트로 판단한다.

| DEV | 산출물 영역 | 선행 | 상세 구현 범위 | 필수 검증·완료 기준 | 상태 |
|---|---|---|---|---|---|
| DEV-00 | 설계·GitHub 개발 기반 | 기존 PR1/문서 | 전체 요구사항/모델/계약/테스트 명세·정책 도구 | 정책 unit/통합/실패·문서·CI·Secret 검토; 최초 수동 병합 | MERGED (PR1–3) |
| DEV-01 | 웹/API/DB 기반 | 00 기준선 | pnpm workspace, React/Vite/Tailwind/PWA i18n, Fastify, Drizzle migrations, Compose, worker shell | typecheck/lint/build, real PG migration/API smoke, worker 종료·再起動, ARM64 manifest | MERGED / VERIFIED (PR4, 168a43e) |
| DEV-02 | 인증·권한·보안 | 01 | 세션/RBAC/MFA/CSRF/입력·감사 기반 | 권한별 401/403, 세션 만료/탈취·CSRF/XSS·공통 권한차단, 실제PG/Browser 회귀 | 기반 MERGED / VERIFIED (PR10, ef3566c); 최종 보강 DEV02 보고 |
| DEV-03 | 상품·SKU·창고 | 02 | Product/SKU/Mapping/4창고유형/위치/실제FK scope/CAS/멱등/이력 | 60/120/1000 actualPG, 검색·커서·경합·권한·감사/Browser/기존 Auth 회귀 | MERGED / VERIFIED (PR12, cbf4e291);314 passed/0 fail/skip |
| DEV-04 | 원장·예약·입출고·이동 | 03 | 불변 복식원장/잔액·예약·증거·부분 처리·대조 | real PG concurrency/crash/replay/rollback/불변식+대량 이력 | MERGED / VERIFIED (PR13, 9089e261);423 passed/0 fail/skip/flaky |
| DEV-05 | 출고 문서 | 04 | Excel/PDF renderer/template version/hash/sample 모드 | 필드 검증/수식주입/템플릿 누락/부분수량/샘플 발송금지 | PLANNED |
| DEV-06 | 외부 창고 메일 | 05 | outbox/inbox/회신 검증/unknown 보류 | lost ACK/서버kill/중복/형식변경; 실제 발송 sandbox 증거 | PLANNED |
| DEV-07 | Telegram 알림·승인 | 02,06 | 위험정책/만료·nonce·내용hash 승인/요약 | 콜백중복/위조/만료/한도/알림실패 분리/연속클릭 | PLANNED |
| DEV-08 | Amazon SP-API/FBA/Orders | 04,07 | 지원 권한 조사; 주문/품목·취소/배송 상태 수집·증거, 재고게시/FBA대조 adapter; 무권한 Mock/hold | 공식 Orders·Feeds/FBA 역할 확인, 401/429/역순/중복/미매핑/부분상태, 미허가 live 금지 | PLANNED |
| DEV-09 | Rakuten RMS/RSL/Orders | 04,07 | RMS/RSL/BOSS별 계약·capability; 주문/배송·재고 sync adapter/CSV staging·안전한 대안 | 실제 계약·권한 확인, 수집/수량/취소·동기화/CSV 중복·오매핑/unknown 보류 | PLANNED |
| OPS-01-1/2/3 | 다채널 주문 운영 엔진 | 04,06–09 | 주문 수집·검증/예약→채널재고 sync/출고·배송·취소·반품·환불 정책→durable worker/API; 단계 분할 | 실제PG 원장·경합·중복/역순·unknown·환불승인; Windows/Dots 종료 상태에서 서버만으로 전체 경로 | PLANNED |
| DEV-10 | 보충·매입 제안 | 08,09,OPS-01 | forecast/리드타임/안전재고/현금/MOQ/정확 금액 | incoming 중복차감/예약경쟁/FX/원가반올림/한도/최신성 | PLANNED |
| DEV-11 | 분석·AI 친화 운영화면 | 10,OPS-01 | 매출/환불/수수료/원가, 통합 주문·재고·출고 dashboard, provider 상태/exception queue·보고서 | 정확집계/통화분리/PII·권한/최신성/지연/위험 재시도 UX, AI 없어도 사용 | PLANNED |
| DEV-12 | Ubuntu 노트북 우선 배포/ARM64 이식 | 01–11,OPS-01 | Ubuntu Server x86-64 laptop/SSD/Docker/HTTPS/부팅/안전 재개; ARM64 Pi 빌드·미래 이전 경로 | Ubuntu 실제 장비·Windows/Dots OFF 운영·정전·drain/rollback; Pi 실측은 장비 확보 시 | PLANNED |
| DEV-13 | 백업·복원·독립 업무감시 | 12,OPS-01 | 6h encrypted Drive/실제복원/외부 heartbeat·order lag/stock mismatch/outbox unknown 감시 | Windows/Dots OFF·DB/Worker/Provider/키만료/지연·복원후재전송금지 | PLANNED |
| DEV-14 | 외부창고/다채널 운영 출시후보 | 01–13,OPS-01 | 지원된 주문→예약→출고→배송/동기화·취소/반품 전체 흐름, runbook/운영승인 | 50SKU·30장애·실PG·실장비·Windows/Dots OFF E2E/복원·계약 허가·최종감사, 미허가 흐름 운영차단 | PLANNED |
| DEV-15 | 자체창고 위치·바코드 | 14 | zone/shelf/bin/모바일검수/실사/반품·손상 | 외부+자체 공존/스캔중복·오위치·오프라인확정금지 | PLANNED |
| DEV-16 | 피킹·포장·검수 | 15 | 할당/피킹/포장/검수 evidence | 오SKU·과부족/동시피킹/취소충돌/완료중복 | PLANNED |
| DEV-17 | 택배·운송장·집하 | 16 | carrier adapter/라벨/운임승인/취소/추적 | lost ACK/이중라벨·집하/요금/취소/부분발송 | PLANNED |
| DEV-18 | 전체 고도화·선택 AI 경계 | 17 | 전체 통합/안정화, Dots 친화 UI/API, default OFF optional AI adapter | Windows/Dots OFF core E2E·권한/성능/감사, AI 유무와 무관하게 정상 | PLANNED |
| FINAL-AUDIT-01 | Astra 전체 감사 | DEV14/18 출시후보 완성 직전 | 전체 코드/요구/보안/금전·재고/복구·미구현 추적 | blocker 수정·회귀 재실행·감사 증거; 자체 DEV검증 대체 금지 | PLANNED |
| AI-01 | 선택적 Dots 운영 관리자 | 사용자 접근·허가 및 지원 API 검증+DEV18 | AI-01-1 자격/권한 검증→01-2 읽기 분석/보고→01-3 제한 명령; Windows 로컬/클라우드 실제지원만 | AI DB 직접 접근0·자기승인0·감사/위험 승인·Dots OFF 계속운영 검증 | DEFERRED |

첫 출시 후보: DEV00–14 외부창고 흐름, DEV15–18 자체창고 확장. DEV14 개발 완료와 실제 운영 출시를
분리한다. 최초 운영 직전에는 해당 출시 범위 전체를 FINAL-AUDIT-01(Astra)로 감사하고 blocker를 해결한다.
DEV18 확장판 완성 직전에는 전체 확장 범위를 같은 감사대장의 새 revision으로 다시 검증한다.
표의 나열 순서가 DEV14 무감사 출시를 허용하지 않는다. 개발 중에는 Astra를 사용하지 않는다. [출시 조건](RELEASE_CHECKLIST.md).
DEV00 설계·GitHub 기반은 PR1–3으로 main 반영. DEV01은 구현/검증과 PR의 자동 검증·병합 상태를 별도로 기록한다.

## DEV04 현재 작업

불변 복식 재고 원장·예약·증거·부분 입출고·이동·정정·대조를 기존 Catalog/Auth UUID에 연결한다. 내부 구현·로컬/원격 검증을 완료하고 PR13에서 자동 Squash Merge했다. 구현 병합 SHA는 9089e261이며 운영 배포가 아니다. [구현 계약](docs/INVENTORY_LEDGER.md) · [실제 검증/미실행 범위](docs/dev-reports/DEV-04.md). 미검증 수동/외부 증거와 위험 조정은 보류한다.


## 2026-10-19 — Ubuntu + Dots 선택 운영 로드맵 (R26–R31)
출시 핵심 주문 워크플로는 **Ubuntu 서버에만 실행**하고 Windows/Dots 없이도 동작한다. DEV05의 진행 중 작업/기존 완료 조건은 변경하지 않는다. DEV08/09는 공식 권한별 주문·재고·배송 adapter 증거, 새 OPS-01-1/2/3은 Provider-neutral 오더 오케스트레이션·채널재고 게시·취소·반품·위험 환불 승인/worker 분리를 책임진다. OPS-01은 DEV10·DEV14 선행이며 AI-01은 선택적 후속 단계다. DEV12는 Ubuntu 노트북 x86-64 우선, Pi ARM64는 이후 이전 가능성을 유지한다. 각 큰 단계는 DEV-XX-1/2 형태로 분할 가능; 모든 하위 단계의 증거가 있어야 상위 완료. [아키텍처](docs/AI_OPERATIONS_ARCHITECTURE.md). 이 변경은 문서 계획이며 실제 외부 주문·WMS 운영 실증이 아니다.
