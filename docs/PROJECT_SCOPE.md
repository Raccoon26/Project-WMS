# Project-WMS 확정 범위

2026-10-16 DEV00 최종 지시 기준. 기존 capacity/optional Dot amendment를 유지하고 전체 설계로 확장.
일본 소규모 전자상거래: 해외공급처→외부/미래자체창고→Amazon JP FBA/Rakuten RSL.
현재 약10 SKU, 첫 출시 최소50 SKU(상한 아님). 다중창고·독립 marketplace code·비활성/품절/단종·검색/페이지네이션.
[전체 요구](../REQUIREMENTS.md), [구조](../ARCHITECTURE.md), [모델](../DATA_MODEL.md),
[진행](../DEV_PROGRESS.md), [추적](REQUIREMENTS_TRACEABILITY.md)가 구현 기준선이다.

DEV00: 전체 설계/모듈계약/DB/상태·수량/금전/안전/장애30개/50SKU fixture/개발 및 GitHub 안전도구.
실제 웹/API/재고/메일/봇/marketplace/Pi/Drive/AI는 구현했다고 표시하지 않는다.
DEV00–14 첫 외부창고 출시; DEV15–18 자체창고·전체고도화; 완성직전 FINAL-AUDIT-01 Astra;
AI01은 Dot 사용 가능 및 사용자 요청 후 별도. DEV00–18 개발 모델 Sol Medium, 매DEV 자체검증 필수.

Dot 현재 이용불가. 구독업그레이드/키/유료 OpenAI API는 요구하지 않음. WMS 전체운영은 AI없이 정상.
DEV18은 disabled optional interface만; AI01은 실제 지원기능/권한 확인 후 제한된 분석·제안, 핵심원장/출고 유일제어 금지.

재고 정확성→금전→중복출고 방지가 우선. 외부 결과불명 hold, 이메일≠출고, append-only ledger,
정확금액·승인·독립알림·실제복원·외부감시. 외부/자체창고 공존, 별도 native app/K8s/불필요한 유료서비스 없음.
최신 지시가 기존문서와 충돌하면 이유를 [결정](DECISIONS.md)에 남긴다. 세부기능 완료는 각 DEV 실제 증거로만 판정.
