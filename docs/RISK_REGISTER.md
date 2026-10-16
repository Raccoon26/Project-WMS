# 위험·외부 결정 대장

| ID | 위험/영향 | 수준 | 대응/담당·완료 증거 |
|---|---|---|---|
| K01 | 원장/잔액/예약 불일치·초과출고 | Critical | DEV04 atomic+constraints+50 concurrent+rebuild 불변식 |
| K02 | 이메일 lost ACK·복원후 중복출고 | Critical | DEV06/13 unknown hold·대조·epoch, 전송 카운트0 재생 |
| K03 | 승인후 변경/탈취/무권한 실행 | Critical | DEV02/07 hash/version/MFA/expiry·회수 재확인 |
| K04 | stale snapshot/오SKU/100→95→93 | High | DEV03/04/08/09 mapping 검증·부분수량·차이 격리 |
| K05 | 공개repo 비밀/개인정보 | Critical | 매DEV secret scanner+수동분류, 실제정보 사용금지·회전절차 |
| K06 | Pi전원/SSD/용량/온도·split brain | High | DEV12 real ARM64/전원/용량/epoch; 장비 미확인 |
| K07 | 백업손상/키분실/Drive 인증만료 | Critical | DEV13 키 분리2매체·old backup·월복원; 실제 자격증명 아직 불필요 |
| K08 | heartbeat 정상인데 업무 실패 | High | DEV13 due-job/실패율/백업 age 감시+독립 외부검증 |
| K09 | API/계약 미권한 및 예상밖 요금 | High | DEV08/09 공식 계정확인/CSV 대안/비용승인; 공개문서 접근 일부403 |
| K10 | 자동병합 우회·spoofed green/renamed 위험파일 | Critical | DEV00 trusted base SHA·rename 양쪽·count·현재SHA checks·manual default |
| K11 | main protection 조회403, allow_auto_merge=false | High | 관리자 보호/필수check/bypass검토; bootstrap 수동, 설정 완료전 자동병합 금지 |
| K12 | 50SKU만 테스트하고 이력 확장 실패 | Medium | DEV04/11/14 100만이력/cursor/EXPLAIN/RSS, SKU120 generator |
| K13 | 금액 float/FX/세금/현금 부족 | Critical | DEV10 exact Decimal/통화별 최소단위/승인·예산 |
| K14 | 자동배포가 진행 작업 중단 | High | DEV12 별도승인/drain/backup/rollback·unknown fence |
| K15 | AI/유료 서비스 필수화 | Medium | DEV18 disabled adapter, AI01 opt-in, AI 차단 E2E |
| K16 | 실제운영 범위가 DEV00 문서로 오인 | High | DEV00 REVIEW_PENDING/운영기능 미구현 표시·NOT RUN 명세 유지 |
| K17 | 단독관리자와2인승인 충돌 | High | DEV07 운영정책 결정/재인증·한도·대기 예외 명시, 가짜승인 금지 |
| K18 | 모델 설정을 코드가 보장 못함 | Low | 플랫폼 Sol Medium 확인은 운영자 설정; Astra 최종감사 전용, 확인불가 명시 |

외부 권한/장비/계약은 해당 DEV 활성 전 prerequisite. DEV00 미병합/보호 미확인은 DEV00 최종 gate 미완료로 남긴다.
