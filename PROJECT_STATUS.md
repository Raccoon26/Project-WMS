# Project-WMS 상태

2026-10-16. DEV00 설계 및 AUTO-01 정책은 main 적용 완료. DEV01 실행 기반도 PR4로 main 반영 완료. DEV02는 dev/dev-02-auth-security에서 인증·권한 구현·로컬 및 독립 검증 완료이며 원격 CI·병합 확인 전 전체 완료 선언하지 않는다.

## 확인된 GitHub 이력

- PR1–3: DEV00 설계·GitHub 기반 병합 완료.
- [PR5](https://github.com/Raccoon26/Project-WMS/pull/5): AUTO-01 최초 전환 병합, `9bc5abc3a92227cf27b6a929747e70a30f4423da`.
- [PR6](https://github.com/Raccoon26/Project-WMS/pull/6): 독립 baseline 차단 실증 후 복원, Actions 자동 squash merge 완료.
  병합 `435e69daa2582f75e970b3c8bbd718bf3b63abf8`, [controller 성공](https://github.com/Raccoon26/Project-WMS/actions/runs/38853918542).
- [PR7](https://github.com/Raccoon26/Project-WMS/pull/7): verifier 보정 자동병합 `17d6cdadce3b7b47da116c0a2f9f5dfaf552718f`.
- [PR4](https://github.com/Raccoon26/Project-WMS/pull/4): 기존 dev/dev-01-foundation을 재사용. 최신 main으로 정상 merge했고 force push/main 직접 push 없음.
  검증 HEAD `cdd9fcd22575340b8579f7956053fd48bc220cd0`, 실제 자동 squash merge `168a43ef2cc94bcd058bb0f366d07494817b924c`.
  05:16:11 UTC github-actions[bot] Ready, 05:16:14 UTC 같은 bot merged. 사용자 승인0.
  [Quality](https://github.com/Raccoon26/Project-WMS/actions/runs/38854559218) / [Independent](https://github.com/Raccoon26/Project-WMS/actions/runs/38854703602) / [Guarded](https://github.com/Raccoon26/Project-WMS/actions/runs/38854877732) 모두 성공.

## 실행 기반 및 안전성

pnpm TypeScript workspace, 일본어 React/Vite/Tailwind15화면/PWA, Fastify 읽기전용 상태·버전,
실제 PostgreSQL17.11·Drizzle migration/hash/lock, 별도 readonly Worker/config/log/shutdown.
Unit34/실제DB integration4/fault14/browser8 로컬 재통과, 실제 업무쓰기0. 원격 정책65 포함 총125 passed/0 fail/0 skip 확인. 후속 metadata 경합 회귀를 추가한 현재 로컬 정책66 통과; AUTO-01 보고 참조.
수동 승인 label/comment/review 및 위험 경로별 Draft 강제 없음. 모든 유형에 main-owned 독립 자동 검증을 요구한다.
부족한 업무 suite는 필수 테스트 누락으로 차단한다. 보호 없는 자기 수정 CI는 완전 보안을 보장하지 않는다.

## 후속 단계

DEV02 인증/RBAC/MFA/CSRF; DEV03 제품·SKU·창고; DEV04 원장·예약·물류/금전 불변식.
메일/Telegram/시장 API/자동보충/분석/Pi배포/운영백업은 담당DEV에서 구현한다.
60 synthetic SKU fixture 유지. 실제50SKU 업무E2E·물류 F01–30 미실행. Dot/유료AI0, 선택AI01.
Pi5 실물 없음: ARM64 manifest 사전검증만, 실장비 검증은 DEV12 이후. main merge는 운영 배포가 아니다.

[개발 안내](README.md) · [정책](docs/GITHUB_WORKFLOW.md) · [DEV01](docs/dev-reports/DEV-01.md) · [AUTO-01](docs/dev-reports/GITHUB-AUTOMATION-01.md).

## DEV02 현재 작업

선행 [PR9](https://github.com/Raccoon26/Project-WMS/pull/9) 실제 자동병합 `aebdb09773638b2a8c22cd0c93340d93ec1e4818`.
Argon2id/TOTP/서버세션/RBAC/CSRF/사용자·역할/감사/UI를 개발 환경에 구현했다.
[구현 계약](docs/AUTHENTICATION.md) · [실제 테스트·최종 GitHub 상태](docs/dev-reports/DEV-02.md).
실제 운영 HTTPS/키 escrow/Pi/7년보존·복원은 후속 DEV12/13, 운영배포 없음.
