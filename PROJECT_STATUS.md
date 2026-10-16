# Project-WMS 상태

기준일: 2026-10-16. **DEV00 IN PROGRESS / REVIEW_PENDING. 완료 선언 아님.**
설계 기준선·개발 안전 도구 보완, 기존 PR1 검토 준비. 실제 웹/API/DB원장/연동/발송/봇/Pi/백업 미구현.
[DEV00 증거](docs/dev-reports/DEV-00.md), [진행표](DEV_PROGRESS.md), [요구 추적](docs/REQUIREMENTS_TRACEABILITY.md).

## GitHub 및 남은 gate
- 기존 브랜치 `dev/dev-00-github-bootstrap`, PR [#1](https://github.com/Raccoon26/Project-WMS/pull/1) Open/Draft 유지; 중복PR 없음.
- Public, auto-merge=false 관측. main protection 조회403(연동권한), 설정 여부 불명 → 자동병합 불가.
- bootstrap CI/정책 변경은 수동검토. owner review/보호설정/병합 미완료.
- 현재 PR SHA의 remote CI 결과와 commit 식별자는 DEV00 report 및 GitHub check가 권위.
  자기 SHA를 문서에 포함하면 SHA가 바뀌므로 파일 내 마지막 커밋 hash는 GitHub 이력/최종보고에서 확인한다.

## DEV01 준비
기술 스택/모듈 계약/DB·수량/전이/승인/재시도/복구/테스트/단계별 완료 기준 정의.
DEV01 시작 전 이 PR 수동 검토/병합 및 새 main 확인, 인증/의존성patch/이미지/CI DB fixture 구현.
최소50 SKU·하드한도0, Dot/유료AI 의존0. 모델 정책은 Sol Medium/Astra FINAL; 런타임 모델 설정은 저장소가 입증 못함.

## 후속 prerequisite (지금 운영자 비밀값 요구하지 않음)
DEV05/06 업체 양식/메일provider; DEV08/09 API계약/권한·최신요금; DEV12 장비/도메인/실측;
DEV13 Drive OAuth/복호키 보관·외부감시. 미지원기능은 CSV/수동 증거대안.
[위험대장](docs/RISK_REGISTER.md) K01–K18 추적. 보호/권한이 해결되기 전 강제병합/보호완화 금지.
