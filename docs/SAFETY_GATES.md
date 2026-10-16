# 안전 불변식과 병합/출시 gate

1. 원장 append-only, transaction/SKU sum=0, ledger sum=balance; 정정은 reversal·근거·actor.
2. good>=reserved>=0, 예약합 일치; 동시 reserve는 lock/unique, network I/O는 lock 밖.
3. requested/ack/picked/shipped/received 진행량을 소유재고에 합산 금지; 실물은 account/증거 기준.
4. 모든 변경 key+payload hash; 다른key라도 동일 업무/evidence unique; 취소·출고 충돌 직렬화.
5. outbox DB transaction, lost ACK/sending crash/lease expiry는 unknown hold·대조, 자동재전송 금지.
6. stale/미검증 mapping/불일치에서 자동출고 보류; 100→95→93의 미출고5/운송2 별도 관리.
7. 금액 exact Decimal/minor·통화·세금·FX version, 구매/결제·이상조정은 승인.
8. 승인 user/chat/role/scope/한도/nonce/expiry/version/hash/policy; 변경/권한회수 후 실행 금지.
9. 실제 재고·출고·구매 없는 mock CI, public secret/PII/backup 금지.
10. 암호화6h backup+월실제복원+epoch quarantine, 외부heartbeat+업무실패 독립감시.
11. 같은SHA typecheck/lint/build/unit/integration/invariants/failures+요구감사; skip/미실행/불명은 green 아님.
12. 모든 코드 유형은 독립 자동 검증 성공 시 승인 없이 병합 가능. 미구현/실패/누락된 필수 업무 테스트는 차단한다.
13. main PR+현재SHA check+up-to-date/no bypass 보호 확인 안되면 자동병합 중지. bootstrap PR1 Draft/manual.
14. main merge≠운영배포; 사전백업/drain/별도승인/rollback 후 운영 반영.
15. 최소50SKU는 하한, AI는 default OFF/선택, 운영의존0.

[모델](../DATA_MODEL.md), [장애30개](../TEST_PLAN.md), [출시](../RELEASE_CHECKLIST.md),
[GitHub](GITHUB_WORKFLOW.md)와 연결. 구현전 명세를 실제 불변식 테스트 통과로 표시하지 않는다.

AUTO-01은 Draft를 NOT_READY로 구분하고 metadata green과 병합 허가를 분리한다. [신뢰 경계](GITHUB_WORKFLOW.md).
