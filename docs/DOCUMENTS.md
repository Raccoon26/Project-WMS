# DEV-05 문서 모듈 계약

현재 단계는 **DEV-05-1/2 기반·Manifest·부분 수량 구현**이다. 아래 기반 계약의 2 Artifact는 legacy 문서 기준이며, 신규 Manifest 문서의 형식별 1 Artifact/이번 수량 규칙은 마지막 DEV05-2 절을 따른다. 실제 XLSX/PDF renderer, ArtifactStore, HTTP endpoint/preview/download/문서 UI는 DEV05-3이다. metadata의 ready 전이 테스트는 실제 파일 생성·복원 증거가 아니다. 모든 Snapshot은 sample=true/dispatchable=false이며 이메일/외부 API/운영 배포는 없다.

## 책임과 Port

- `DocumentService.registerTemplate/recordSnapshot/read`는 내부 application port다. 무인증 CLI/HTTP를 노출하지 않는다. 기존 `AuthService`의 Session/User/현재 grants/CSRF/Origin/Audit와 동일 PostgreSQL UnitOfWork를 쓴다.
- `SnapshotBuilder<PoolClient>`의 실제 `PostgresSnapshotBuilder`는 **기존** Outbound/OutboundLine/SKU/Product/Warehouse/Reservation/ShipmentLine을 읽는다. 사본 Outbound 테이블·가짜 업무 엔진은 없다.
- `TemplateRenderer`는 불변 template+snapshot+format → bytes인 교체 가능한 port다. stage1에는 구현이 없다. JSON data-only `sample-grid-v1` 정의와 instruction/manifest 일본어·한국어·영어 기본값만 제공한다. 승인된 실제 업체 양식이라고 표시하지 않는다.
- `ArtifactStore`는 stage/publish/verify/readVerified/restoreExact를 분리한다. 아직 구현하지 않았다. 관리 root 밖 경로·symlink·overwrite·외부 URL·command 실행을 허용하지 않는 것이 구현 계약이다.
- `DocumentReference`는 ID/version/hash를 묶은 데이터 참조다. sample/dispatchable 값으로 발송 권한을 위임하지 않는다. 단계1 타입은 sample:true/dispatchable:false만 허용한다.

## DB 소유권과 불변성

Forward0012는 `document_templates`, `document_template_versions`, `documents`, `document_lines`, `document_sources`, `document_artifacts`, `document_events` 7개를 추가한다. SQL 소유 custom CHECK/trigger/index는 생성 snapshot 외부에 명시한다. Drizzle은 컬럼/기본 FK/PK/unique를 관리한다. 0013은 JSON bigint-string/boolean/version/timestamp 타입을 추가로 강제한다. 기존0000–0011과 이미 적용한0012는 변경하지 않는다.

| Table | PK/FK/Unique·규칙 |
|---|---|
| document_templates | UUID PK, code unique, kind instruction/manifest, active, 실제 users.created_by FK; identity 불변/삭제 금지, active만 변경 가능 |
| document_template_versions | (template_id,version) composite PK/FK; 양수 int, sample=true; canonical UTF8 JSON/definition 일치, PostgreSQL native SHA-256 일치; UPDATE/DELETE 금지 |
| documents | UUID PK, 실제 outbound FK, template 복합 FK, outbound/content version bigint>0, actor FK, actor/key unique, outbound/content version unique; canonical snapshot/JSON/sha256 일치, locale ja/ko/en, sample=true; 전체 UPDATE/DELETE 금지 |
| document_lines | UUID PK, document/outbound 복합 FK·line/SKU FK; (document,line) unique, 실제 동일 Outbound/SKU/진행 수량과 생성 시 대조; 불변 |
| document_sources | UUID PK, document/line 복합 FK, Reservation 또는 ShipmentLine 중 하나의 실제 FK; 문서별 source unique, 동일 OutboundLine 관계·원수량 검증; 불변 |
| document_artifacts | UUID PK, doc FK, doc/format unique(xlsx/pdf); opaque key=id.extension unique, state/revision; binary hash/size/renderer는 pending 때 NULL, 확정 후 변경 금지; 삭제 금지 |
| document_events | UUID PK, doc와 artifact의 복합 FK/actor FK, doc/sequence unique, artifact/revision unique, initial snapshot event unique; append-only |

