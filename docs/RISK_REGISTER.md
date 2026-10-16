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
| K10 | 자동병합 우회·spoofed green/renamed 위험파일 | Critical | DEV00 trusted base SHA·rename 양쪽·count·현재SHA checks·독립 검증 필수 |
| K11 | 보호 미사용 직접main bypass 위험(native auto_merge 현재true) | High | AUTO-01의 이전 main 독립 verifier+강화검사 자동병합 실증. 보호 없는 직접main bypass 잔존/보호권장 |
| K12 | 50SKU만 테스트하고 이력 확장 실패 | Medium | DEV04/11/14 100만이력/cursor/EXPLAIN/RSS, SKU120 generator |
| K13 | 금액 float/FX/세금/현금 부족 | Critical | DEV10 exact Decimal/통화별 최소단위/승인·예산 |
| K14 | 자동배포가 진행 작업 중단 | High | DEV12 별도승인/drain/backup/rollback·unknown fence |
| K15 | AI/유료 서비스 필수화 | Medium | DEV18 disabled adapter, AI01 opt-in, AI 차단 E2E |
| K16 | 실제운영 범위가 DEV00 문서로 오인 | High | DEV00 설계병합 완료/DEV01 실행기반과 미구현 업무 분리·NOT RUN 명세 유지 |
| K17 | 단독관리자와2인승인 충돌 | High | DEV07 운영정책 결정/재인증·한도·대기 예외 명시, 가짜승인 금지 |
| K18 | 모델 설정을 코드가 보장 못함 | Low | 플랫폼 Sol Medium 확인은 운영자 설정; Astra 최종감사 전용, 확인불가 명시 |

외부 권한/장비/계약은 해당 DEV 활성 전 prerequisite. DEV00 병합 blocker 해소. DEV01은 현재 main 독립 verifier와 실제 필수 검사를 통과해야 병합.

| K19 | 자기 수정 CI가 검사를 약화 | Critical | 이전 main verifier/기존 baseline assertions 재실행, 권한·명령·Secret 검증, read-only 실행/privileged merge 분리. 완전 보안 보장 아님 |
| K20 | 최종 base 조회 직후 외부 writer 경쟁 | High | controller 직렬화·최종 head/base 재조회·HEAD precondition. REST는 base CAS 없음; 직접 main push/동시 수동 병합 금지 |
| K21 | 미구현 업무 검사를 성공으로 오인 | High | main-owned case catalog와 실제 no-skip 실행 증거; 미구현은 필수 검사 누락으로 차단 |

| K22 | MFA/복구코드 동시사용·로그아웃 지연 응답 | Critical | DEV02 PG row lock/일회소비/session rotation/epoch/브라우저 generation 회귀; 실제 테스트는 DEV02 report |
| K23 | 암호화 키 분실/운영 DB 슈퍼유저 감사변조 | High | 개발 auth:setup 별도 설정, 운영키 escrow/최소권한은 DEV12; off-device anchor/7년 보존/실제복원은 DEV13, 현재 운영준비 아님 |
| K24 | 구버전 익명 기준선이 인증 보호와 충돌 | High | main-owned successor PR9, 원래 assertion 유지+실제로그인, 새 auth baseline은 tests/합성seed만 허용 |

## DEV03 현재 구현

K04의 로컬 매핑 고유성/신뢰·버전/이력, K18의 창고 FK/scope 누락을 DEV03에서 검증한다. 외부 Provider 확인·실제 오출고/물류 복구는 DEV08/09/04 이후다. 새 위험: mutable sort key의 실시간 cursor에서 중복·누락 가능(첫 페이지 갱신), metadata mutation 짧은 직렬화로 운영 대규모 부하 한계, DB superuser 변조·7년 보존은 DEV12/13. Windows/Pi 실기기 NOT RUN.
[Catalog 상세 계약](CATALOG.md). 실제 결과는 [DEV03 보고](dev-reports/DEV-03.md)에서 확인한다.
