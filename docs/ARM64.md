# ARM64 사전 검증 — DEV01

확인일2026-10-16. 호스트 Linux amd64 / Node24.19.0. Raspberry Pi 실물 없음.
공식 registry의 OCI index를 `docker buildx imagetools inspect IMAGE --raw`로 실제 조회:

| 이미지 | OCI index SHA256 | linux/arm64/v8 manifest SHA256 |
|---|---|---|
| postgres:17.11-bookworm | 3645570cccdfa447589da9f57dd740faa29b30938e861289a5574b6ca6b03826 | a85953d6f830fd55a12929df3b7a4fa94dc96d652de62d2d714e0867ccb3670d |
| node:24.19.0-bookworm-slim | a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df | be8929e08ae137e81b5e1edba02259e6c4cb2f5ad655092bb9f56b97e41c4536 |

Node/React/Fastify/pg/Drizzle 코드는 JS/TS; pg-native는 사용하지 않는다.
esbuild/Rollup/Tailwind oxide는 플랫폼별 optional binary가 있으며 lockfile의 linux-arm64와 darwin-arm64 항목을 검토.
Debian bookworm glibc ARM64를 향후 운영 기준으로 삼고 Alpine/musl로 임의 교체하지 않는다.
현재 실제 container 실행은 PostgreSQL amd64, app build는 host amd64. ARM64 바이너리 실행/이미지build·Pi성능은 미실행.
DEV12에서 실제 ARM64 install/build/기동/메모리/SSD/온도/전원/복구를 별도 검증한다.
