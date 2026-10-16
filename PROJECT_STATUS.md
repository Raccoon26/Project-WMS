# Project-WMS 상태

기준일: 2026-10-16. **DEV-00 설계·GitHub bootstrap 반영 완료 / DEV-01 시작 가능.**
여기서 DEV-00 '완료'는 설계 문서와 소스 관리 기반의 병합을 의미합니다. 실제 웹/API/DB 재고 원장/물류 연동/이메일/Telegram/Pi/백업 및 운영 검증은 **아직 미구현**이며 해당 DEV에서 검증해야 합니다.

## 실제 GitHub 반영 상태 (GitHub REST API 확인)
- [PR #1](https://github.com/Raccoon26/Project-WMS/pull/1) **Merged**. Bootstrap + DEV-00 설계가 `main`에 반영됨. 병합 커밋 `694ef9a1ae2dfb05c10c5683b0a63913d5deaf72`.
- [PR #2](https://github.com/Raccoon26/Project-WMS/pull/2) **자동 Merged**. 보호 규칙 미사용 GitHub Actions workflow-run 병합 실증(문서 변경에 한함). 병합 커밋 `6086ddfb8281a5a9adff2d2b6f3aca7f3a05c3b5`.
- [WMS PR CI #38845791520](https://github.com/Raccoon26/Project-WMS/actions/runs/38845791520): SUCCESS; [WMS PR Policy #38845791325](https://github.com/Raccoon26/Project-WMS/actions/runs/38845791325): SUCCESS; [Guarded Auto Merge #38845810037](https://github.com/Raccoon26/Project-WMS/actions/runs/38845810037): SUCCESS.
- 보호 상세 조회에 `403`이 발생하더라도 새로운 보호 규칙 **없는** 별도 GitHub Actions 자동 병합에는 영향을 주지 않습니다. 레거시 `scripts/enable-safe-auto-merge.sh`는 여전히 보호 설정이 없으면 중단됩니다.
- 위험도가 낮은 문서·표현 UI 변경만 엄격한 GitHub Actions 검사 및 현재 SHA 확인 후 자동 병합; CI/보안/재고/출고/금전/DB/배포 및 미분류 경로는 **수동 검토·병합**.
- **GitHub main 병합은 Raspberry Pi 운영 배포가 아닙니다.** Branch protection이 없는 구성은 `main` 직접 푸시를 GitHub가 차단하지 못하므로 보호 규칙 사용이 가능하면 여전히 권장합니다.

## DEV-00 산출물 및 남은 개발
- [DEV-00 결과 보고](docs/dev-reports/DEV-00.md), [개발 진행표](DEV_PROGRESS.md), [요구사항](REQUIREMENTS.md), [추적 매트릭스](docs/REQUIREMENTS_TRACEABILITY.md), [안전 원칙](docs/SAFETY_GATES.md).
- 기존 DEV-00 설계 보고서는 당시 시점의 원격 상태를 기록한 **이력 문서**입니다. 본 파일의 GitHub 현황이 최신입니다.
- 50 SKU 이상 확장 설계, Dot 미사용(선택 AI-01), 외부 창고 이메일, FBA/RSL, 금전·재고 안정성 규칙은 설계되었습니다. 실제 운영 코드/50 SKU E2E/ARM64 성능/복원 실증은 미완료.
- DEV-01은 최신 `main`에서 새로운 브랜치로 시작하세요. 요구사항 및 우선순위 재확인, 앱 기초 환경·DB 테스트/CI 어댑터를 구현하세요.
- DEV-05/06은 실제 창고 양식과 메일 제공자, DEV-08/09는 플랫폼 계정/API 접근, DEV-12는 Pi 기기, DEV-13은 Drive OAuth/외부 감시가 필요할 수 있습니다. 초기 DEV-01에는 필요하지 않습니다.
- Sol Medium DEV-00~18, Astra FINAL-AUDIT-01. 마지막 감사가 DEV별 실측·회귀·장애 테스트를 대체하지 않습니다.

## AUTO-01 정책 전환 — 진행 중
DEV01 구현은 기존 [PR4](https://github.com/Raccoon26/Project-WMS/pull/4)에 보존되어 있으며 main에는 아직 없다.
AUTO-01은 별도 dev/dev-00-auto-01 브랜치/전환 PR에서 구현한다. 승인 label/comment/review 요구 제거,
일반 PR 생성, 기존 Draft 자동 Ready, main-owned read-only 독립 검증과 trusted merge controller를 추가했다.
전환 PR의 실제 main 적용/CI/병합 SHA는 검증 후 기록한다. 운영 배포 없음.
[정책](docs/GITHUB_WORKFLOW.md) · [실행 대장](docs/dev-reports/GITHUB-AUTOMATION-01.md).
