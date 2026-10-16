# 백업·복원 계약 (DEV13 구현)

현재 운영 백업 없음. PostgreSQL17 `pg_dump -Fc`와 동일 major `pg_restore`, rclone Google Drive remote+
crypt를 사용한다. **업로드 전 로컬 암호화**, 원격 암호화/HTTPS만으로 대체하지 않는다.
6시간마다 unique scheduled job, 백업 전용 read 계정; DB 일관 snapshot과 업무 문서 immutable object를 manifest로 묶는다.
문서 파일은 content-addressed 불변 저장소, DB snapshot이 참조하는 object만 포함; dump 중 신규 파일은 다음 백업.
manifest: backup ID/time/schema/app image digest/DB version/object hashes/bytes/restore epoch,
암호문 및 복호문 hash. manifest도 암호화. secret·Drive token·복호키는 백업 본문/저장소와 분리.
키는 관리자 오프라인 별도2매체·복구 절차 보존; 키 없으면 복구 불가함을 점검.

## 파이프라인·보존
사전 공간 확인→일관 dump→문서 manifest/hash→로컬 암호화→임시 원격 upload→hash/크기 검증→complete marker.
완료 전에 이전 정상 백업을 지우지 않는다. 실패는 status 실패/긴급 Telegram+외부감시, last_success 유지.
보존: 6시간본7일(28), 일별30일, 주별12주, 월별12개월. 중복 tier는 한 object 참조 가능.
용량/Drive quota 부족 시 마지막 정상본 유지·보존 축소는 승인, 무조건 삭제 금지.
로컬 임시 dump 권한0600·격리 디렉터리·정상 완료 후 정리(SSD secure delete 보장 주장 금지).
RPO 목표≤6시간(실패 감지 포함 실제 관측 필요), RTO 목표≤4시간(복원 drill 측정 후 확정).

## 복원 runbook
1. 신규 ARM64/호환 서버·동일 버전 이미지·깨끗한 volume 준비, 외부 메일/API/구매 outbound 차단.
2. 별도 저장된 설정·키·권한 복구, remote object+manifest hash/암호화 무결성 검증.
3. 격리 DB에 pg_restore --exit-on-error, business files를 hash 일치 경로에 복원.
4. schema/row count/FK/원장 균형/잔액 재계산/예약 합/문서 참조/승인 버전 점검.
5. 새로운 restore_epoch 부여, scheduler/worker는 read-only recovery mode; pending/sending/unknown 및
   백업 시점 이후 외부 작업 전체를 quarantine. 과거 lease/승인/작업은 자동 재실행하지 않는다.
6. provider 발송함/창고/marketplace/결제 기록과 업무 참조 대조. 복원 전 이미 수행된 건 tombstone/import evidence,
   불명은 held. 외부 결과를 조회할 수 없으면 관리자 확인 전 재개 불가.
7. 관리자 복원 결과 승인→sync read-only 확인→제한된 worker 재개→health/업무 smoke→점진 정상화.
8. 기존 서버 split-brain 방지: fencing epoch+동일 credentials 회수/격리, 두 worker 동시 쓰기 금지.

매월 실제 신규 DB 복원 drill(샘플만이 아닌 선택된 완전 backup), 분기별 새 서버 절차/이전 정상본 복원.
DEV13 테스트: 손상 ciphertext/틀린키/누락파일/token만료/quota/DB 실패/백업 도중전원/복원 후 재발송 금지.
해시만 통과한 백업을 restore_verified로 표시하지 않는다. 성과는 dump/upload/검증/복원 각각 기록.

암호화 구현 경계: rclone crypt를 로컬 ciphertext staging 디렉터리 위에 설정해 dump/문서/manifest를
암호화한 후, 해당 ciphertext 바이트만 Drive remote로 copy하는 구조를 기본으로 한다.
운영 secret의 crypt remote 설정은 별도 권한파일, plaintext staging과 DB volume은 Drive sync 대상에서 제외.
업로드 완료 검증은 ciphertext hash뿐 아니라 정기 복호/pg_restore로 이어져야 한다.
