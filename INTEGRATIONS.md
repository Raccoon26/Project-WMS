# 外部 연동·권한·비용

확인일 2026-10-16. 운영 계정·키·계약·하드웨어 미검증; DEV00은 설계와 공개 공식 자료 확인만 수행.
모든 provider는 [port 계약](docs/contracts/MODULES.md), sync source/observed_at/fetched_at/trusted/last_result를 준수.
공식 공개 schema 존재와 해당 일본 판매자 계정의 기능 사용 권한은 별개다.

## Amazon JP
공식 [selling-partner-api-models](https://github.com/amzn/selling-partner-api-models) 공개 모델을 실제 조회했다.
- [FBA Inventory v1](https://github.com/amzn/selling-partner-api-models/blob/main/models/fba-inventory-api-model/fbaInventory.json):
  `getInventorySummaries`로 재고 관측 adapter. 모델에 create/delete/add도 있으나 운영 FBA 실물 조정 가능하다고 추론하지 않는다.
- [Sales v1](https://github.com/amzn/selling-partner-api-models/blob/main/models/sales-api-model/sales.json):
  `getOrderMetrics` 존재. SKU별 상세 판매/취소/수수료/정산은 Orders/Reports/Finances 등 추가 API/역할 조사 필요.
- [Fulfillment Inbound 2024-03-20](https://github.com/amzn/selling-partner-api-models/blob/main/models/fulfillment-inbound-api-model/fulfillmentInbound_2024-03-20.json):
  createInboundPlan, packing/placement/transport option 생성·확정, getShipment, listShipmentItems,
  getInboundOperationStatus 등의 operation 존재. 일부는 비동기 operation poll, placement/배송 비용은 승인 대상.
  실제 수령수량 필드/region 지원/라벨/운송 요건은 DEV08에서 계정·공식 최신 docs로 검증한다.
입고계획 생성이나 API 성공 응답은 창고 출발/실제 수령의 증거가 아니다.
FBA 발주/해외공급처 결제/외부 email 창고 출고를 SP-API가 대신 실행한다고 가정하지 않는다.

DEV08 prerequisite: 판매자계정, 개발자 앱 등록/해당 역할 승인, LWA OAuth authorization 및 refresh credential,
JP marketplace/region endpoint, sandbox 가용성·production 접근/리소스별 권한·PII 제한 확인.
LWA/판매자 공식 설명 페이지는 현 환경 HTTP403이라 최신 onboarding·역할/수수료 조건 확인은 미완료.
키는 지금 요청하지 않는다. mock부터 개발, sandbox가 실제 재고/입고 전과정을 재현한다고 가정하지 않는다.
권한 없는 쓰기는 disabled, 읽기 재고도 stale/중복/역순/누락/429/401/페이지커서 장애를 처리.

## Rakuten RMS / RSL / BOSS
[Rakuten Web Service](https://webservice.rakuten.co.jp/) HTTP200 공개 상품 검색/개발자 API 안내를 확인.
이 API를 상점 RMS 주문/재고 권한으로 혼동하지 않는다. RMS Web API는 상점 계약/관리자 권한·라이선스가
필요한 별도 연동 경로이며 상세 endpoint/유효기간/역할/상점승인은 DEV09에서 계약자 공식 portal 확인 필요.
[RSL 공식 안내](https://logistics.rakuten.co.jp/) HTTP200: Rakuten 입점 점포용 물류 아웃소싱 서비스라는 점 확인.
RSL 직접 API/입출고 기능/요금 및 BOSS/호환 OMS 필요 여부는 현재 계정/계약 없어서 미확정.
[Hunglead BOSS](https://www.hunglead.com/boss/)는 현 환경403. BOSS가 무료이거나 자체 WMS로 완전 대체 가능하다고 단정하지 않는다.
`api.rms.rakuten.co.jp/` root404는 특정 API 권한/가용성 증거가 아니다.
DEV09 deliverable: RMS/OMS/RSL별 지원 기능·권한·계약·비용 표, 승인된 endpoint만 adapter 활성화,
미지원은 관리화면/CSV export-import와 operator evidence. API 없으면 안전한 수동 대안으로 운영 가능,
실제 계정 실증 미완료는 release 제한으로 남긴다.

## 이메일·Telegram·Drive·접근
이메일 provider 미선정: send/lookup/reply/Message-ID/timeout/remote idempotency 기능 비교 후 DEV06 ADR.
SMTP는 확실한 exactly-once 외부 전송을 보장하지 않는다. unknown은 수동 대조.
실제 창고 Excel/PDF 양식·담당 이메일·주소는 비공개 설정, 샘플과 교체 가능한 template interface만 DEV05.
Telegram bot token/user/chat 설정은 DEV07 보안 입력, 위조/중복/만료 테스트 전 운영 승인 금지.
Drive는 rclone OAuth + crypt, 로컬 암호화·키 분리·일관 dump+문서 manifest;
[rclone crypt 공식문서](https://rclone.org/crypt/) HTTP200 확인. OAuth token/복호키는 git/백업과 별도.
Cloudflare Tunnel+Access는 선택 후보이며 [공식 docs](https://developers.cloudflare.com/cloudflare-one/access-controls/)403;
최신 무료 요건·도메인/이용한도 미확인, 필수 유료 전제 없음.
선택 AI는 DisabledAIAdapter가 기본, Dot/API키/구독변경은 DEV00–18 prerequisite 아님.

## 비용
| 구분 | 항목 | 판단/확인 시점 |
|---|---|---|
| 오픈소스 자체 사용 | Node/React/Fastify/PostgreSQL/Drizzle/Vite/Tailwind/Compose/rclone | 라이선스 준수 전제 소프트웨어 자체 월 사용료 없음; host비용 별도 |
| 무료 조건·용량 제한 | GitHub public Actions/storage, Telegram Bot rate, Drive 계정 공용 용량, 외부 heartbeat/Access | 무료 tier 및 정책은 최신 조건 재확인; 무제한/영구무료 보장 금지 |
| 하드웨어 일시 비용 | Pi5/전원/SSD/cooling/LAN/선택 UPS | 실구매 견적 미확정 |
| 반복 실비 | 전력/인터넷/도메인/SSD교체 | 지역요금/소비전력/계약에 따라 확인 |
| 업무 비용 | 외부창고 보관·작업·배송·수입/관세/공급처 매입 | 실제 계약 비공개, 시스템무료와 별개 |
| Amazon | 판매플랜/수수료/FBA보관·작업·배송/입고 관련 | 계정/물량/최신 가격표, DEV08 확인 |
| Rakuten | 입점/판매/RSL/BOSS 또는 호환OMS | 필요 서비스·추가요금 DEV09 계약 확인 |
| 선택 유료 | 관리형 모니터링/상위 Drive/Cloudflare/메일 provider | 무료 대안 먼저, 관리자 비용 승인 |
| 향후 AI | Dot 상위구독/AI API | 현재 비용0을 목표로 연결 disabled, AI01만 명시 opt-in |

비용표는 가격 견적이 아니다. 확정 숫자/무료 이용량을 추측하지 않는다. 운영 활성 전 계약·실사용량·요금 변경 감시.


## Amazon/Rakuten 다채널 주문 계약 추가 (OPS-01 선행)
DEV08은 실제 승인된 Amazon SP-API 역할·리전·Orders/FBA/Feeds 범위를, DEV09는 Rakuten RMS/RSL/BOSS 계약·지원 기능을 조사한다. 주문/품목·수량·취소/배송/환불 상태 읽기와 채널 게시·배송정보 쓰기는 별개 권한이며 상호 대체 불가. Provider-specific unique event ID, cursor/observed_at, raw hash, ordered-state 적용, 429/backoff, Credential expiry, polling gap, 중복/취소 선행을 안전하게 설계. API 미권한·미지원 기능은 MOCK 또는 별도 승인 CSV staging/수동대조로 보류하며 완전 무인 운영이라 표시하지 않는다. OPS-01은 공통 Order/RBAC/Reservation/Outbox·Provider Capability 포트를 구현하고, 외부 주문·배송·취소·환불 Write는 실제 계약/권한·승인 및 lost ACK 회복 검증 후만 허용. AI client도 동일 API만 사용. [AI 운영 아키텍처](docs/AI_OPERATIONS_ARCHITECTURE.md).