Header/Line/Source는 hash만 맞는 허위 수량·다른 SKU/창고·다른 업무 Source도 DB에서 거부한다. Snapshot당 전체 line/source와 pending artifact2개/초기 event가 commit에서 완전한지 확인한다. `origin_xid`로 commit 이후 Line/Source/Artifact 추가를 차단한다. 새 내용은 새 content_version의 새 document다. Template 비활성/수정/교체 후에도 이전 Snapshot/버전/문서를 보존한다.

DB superuser의 trigger 제거·파일시스템 자체 변조까지 막았다고 주장하지 않는다. 실제 app/migration/backup 역할 및 보존·암호화 운영은 DEV12/13에서 검증한다.

## 권한·잠금·정확성

Template 등록은 global settings.manage +5분 이내 재인증/완전 MFA/CSRF/Origin이다. 일반 Snapshot 기록은 양쪽 Warehouse의 outbound.create, 읽기는 양쪽 outbound.read를 검증한다. Viewer는 읽기만 가능하다. 아직 HTTP adapter가 없으므로 실제 업무 API의 permission 선언/요청 Schema/입력 크기/Rate Limit 통합은 다음 단계에서 연결한다.

Session→User→actor/key advisory(기존74004 namespace)→Outbound FOR UPDATE→정렬 Warehouse 공유잠금→SKU/Line 공유잠금→Audit74003 순서다. Template 등록은 Session/User→actor/key→template code74005→Audit다. 외부 I/O가 있는 lock 구간은 없다. 권한회수는 기존 user lock과 직렬화된다.

기존 command_results에 operation=`documents.template`/`documents.snapshot`과 canonical request hash를 기록한다. 현재 권한/CSRF를 확인한 뒤 동일 actor/key/hash를 replay한다. 다른 payload/다른 업무 key 재사용409. 신규 Snapshot은 Outbound expected version CAS, content_version은 같은 Outbound lock 아래 증가한다. DB 오류/응답 유실은 성공으로 추정하지 않으며 원 key 재시도로 조회한다. 본 단계에서 DB 오류를 무한 재시도하지 않는다.

Source 이력은 SQL LIMIT5001로 읽고5000행을 넘으면413으로 거부한다(상품 수 상한이 아닌 Snapshot 자원 한도). canonical Snapshot은2MiB 이하만 기록하며 조용한 truncation은 없다.

수량과 bigint version은 JSON decimal 문자열이다. Requested/Shipped/Received/Cancelled/Remaining/미해소 Reserved/Transit을 분리한다. 100→95→93은 미출고5·예약5·Transit2·수령93이다. 실물/소유 재고에 진행량을 중복 합산하지 않는다. 읽기 시 현재 Scope를 먼저 검사하고 canonical/hash를 재검사한다. Outbound 버전 외에도 현재 source 수량/label/관계·템플릿 활성·SKU/Product/Warehouse 활성 상태를 대조해 stale을 표시한다. Receipt가 Outbound header version을 올리지 않는 경우도 놓치지 않는다. metadata 이름은 생성 시 Snapshot에 고정하며 현재 이름으로 예전 문서를 덮어쓰지 않는다.

문서 기록은 원장·잔액·예약·Outbound 상태/버전·Shipment/Receipt·기존 Outbox를 **변경하지 않는다**. 인증 활동·Rate bucket·문서 소유 테이블·Audit·command_results만 쓴다. 감사 실패 시 이들 업무 기록은 함께 Rollback한다.

## 파일/DB 비원자성과 복구 계약 — 다음 단계 구현

