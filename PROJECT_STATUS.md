# Project-WMS 상태

2026-10-16. **DEV00 설계·GitHub 기반 main 반영 완료. DEV01 구현·검증 완료 / AUTO-01 적용 후 PR4 자동병합 재검증 중.**
DEV01 브랜치 `dev/dev-01-foundation`을 재사용, 시작 main=`02611d1b85a76c8c3d806bd66f8c4c0ec684c130`.
PR1/2/3 Merged를 원격 재확인. 현재 GitHub `allow_auto_merge=true`, Actions guarded mode 설치·문서변경 병합 실증.
보호규칙 미사용 모드는 직접main bypass를 막지 못하며 보호 사용은 권장. AUTO-01 전환 PR5가 적용되어 경로별 수동 승인 조건은 제거됨. 실제 독립 검증을 통과해야 병합한다.

## 실행 기반
pnpm TS workspace, 일본어 React/Vite/Tailwind15화면/PWA, Fastify 읽기전용 상태·버전,
실제 PostgreSQL17.11·Drizzle migration/hash/lock, 별도 readonly Worker/config/log/shutdown.
로컬 Unit34/DB Integration4/Failure14/Browser8 통과(합성 데이터), browser 및 최종 원격CI는 [DEV01 보고](docs/dev-reports/DEV-01.md)와 PR 기록 참조.
DEV01 구현·테스트 완료와 main 병합은 별개. 최종SHA/PR URL은 GitHub 이력·최종보고가 권위.

## 후속 단계 / 실제 미구현
DEV02 인증/RBAC/MFA/CSRF; DEV03 제품·SKU·창고; DEV04 원장·예약·물류/금전 불변식.
문서/이메일/Telegram/Amazon/Rakuten/자동보충/분석/Pi배포/운영백업은 각DEV에서 구현.
60 synthetic SKU fixture 유지, 실제50SKU 업무E2E 미실행. Dot/유료AI연동0, 선택AI01.
Pi5 실물 없음: ARM64 manifest/native optional package만 사전검증, 실장비/온도/전원/실측은 DEV12 이후.
운영 모드/공개 bind/실제 업무쓰기 차단. main merge≠운영배포.

[개발·설치](README.md) · [상세 계약](docs/DEVELOPMENT.md) · [로드맵](DEV_PROGRESS.md) ·
[요구추적](docs/REQUIREMENTS_TRACEABILITY.md) · [DEV00 이력](docs/dev-reports/DEV-00.md).

## DEV01 GitHub 반영
[PR4](https://github.com/Raccoon26/Project-WMS/pull/4) Open/Draft.
수정529e33e의 [Quality CI 성공](https://github.com/Raccoon26/Project-WMS/actions/runs/38850645498),
Policy는 Draft/고위험 owner검토가 없어 예상 차단. 현재최종HEAD CI는 PR/GitHub에서 재확인한다.
구현 branch에 commit/push 완료, **main 반영/병합은 미완료**. 운영 배포 없음.
