# 배포 설계 (DEV12 구현)

목표: Pi5 8GB/SSD/유선 LAN/냉각/Raspberry Pi OS64 ARM64. 장비 보유·실측 미확인.
Node24/PostgreSQL17 base image의 linux/arm64 manifest와 native deps를 DEV01/12에 검사;
개발 x86 테스트가 Pi 호환 검증을 대신하지 않는다. Compose v2, 단일 host modular monolith.

dev/test/production은 DB/volumes/secrets/remote destinations 완전 분리. dev/test는 mock, 실주소 allowlist 없음.
API/web/worker/DB/선택 tunnel을 Compose services; DB port host 미노출. rootless/nonroot/read-only filesystem,
필요 tmpfs만 쓰기, cap_drop, CPU/memory limit는 실제 측정 후 확정. volume: pgdata/businessfiles,
운영 secret은 git 밖. restart unless-stopped + systemd compose 부팅 unit, healthcheck와 시작 의존성.
무한 restart로 unknown 부작용 재전송 금지. DB role·백업 스케줄·로그 rotation 분리.

## 운영 점검
API liveness(프로세스)와 readiness(DB/필수 schema)를 분리; Worker heartbeat 외 due-job 지연/실패율도 확인.
SSD 여유 <20% 경고/<10% 부작용 중지 정책, dump 여유 사전 검사; 수치는 운영 정책 조정 가능.
메모리/RSS/OOM/CPU/온도/throttling/LAN/DB 접속/로그 용량 감시, log rotate 10MB×5 초기값.
UPS 권장 선택 비용. 정전 후 PostgreSQL WAL recovery→정합성 검사→outbox unknown 격리→안전재개.
외부 접근은 Cloudflare Tunnel+Access 검토; 유료 도메인/무료 tier·접근 정책 조건 확인, 선택 VPN 대안.
포트 직접 개방/공개 DB 금지, HTTPS·앱 인증 필수, Access header를 임의 client가 위조할 수 없도록 tunnel만 ingress.

## 안전한 업데이트·롤백
1. 운영 승인/변경 영향·migration backward compatibility 확인, 릴리스 digest 고정; main 병합은 배포 아님.
2. worker 신규 claim 중지, 진행 중 외부 부작용 결과 확인/불명 격리; drain 완료 전 종료 금지.
3. 최신 암호화 백업+복원 검증 기준 확인, app/schema/설정 version 보존.
4. staging 동일 snapshot(Mock 대상) migration+smoke+불변식 후 운영 maintenance.
5. expand/contract migration 우선, 파괴적 migration 별도 승인/복구 계획; 자동 down migration 금지.
6. API/worker 이미지 업데이트, DB readiness+ledger/reconciliation+업무 smoke, 제한 재개.
7. 실패: 이전 app/schema 호환 시 이전 digest로 rollback. DB 변경 역호환 불가 시 쓰기 중지 후 BACKUP_RECOVERY 복원;
   복원은 외부 작업 대조/epoch 승인까지 재개 금지.

운영 unattended 패키지 업데이트가 업무 중 DB/worker를 임의 재시작하지 않도록 maintenance window.
Pi/OS/kernel/SSD 실증은 DEV12/13/14에 수행; 현재 설치·운영 배포 완료라고 기록하지 않는다.

## 독립 외부 감시 선택안
Pi 밖의 별도 장비(기존 router/server가 실행환경 제공 시) 또는 healthchecks.io 등 무료 tier 후보를 비교한다.
무료 조건/기간/알림지원은 DEV13 최신 확인, 새 유료구독 필수 아님. 동일 Pi에 감시를 두고 외부라 부르지 않는다.
Pi가 주기적 dead-man heartbeat를 보내고, 외부 runner는 API 인증 read probe/마지막 업무성공·백업시각을
별도로 검사; heartbeat만 성공해도 due 작업 실패/지연이면 알림. tunnel 인증은 제한된 service identity,
비밀을 URL/query에 넣지 않는다. Pi 전체정지 시 외부가 독립 경로(별도 Telegram 전송 또는 이메일)로 경보.
외부 API·메일·Telegram은 read-only/synthetic canary만, 실제 출고/구매 작업을 healthcheck로 생성하지 않는다.
