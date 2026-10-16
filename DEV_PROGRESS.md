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
| DEV-03 | 상품·SKU·창고 | 02 | Product/SKU/Mapping/4창고유형/위치/실제FK scope/CAS/멱등/이력 | 60/120/1000 actualPG, 검색·커서·경합·권한·감사/Browser/기존 Auth 회귀 | IMPLEMENTED / 로컬314 검증; 원격은 DEV03 PR 실제 결과 |
| DEV-04 | 원장·예약·입출고·이동 | 03 | 불변 복식원장/잔액·예약·증거·부분 처리·대조 | real PG concurrency/crash/replay/rollback/불변식+100만 이력 계획 | PLANNED |
| DEV-05 | 출고 문서 | 04 | Excel/PDF renderer/template version/hash/sample 모드 | 필드 검증/수식주입/템플릿 누락/부분수량/샘플 발송금지 | PLANNED |
| DEV-06 | 외부 창고 메일 | 05 | outbox/inbox/회신 검증/unknown 보류 | lost ACK/서버kill/중복/형식변경; 실제 발송 sandbox 증거 | PLANNED |
| DEV-07 | Telegram 알림·승인 | 02,06 | 위험정책/만료·nonce·내용hash 승인/요약 | 콜백중복/위조/만료/한도/알림실패 분리/연속클릭 | PLANNED |
| DEV-08 | Amazon SP-API/FBA | 04,07 | 권한 조사/adapter/mock/재고·판매·입고대조 | 401/429/역순/중복/미매핑/부분수령; live 권한 없으면 명시 제한 | PLANNED |
| DEV-09 | Rakuten RMS/RSL | 04,07 | 계약별 adapter/CSV/staging/추가비용 기록 | 오류/CSV 중복/오매핑/변형/연동미권한 보류 | PLANNED |
| DEV-10 | 보충·매입 제안 | 08,09 | forecast/리드타임/안전재고/현금/MOQ/정확 금액 | incoming 중복차감/예약경쟁/FX/원가반올림/한도/최신성 | PLANNED |
| DEV-11 | 분석·보고 | 10 | 매출/환불/수수료/원가/추정vs확정・dashboard | 정확집계/통화분리/큰이력 streaming/권한/日付 | PLANNED |
| DEV-12 | Pi 배포 | 01–11 | ARM64 Compose/SSD/HTTPS/재시작/업데이트·롤백 | 실장비 성능·정전·drain·rollback·split-brain/외부접근 | PLANNED |
| DEV-13 | 백업·복원·감시 | 12 | 6h encrypted Drive/실제복원/외부 heartbeat | 손상/키·token만료/누락파일/복원후재전송금지/업무실패 감시 | PLANNED |
| DEV-14 | 외부창고 최초 출시 | 01–13 | 全흐름 통합, runbook/운영승인 | 최소50 SKU E2E·동시성·30장애·회귀·보안·복원·비용/장비측정 | PLANNED |
| DEV-15 | 자체창고 위치·바코드 | 14 | zone/shelf/bin/모바일검수/실사/반품·손상 | 외부+자체 공존/스캔중복·오위치·오프라인확정금지 | PLANNED |
| DEV-16 | 피킹·포장·검수 | 15 | 할당/피킹/포장/검수 evidence | 오SKU·과부족/동시피킹/취소충돌/완료중복 | PLANNED |
| DEV-17 | 택배·운송장·집하 | 16 | carrier adapter/라벨/운임승인/취소/추적 | lost ACK/이중라벨·집하/요금/취소/부분발송 | PLANNED |
| DEV-18 | 전체 고도화·AI 경계 | 17 | 전체 통합/안정화, disabled optional AI interface | Dot/AI 완전 부재 상태 E2E/회귀/권한/성능, AI 없어도 완료 | PLANNED |
| FINAL-AUDIT-01 | Astra 전체 감사 | DEV14/18 출시후보 완성 직전 | 전체 코드/요구/보안/금전·재고/복구·미구현 추적 | blocker 수정·회귀 재실행·감사 증거; 자체 DEV검증 대체 금지 | PLANNED |
| AI-01 | 선택 Dot 실제 연동 | 사용자 이용 가능+명시 요청 | 실제 지원권한/인터페이스 확인 후 읽기중심 연동 | 운영 AI 차단 상황에서도 정상, 권한제한·비용승인 | DEFERRED |

첫 출시 후보: DEV00–14 외부창고 흐름, DEV15–18 자체창고 확장. DEV14 개발 완료와 실제 운영 출시를
분리한다. 최초 운영 직전에는 해당 출시 범위 전체를 FINAL-AUDIT-01(Astra)로 감사하고 blocker를 해결한다.
DEV18 확장판 완성 직전에는 전체 확장 범위를 같은 감사대장의 새 revision으로 다시 검증한다.
표의 나열 순서가 DEV14 무감사 출시를 허용하지 않는다. 개발 중에는 Astra를 사용하지 않는다. [출시 조건](RELEASE_CHECKLIST.md).
DEV00 설계·GitHub 기반은 PR1–3으로 main 반영. DEV01은 구현/검증과 PR의 자동 검증·병합 상태를 별도로 기록한다.
