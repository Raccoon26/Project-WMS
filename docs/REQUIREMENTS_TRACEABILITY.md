# 요구사항 추적 / DEV00 통합 감사

그룹ID는 [요구](../REQUIREMENTS.md), 사용자 지시 §0–29는 U00–U29로 보존.
각 DEV report는 R-ID+테스트ID+실제 실행SHA/결과 링크를 추가; 문서 반영과 기능 검증을 구분.
현재 모든 실제 WMS 기능 NOT RUN. DEV00 도구 실행 증거는 [보고](dev-reports/DEV-00.md).

| ID | 요구 그룹 | 구현 기준 문서 | 담당 | 검증 계약 | 상태 |
|---|---|---|---|---|---|
| R01 | 제품·SKU | [DATA_MODEL.md](../DATA_MODEL.md) | DEV-03,14 | 50+ 등록/검색/상태/매핑/페이지, fixture≠실제 기능 | 설계 완료 / 기능 NOT RUN |
| R02 | 원장/예약 | [DATA_MODEL.md](../DATA_MODEL.md) | DEV-04 | F07/08/12/21/28, 불변식 | 설계 완료 / 기능 NOT RUN |
| R03 | 입출고/이동 | [DATA_MODEL.md](../DATA_MODEL.md) | DEV-04,15–17 | F18–20, partial/reservation/소유합 | 설계 완료 / 기능 NOT RUN |
| R04 | 문서양식 | [OPERATIONS.md](../OPERATIONS.md) | DEV-05 | sample watermark/hash/금지필드 | 설계 완료 / 기능 NOT RUN |
| R05 | 이메일창고 | [OPERATIONS.md](../OPERATIONS.md) | DEV-06 | F02–04/10/20/30 | 설계 완료 / 기능 NOT RUN |
| R06 | Amazon | [INTEGRATIONS.md](../INTEGRATIONS.md) | DEV-08 | F13/15/16/17/19 | 설계 완료 / 기능 NOT RUN |
| R07 | Rakuten | [INTEGRATIONS.md](../INTEGRATIONS.md) | DEV-09 | F14–17/19 CSV | 설계 완료 / 기능 NOT RUN |
| R08 | 보충/재발주 | [OPERATIONS.md](../OPERATIONS.md) | DEV-10 | 중복incoming/MOQ/lead/cash | 설계 완료 / 기능 NOT RUN |
| R09 | 금액/분석 | [DATA_MODEL.md](../DATA_MODEL.md) | DEV-10,11 | Decimal/환불/통화·수수료 | 설계 완료 / 기능 NOT RUN |
| R10 | Telegram | [SECURITY.md](../SECURITY.md) | DEV-07 | F05/06/24 | 설계 완료 / 기능 NOT RUN |
| R11 | 자동화/worker | [ARCHITECTURE.md](../ARCHITECTURE.md) | DEV-01,04,06,13 | F02–08/22/23/27 | 설계 완료 / 기능 NOT RUN |
| R12 | 웹/모바일/PWA/i18n | [ARCHITECTURE.md](../ARCHITECTURE.md) | DEV-01–14 | 15화면/오프라인/중복/접근성 | 설계 완료 / 기능 NOT RUN |
| R13 | 보안 | [SECURITY.md](../SECURITY.md) | DEV-02 | 인증/역할/CSRF/XSS/MFA/세션 | 설계 완료 / 기능 NOT RUN |
| R14 | Pi 운영 | [DEPLOYMENT.md](../DEPLOYMENT.md) | DEV-12 | F09–12/22 ARM64/실장비 | 설계 완료 / 기능 NOT RUN |
| R15 | 백업 | [BACKUP_RECOVERY.md](../BACKUP_RECOVERY.md) | DEV-13 | F23/25/26 실제복원 | 설계 완료 / 기능 NOT RUN |
| R16 | 외부감시 | [DEPLOYMENT.md](../DEPLOYMENT.md) | DEV-13 | F27 업무별 health | 설계 완료 / 기능 NOT RUN |
| R17 | 자체창고 | [docs/contracts/MODULES.md](../docs/contracts/MODULES.md) | DEV-15–17 | 공존/바코드/피킹/택배 | 설계 완료 / 기능 NOT RUN |
| R18 | AI 선택 | [docs/PROJECT_SCOPE.md](../docs/PROJECT_SCOPE.md) | DEV-18,AI-01 | disabled AI E2E | 설계 완료 / 기능 NOT RUN |
| R19 | GitHub | [docs/GITHUB_WORKFLOW.md](../docs/GITHUB_WORKFLOW.md) | DEV-00–18 | 정책/helper unit+integration, current SHA CI/보호 | 설계 완료 / 기능 NOT RUN |
| R20 | 개별DEV검증 | [TEST_PLAN.md](../TEST_PLAN.md) | DEV-00–18 | 30장애/회귀/보안/이전요구감사 | 설계 완료 / 기능 NOT RUN |
| R21 | public 보호 | [SECURITY.md](../SECURITY.md) | DEV-전단계 | path/pattern scanner+수동PII검토 | 설계 완료 / 기능 NOT RUN |
| R22 | 단순·저비용 | [INTEGRATIONS.md](../INTEGRATIONS.md) | DEV-전단계 | 비용 분류/단일DB/no paidAI | 설계 완료 / 기능 NOT RUN |
| R23 | 출처/신뢰 | [OPERATIONS.md](../OPERATIONS.md) | DEV-04,08–10 | freshness/snapshot/CSV evidence | 설계 완료 / 기능 NOT RUN |
| R24 | 승인정책 | [OPERATIONS.md](../OPERATIONS.md) | DEV-02,07,10 | 한도/위험/version/일회 | 설계 완료 / 기능 NOT RUN |
| R25 | 모델/단계 | [DEV_PROGRESS.md](../DEV_PROGRESS.md) | DEV-전단계 | Sol Medium/Astra FINAL/AI01 분리 | 설계 완료 / 기능 NOT RUN |