1. 인증·Scope·Version·불변 Snapshot + pending artifact metadata + Event/Audit/command result를 DB commit한다. 여기까지가 현재 구현이다.
2. worker/renderer(아직 없음)가 pinned template/renderer/snapshot을 읽어 제한된 bytes를 생성한다. XLSX는 명시적 문자열 cell·수식/매크로/외부 링크 금지, PDF는 코드/링크/첨부/원격 font/실행 콘텐츠 금지, Sample watermark 강제. 실제 파일을 독립 parser/뷰어로 열어 검증해야 한다.
3. root 내부 임시 object를 exclusive 생성, hash/byte size 계산, flush/fsync한다. 그 후 DB metadata staged+revision CAS+Event/Audit를 같은 tx로 commit한다.
4. 같은 filesystem에서 immutable final key로 publish(기존 final은 hash/size 일치 때만 재사용), directory fsync, 다시 bytes/hash/size 확인 후 DB ready+Event/Audit를 commit한다. file 존재만으로 ready가 아니다.
5. staging 후 DB 실패는 orphan으로 남는다. 소유권/age/DB 참조를 확인한 명시적 복구 전까지 자동 삭제/자동 발송하지 않는다. DB staged 후 publish 실패·정전은 staged 유지. publish 성공/DB commit 불명은 같은 ID의 hash 확인 후 CAS 복구한다.
6. ready 파일 누락/변조는 missing/corrupt +Event/Audit, 문서 전체는 quarantined로 파생한다. reader는 bytes를 거부한다. 원본 백업에서 **같은 hash/size**만 복원하고 검증한 뒤 ready 복구한다. 다른 bytes는 새 문서/버전이며 과거 hash를 바꾸지 않는다. failed는 보존하고 새 문서로 재시도한다.
7. 경로는 서버 소유 opaque key(UUID.extension)만 사용한다. 고객 filename/path/URL을 storage key로 받지 않는다. 실제 root 권한·symlink race·저장 공간 부족·경합·프로세스 kill·복원 테스트는 다음 단계 필수다. 실제 운영 DB+파일 백업/암호화/7년 보존 실증은 DEV13이다.

Artifact 상태는 pending→staged→ready, pending/staged→failed, ready→missing/corrupt→ready다. 모든 상태 변화는 revision+1과 각각의 불변 Event를 같은 DB tx에서 요구한다. 확정 hash/size/renderer는 변하지 않는다. 문서 상태는 Artifact2개의 집계 pending/rendering/ready/failed/quarantined로 파생하며 일부 ready는 rendering이다. metadata ready는 파일 검증을 대체하지 않는다.

## DEV06 경계

전달 참조는 documentId/outboundId+version/templateId+version/contentVersion/snapshotSha256/sample을 고정한다. 실제 DEV06 resolver는 현재 Session 또는 system actor 권한·Warehouse/SKU/매핑의 활성·현재 메타데이터와 Snapshot 일치·Outbound version/state·승인 hash/만료/정책·sample=false·artifact ready·최신 파일 hash를 **발송 직전** 재검사해야 한다. 사용자가 sample=false/dispatchable=true를 보내도 허가하지 않는다. stage1에는 이 검증을 통과하는 운영 발송 경로가 없다.

문서 생성·다운로드·이메일 성공은 출고/입고 증거가 아니며, 재고 posting을 호출하지 않는다. provider 결과 불명은 unknown/held로 보류하고 자동 재발송하지 않는 DEV06 규칙을 유지한다. 실제 render/store/API/browser/전송/복원 완료를 stage1 완료로 표시하지 않는다.

## DEV05-2 — 고정 Manifest와 이번 문서 수량

`sampleTemplateManifests`는 instruction/manifest × xlsx/pdf 네 개의 선언형 Sample 계획이다. 등록은 기존 관리자 재인증/CSRF/감사/멱등 경로를 거친다. 기본 언어 ja, 허용 언어 ja/ko/en, A4 portrait/landscape, 여백12/16/20mm, noto-cjk 10/11/12pt, slate/navy만 허용한다. 이는 렌더 계획 검증이며 실제 font 설치·XLSX/PDF 생성 증거가 아니다.

Manifest schemaVersion=1과 문서 Template ID/version/SHA를 고정한다. Field Mapping은 `documentFieldSources`의 13개 필수 필드를 모두 정확히 한 번 포함한다. source는 서버 allowlist 경로와 일치해야 한다. 임의 경로/식/JS/Shell/URL/HTML/CSS/추가 속성은 허용하지 않는다. 제목/안내는 ja/ko/en 제한 길이의 평문이고 실행 markup/URL/Shell 표현도 거부한다. 원래 `columns`는 stage1 호환 정보이며 **새 renderer는 Manifest fields 순서를 사용하고 이번 문서 수량을 반드시 별도 표시**해야 한다. 기존 legacy 정의는 역사 조회/회귀 호환용이다. 해당 Snapshot에는 이번 수량이 없으므로 향후 renderer가 임의의 requested/shipped를 출고 지시 수량으로 대체하면 안 된다.

