# Project-WMS

일본 소규모 전자상거래용 웹 물류·재고 자동화. 현재 **DEV00 설계/개발 기반 검토 중**, 운영 기능 미구현.
React/TypeScript/Vite/Tailwind + Fastify/Node + PostgreSQL/Drizzle + Worker, Raspberry Pi ARM64/Compose 계획.
최초 출시 최소50 SKU, 하드 한도 없음. Dot/유료AI 없이 운영, 실제 연결은 선택 AI01로 연기.

- 시작: [상태](PROJECT_STATUS.md) · [범위](docs/PROJECT_SCOPE.md) · [요구사항](REQUIREMENTS.md)
- 설계: [구조](ARCHITECTURE.md) · [모듈계약](docs/contracts/MODULES.md) · [DB](DATA_MODEL.md) · [업무](OPERATIONS.md)
- 계획: [로드맵](DEV_PROGRESS.md) · [테스트](TEST_PLAN.md) · [추적표](docs/REQUIREMENTS_TRACEABILITY.md)
- 운영: [보안](SECURITY.md) · [백업](BACKUP_RECOVERY.md) · [배포](DEPLOYMENT.md) · [연동/비용](INTEGRATIONS.md)
- 개발: [GitHub](docs/GITHUB_WORKFLOW.md) · [안전](docs/SAFETY_GATES.md) · [보고](docs/dev-reports/DEV-00.md) · [출시](RELEASE_CHECKLIST.md)

DEV00 로컬 검증(Python3.12+, Bash, Git; application install/start는 DEV01):
```bash
PYTHONPATH=scripts python3 -m unittest discover -s scripts -p 'test_*.py' -v
for f in scripts/*.sh; do bash -n "$f"; done
python3 scripts/validate_docs.py
python3 scripts/check_public_files.py
```
Actions YAML은 별도 `actionlint .github/workflows/*.yml`. 현재 PR1은 Draft/수동검토 대상; main 직접push/force 금지.
실제 key/고객정보/공급처계약/운영설정/거래/백업을 이 Public repo에 올리지 않는다. [AGENTS](AGENTS.md).
