# 출시 gate

현재 모든 운영 항목 미완료. DEV14 최초 외부창고 출시와 DEV18 확장 출시에서 각각 적용.
- [ ] 최소50 SKU 실제 E2E·동시성·예약·보충·이력·인덱스·메모리 검증, 하드 한도 없음
- [ ] 재고 불변식/부분출고/부분수령/30장애/복원후 replay 방지 검증
- [ ] 최신성·mapping·CSV·외부결과 unknown hold와 관리자 runbook 검증
- [ ] 상품/재고/문서/메일/Amazon/Rakuten/Telegram 업무별 실제 허용권한·sandbox/운영 smoke 증거
- [ ] API 계약/외부 창고 양식/목적지/실제 계약·추가비용 확인, 미지원 기능 수동 대안 검증
- [ ] 인증/RBAC/MFA/HTTPS/세션/서명/권한회수/CSRF/XSS/비밀/의존성 감사
- [ ] Pi ARM64 실장비·SSD·전원·부팅·drain·롤백·용량·외부감시 실측
- [ ] 6시간 암호화 Drive 백업/키 별도보관/손상 검출/깨끗한DB 실제 복원·외부대조
- [ ] 현재 SHA typecheck/lint/build/unit/integration/invariants/failures/E2E 필수 통과; skip=통과 아님
- [ ] 모든 trace 요구·과거 DEV 누락 감사, 미해결 blocker0; 위험 예외 소유자·기한 승인
- [ ] GitHub PR/필수 CI/유효 병합정책/수동 고위험 검토/실제 병합 확인
- [ ] 운영배포 별도 승인·사전백업·복구계획·진행중 외부작업 대조
- [ ] Dot/AI 비연결·기능 flag OFF 상태 전체 운영 가능; paid AI 의존0
- [ ] 실제 비용·권한·사용량 최신 확인; 개인정보/계약/운영자료 Public repo 미포함
- [ ] 완성 직전 FINAL-AUDIT-01(Astra) 전체 감사/수정/회귀; 각 DEV 자체검증은 별도

체크는 링크된 실제 실행 증거/담당자/시각으로만 변경. DEV00 문서 작성으로 체크하지 않는다.

## DEV01 기반과 운영 출시의 구분
웹/API/DB/Worker 및 합성 환경의 테스트 통과는 운영 출시 체크를 완료하지 않는다.
실제 업무/인증/원장/50 SKU E2E/운영 연동/Pi/복원/최종Astra 감사는 각 후속 DEV에 남는다.
DEV01 패키지/CI/DB/인프라 변경 PR은 Draft·수동 검토. 기존 낮은위험 Actions 자동병합은 유지한다.
