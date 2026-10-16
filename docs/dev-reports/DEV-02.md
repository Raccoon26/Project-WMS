# DEV-02 — 인증·권한·보안

상태: 구현 및 검증 진행 중. 아직 완료/병합/운영 준비를 선언하지 않는다.
기준선 main86d8ea5에서 시작, 선행 인증 호환성 PR9가 aebdb09773638b2a8c22cd0c93340d93ec1e4818로 자동 병합됨.

현재 구현: Argon2id/TOTP/암호화 secret/opaque 서버 session/CSRF/Permission RBAC/사용자·역할/감사/UI.
DEV01 원래 migration은 변경하지 않음. 실제 업무·운영배포·외부 부작용·Dot 연결 없음.

실행 증거(중간 결과): unit44, integration18, fault32, browser32 통과.
후속 보강 후 최종 전체 재검증이 필요하며 원격 DEV02 CI/PR/병합은 아직 수행 전이다.
Self Review에서 dummy hash 동시성, MFA 오류 UI, 언어 초기 조회 경합,
인증 실패 감사, default-deny 정책을 발견·수정하고 관련 회귀를 추가했다.
완전한 요구사항 감사·최종 결과·제약은 최종 보고 단계에서 갱신한다.
