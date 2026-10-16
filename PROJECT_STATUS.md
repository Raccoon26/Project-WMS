# Project-WMS 상태

2026-10-16. **DEV00 설계·GitHub 기반 main 반영 완료. DEV01 구현·로컬검증 완료 / 원격CI·고위험 PR 수동검토 대기.**
DEV01 브랜치 `dev/dev-01-foundation`을 재사용, 시작 main=`02611d1b85a76c8c3d806bd66f8c4c0ec684c130`.
PR1/2/3 Merged를 원격 재확인. 현재 GitHub `allow_auto_merge=true`, Actions guarded mode 설치·문서변경 병합 실증.
보호규칙 미사용 모드는 직접main bypass를 막지 못하며 보호 사용은 권장. 이번 CI/패키지/DB/infra 변경은 자동병합 금지.

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
