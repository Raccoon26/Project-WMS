# 배포 설계 (DEV12 구현)

우선 목표(2026-10-19 변경): 사용하지 않는/중고 노트북의 **Ubuntu Server x86-64**, SSD·유선 LAN, Docker Engine/Compose, PostgreSQL. 향후 Raspberry Pi 5 ARM64 이식성 보존. 실제 노트북·Pi 실장비 운영·실측 모두 미확인.
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

## DEV01 현재 상태
Pi5 실물은 **없음**(사용자 확인). 실측/온도/전원/24h 운영은 DEV12 이후.
현재 개발 Compose는 PostgreSQL17.11 이미지+OCI digest 고정, loopback5432 및 별도 test5433/volume.
앱은 host Node 프로세스로 실행하며 localhost로 DB 연결; production full-container/tunnel 배포는 아직 구현 안함.
공식 Node24.19.0-bookworm-slim 및 Postgres17.11 OCI index에 linux/arm64/v8 manifest를 확인.
[ARM64 사전검증](docs/ARM64.md), [실행·종료·volume 주의](README.md), [개발 계약](docs/DEVELOPMENT.md).


## Ubuntu x86-64 노트북 우선·Windows/Dots 독립성 (R26–R31)
최종 운영 제품은 Ubuntu Server의 API/DB/Worker/Scheduler/Marketplace adapter·Outbox/Inbox/백업을 직접 자동 부팅/재시작·헬스체크한다. Windows 데스크톱과 Dots는 전원을 꺼도 주문수집/예약·원장/재고 게시/출고·취소·반품/감사가 멈추지 않아야 한다. Windows의 로컬 파일/DB 공유 마운트·작업 스케줄러·브라우저 세션을 업무 필수 의존으로 만들지 않는다. 외부 API/실운영 인증·송신은 허가 후만 활성화한다. x86-64에서 동작하는 기능을 향후 Linux ARM64로 이식할 수 있도록 다중 아키텍처 의존성, OCI images, locale/폰트, 볼륨/경로, pg_dump/restore를 검증하고 Pi 실증은 실제 장비 확보 후만 성공 표시한다. 첫 출시 전에 전원 차단·복구 및 Windows/Dots 완전 종료 E2E를 실제 Ubuntu 장비에서 확인해야 한다. 자세한 운영 경계 [AI 운영 아키텍처](docs/AI_OPERATIONS_ARCHITECTURE.md).