## 사용자 지시 전체 섹션 대조
| ID | 원문 영역 | 연결 요구 | 감사 결과 |
|---|---|---|---|
| U00 | §0 프로젝트/GitHub | R19,R25 | 기준선에 반영; 구현/운영 증거는 각 DEV |
| U01 | §1 목표·SKU | R01,R17 | 기준선에 반영; 구현/운영 증거는 각 DEV |
| U02 | §2 최상위목표 | R01–R18,R24 | 기준선에 반영; 구현/운영 증거는 각 DEV |
| U03 | §3 Dot정책 | R18,R25 | 기준선에 반영; 구현/운영 증거는 각 DEV |
| U04 | §4 스택 | R22 | 기준선에 반영; 구현/운영 증거는 각 DEV |
| U05 | §5 웹 | R12 | 기준선에 반영; 구현/운영 증거는 각 DEV |
| U06 | §6 모듈 | R02–R18,R22 | 기준선에 반영; 구현/운영 증거는 각 DEV |
| U07 | §7 외부창고 | R04,R05 | 기준선에 반영; 구현/운영 증거는 각 DEV |
| U08 | §8 Amazon/Rakuten | R06,R07,R23 | 기준선에 반영; 구현/운영 증거는 각 DEV |
| U09 | §9 재고무결성 | R02,R03,R11 | 기준선에 반영; 구현/운영 증거는 각 DEV |
| U10 | §10 30장애 | R20 | 기준선에 반영; 구현/운영 증거는 각 DEV |
| U11 | §11 보충/재발주 | R08,R09 | 기준선에 반영; 구현/운영 증거는 각 DEV |
| U12 | §12 Telegram | R10,R24 | 기준선에 반영; 구현/운영 증거는 각 DEV |
| U13 | §13 Pi | R14 | 기준선에 반영; 구현/운영 증거는 각 DEV |
| U14 | §14 백업 | R15 | 기준선에 반영; 구현/운영 증거는 각 DEV |
| U15 | §15 외부감시 | R16 | 기준선에 반영; 구현/운영 증거는 각 DEV |
| U16 | §16 보안 | R13,R21 | 기준선에 반영; 구현/운영 증거는 각 DEV |
| U17 | §17 자체창고 | R17 | 기준선에 반영; 구현/운영 증거는 각 DEV |
| U18 | §18 로드맵 | R25 | 기준선에 반영; 구현/운영 증거는 각 DEV |
| U19 | §19 GitHub | R19 | 기준선에 반영; 구현/운영 증거는 각 DEV |
| U20 | §20 자동병합 | R19 | 기준선에 반영; 구현/운영 증거는 각 DEV |
| U21 | §21 DEV완료 | R20 | 기준선에 반영; 구현/운영 증거는 각 DEV |
| U22 | §22 50SKU | R01,R20 | 기준선에 반영; 구현/운영 증거는 각 DEV |
| U23 | §23 문서 | R20 | 기준선에 반영; 구현/운영 증거는 각 DEV |
| U24 | §24 비용 | R22 | 기준선에 반영; 구현/운영 증거는 각 DEV |
| U25 | §25 범위제한 | R20,R25 | 기준선에 반영; 구현/운영 증거는 각 DEV |
| U26 | §26 실제검증 | R19,R20,R21 | 기준선에 반영; 구현/운영 증거는 각 DEV |
| U27 | §27 통합감사 | R01–R25 | 기준선에 반영; 구현/운영 증거는 각 DEV |
| U28 | §28 GitHub/보고 | R19,R20 | 기준선에 반영; 구현/운영 증거는 각 DEV |
| U29 | §29 절대원칙 | R02,R03,R09,R11,R15,R18,R19 | 기준선에 반영; 구현/운영 증거는 각 DEV |

## 누락 감사 결과
기존 구현은 GitHub bootstrap뿐으로 과거 완료 기능 없음. 초기의 미완료 설계 문서/데이터 모델/30장애/50SKU전략을 보완.
재고 상태 합산 오류·부분95/93·메일unknown·복원replay·위험경로/rename/현재SHA검사 누락을 설계/도구에서 수정.
외부 계정/양식/가격/장비 미확인은 각 담당 단계 prerequisite로 명시; 운영 성공으로 처리 안함.
PR1 수동검토/보호설정/실제병합은 현재 미완료이고 DEV00 완료 판정 차단.

AUTO-01 최신 지시 §0–16: 수동 승인 제거/일반 PR/Ready·metadata 분리/영역별 실제 suite/main-owned 독립 검증/최초 전환/PR4 보존/이벤트 호환성/운영 배포 분리를 [실행 대장](dev-reports/GITHUB-AUTOMATION-01.md)으로 추적한다.