| 필드 | 의미/출처 |
|---|---|
| requested | OutboundLine.requested_qty |
| cancelled | 확인된 cancelled_qty; cancellation_requested를 취소 확정으로 추정하지 않음 |
| reservedRemaining | Σ Reservation(quantity−consumed−released) |
| alreadyShipped | 실제 OutboundLine.shipped_qty |
| unshipped | requested−cancelled−shipped |
| received | Σ 실제 ShipmentLine.received_qty |
| transit | Σ 실제 shipped_qty−received_qty |
| thisDocumentQuantity | 아래 목적별 선택, 전체 누계와 별도 |

신규 Manifest Snapshot은 기존 schemaVersion=1에 `documentQuantities` 확장을 추가한다. 각 실제 OutboundLine의 lineId/quantity(십진 문자열), purpose, 선택한 shipmentLineIds를 함께 hash에 포함한다. 기존 Snapshot/Line/Source shape·canonical/hash는 변경하지 않는다.

- instruction: 기본 이번 수량=min(unshipped,reservedRemaining). 부분 선택은 `{lines:[{lineId,quantity}]}`만 받는다. 생략한 실제 line은0이고 모든 실제 line의 사실 수량을 함께 보존한다. 중복/외부 line/음수/Number/비정규 문자열/상한 초과/전체0을 거부한다. 양수는 reserved/partially_shipped와 활성 SKU/Product/양쪽 창고에서만 허용한다. draft/held/cancelled/cancellation_requested는 양수 지시를 만들지 못한다. 문서 생성은 예약 소비나 출고가 아니다.
- manifest: `{shipmentLineIds:[실제 동일 Outbound의 ShipmentLine ID]}`로 확인된 출고를 선택한다. 생략하면 현재 확인된 전체 ShipmentLine을 선택한다. 이번 수량은 line별 선택된 shipped_qty 합이며 미래 출고 지시가 아니다. 임의 수량 덮어쓰기/외부·중복 ShipmentLine/전체0을 거부한다. 모든 역사 Source는 선택 여부와 관계없이 Snapshot에 보존한다.
- 100 요청→95 출고→93 수령: 요청100/취소0/미출고5/예약잔량5/이미출고95/Transit2/수령93. 신규 instruction 이번 수량5; 선택된95의 manifest 이번 수량95는 확인된 출고 명세다. 95를 다시 출고하라는 뜻이 아니다. 부분 instruction 수량7은 예약100 중7만 문서화하고 실제 예약100은 그대로다.

클라이언트는 상품명/SKU/창고/상태/출고 누계/수령 누계를 보낼 수 없다. 허용 입력은 기존 source/template/locale/version과 선택(line ID+십진 수량 또는 ShipmentLine ID)뿐이며 나머지는 실제 DB에서 읽는다. 내부 port의 잘못된 선택은409, 추가 header metadata는400이다. HTTP schema/리소스 한도는 DEV05-3 adapter에서 같은 규칙을 명시해야 한다.

신규 Forward0014는 Manifest shape/고정 mapping/kind와 이번 수량을 실제 원자료에 독립 대조하는 trigger를 추가한다. 위조 Builder가 canonical/hash를 다시 계산해도 초과/잘못된 타입/0/중복/외부 line/purpose 변경을 DB에서 거부한다. 기존0000–0013은 수정하지 않는다. 기존 문서는 pending Artifact2개, 신규 형식 고정 문서는 해당 format의 pending Artifact1개를 commit에서 요구하며 둘을 구분한다. 모든 Artifact hash는 여전히 NULL이다.

Outbound CAS/현재 권한/행 잠금/actor-key 멱등/내용 버전 증분은 유지한다. 읽기는 기존 내용·선택을 보존하면서 현재 원자료를 비교한다. 활성 상태·수량·버전이 달라지거나 현재 지시 eligibility를 잃으면 stale=true이며 역사 Snapshot은 계속 조회 가능하다. 새 source/template 버전은 새 content version을 만든다. 모든 template version은 사용 여부와 관계없이 UPDATE/DELETE 불가다. 사용된 버전을 새 정의로 고쳐 쓰지 않는다.

DEV05-2에는 실제 XLSX/PDF renderer/store/문서 HTTP/UI가 아직 없다. Sample=true/dispatchable=false이며 실제 양식 승인·발송/재고 posting/외부 호출을 추가하지 않는다. DEV05-3이 실제 파일·preview/download/UI·파일 복구 및 문서 보안 검증을 이어간다.
