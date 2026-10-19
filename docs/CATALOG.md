# DEV-03 Catalog / Warehouse 계약

개발·합성 환경의 실제 PostgreSQL 마스터 관리다. 재고 원장/잔액/예약/입출고/결제/외부 API/운영 배포는 구현하지 않는다.
재고는 **未連携・未計測**이다. 알 수 없는 수량을 0으로 대체하지 않는다. 50 SKU는 최소 수용 목표이며 상한이 아니다.

## 모델·보존

Drizzle 정의 `packages/db/src/catalog-schema.ts`, forward SQL0002/0003/0004와 snapshot이 실제 구조다.
0000/0001 및 기존 hash는 변경하지 않았다. UTC timestamptz, UUID PK/FK, 양수 integer version,
created_by/updated_by users FK, created_at/updated_at을 마스터에 공통 적용한다.

| 테이블 | 데이터·제약 |
|---|---|
| products | name_ja 필수1–200, ko/en 선택, description≤2000, status/version. 이름은 unique가 아니다 |
| skus | product_id FK, code global unique, nullable barcode unique, 상태/version. product_id는 생성 후 불변 |
| warehouses | 정규화 code unique, name, type external_email/internal/fba/rsl, active/inactive, opaque adapter_config_ref≤100 |
| locations | warehouse FK, (warehouse,id) unique와 (warehouse,parent) 복합 FK, 창고별 code unique, parent optional |
| integration_accounts | provider amazon/rakuten, 비밀 아닌 account_ref, name/status/version, (provider,ref) unique. provider/ref 불변 |
| sku_mappings | SKU/Account FK, Account+Provider 복합 FK, JP marketplace, case-sensitive external_code, 신뢰/검토자·시각·증거 version/유효기간/replaces_id |
| command_results | (actor,key) unique, operation+canonical payload SHA256, JSON 결과/시각. 원장/outbox 아님 |
| catalog_revisions | entity/id/version unique, actor FK, 전체 비밀 없는 metadata snapshot/시각, UPDATE/DELETE 거부 |
| user_roles 확장 | scope global/warehouse, warehouse_id nullable FK, Global⇒NULL / Warehouse⇒NOT NULL CHECK, 두 partial unique index |

products/skus/warehouses/locations/accounts/mappings의 물리 삭제는 DB trigger로 거부한다. 정정은 version 변경과 새 revision,
매핑 식별자 변경은 기존 행 종료+새 행으로 처리한다. 감사는 기존 append-only digest chain이며 revision과 별도로 유지한다.
DB superuser에 대한 완전한 변조 방지/오프디바이스 보존은 DEV12/13 범위다.

## 코드·상태

내부 SKU/창고/위치 code: trim→ASCII uppercase, `[A-Z0-9][A-Z0-9._-]{0,63}`. DB 동일 CHECK/unique.
barcode는 선택적8–14자리 숫자, checksum/실물 스캔을 확인했다는 뜻은 아니다. 코드와 바코드는 별개다.
Provider code는 공백 없는 printable ASCII1–100, **대소문자 보존**. Amazon/Rakuten의 실제 유효 코드라고 보증하지 않는다.

Product/SKU active↔inactive, active/inactive→discontinued, discontinued는 terminal이다. 단종 취소 대신 별도 새 식별자/이력 정책이 필요하다.
Product inactive/discontinued는 하위 SKU의 저장 상태를 일괄 덮어쓰지 않는다. `catalog_active = product.active && sku.active`를 조회한다.
새 SKU와 새/검토 mapping은 active Product/SKU만 가능하다. 기존 이력은 조회한다.
SKU ID는 항상 안정적이고 Product FK는 불변. 매핑 이력이 하나라도 있으면 code 변경을 DB/API에서 거부한다.
DEV04는 첫 원장 참조부터 code 변경을 동등하게 차단하도록 해당 transaction의 guard를 확장해야 한다.

Warehouse inactive는 새 location 생성/활성화를 거부하고 이전 metadata 조회·정정은 허용한다.
비활성화는 실물 재고 0의 증거가 아니다. `catalogEligible(product,sku,warehouse)`는 향후 업무 진입의 필요조건이며
실제 수량/출고 가능성의 충분조건이 아니다. DEV04가 실제 원장/예약/재고량을 검증해야 한다.

## 위치 계층

최대16레벨. 부모와 자식은 같은 창고, 자기/간접 cycle 불가, warehouse 이동 불가.
DB trigger가 warehouse row를 잠그고 recursive CTE로 조상과 하위 subtree 깊이를 검사한다.
서로 다른 행을 동시에 재부모 지정하는 direct SQL 경쟁도 하나만 성공해야 한다.
활성 자식이 있으면 부모 비활성화 거부, 비활성 부모 아래 활성 위치 거부. 실패 transaction은 이전 계층을 유지한다.
이 단계는 위치 마스터만 제공하며 Bin 스캔/피킹/포장 기능은 DEV15–17이다.

## 매핑의 신뢰와 이력

status active/inactive와 trust unverified/local_reviewed는 다른 축이다. 활성 고유 인덱스는
(account_id,provider,marketplace,external_code)에 적용하며 unverified도 충돌을 선점한다.
다른 계정의 동일 코드와 다른 Provider의 서로 다른 계정 코드는 분리된다.
동일 계정은 provider와 FK로 결합되므로 account/provider 혼동은 거부한다.

로컬 검토는 최근 MFA 재인증한 Global mappings.manage 주체만 가능하다. reviewed_by/at,
evidence_source=`local_manual`, evidence_version을 서버가 기록한다. 클라이언트가 검증자를 지정할 수 없다.
외부 API 검증 상태는 DEV03에서 설정할 수 없다. local_reviewed는 Provider 확인과 같지 않으며 자동 재고/출고 근거가 아니다.
외부 코드/계정/Provider/marketplace를 바꾸면 이전 행을 종료하고 replaces_id를 가진 새 unverified 행을 만든다.
기존 검토 증거와 각 버전 snapshot을 보존한다. 종료된 행은 재활성/수정 불가, 새 의미를 조용히 덮어쓰지 않는다.
DEV08/09는 account/mapping/version에 결합된 Provider 원본 증거·조회시각·검증 시각·source version을 받는 별도 검증 port와
forward migration을 추가해야 한다. 검증 기능 부재를 성공으로 대체하지 않는다.

## Global / Warehouse RBAC

기존 Argon2id/TOTP/opaque session/epoch/CSRF/Origin/rate/audit 계약은 [인증](AUTHENTICATION.md)을 따른다.
새6 Permission은 warehouses.read/manage, locations.read/manage, mappings.read/manage다.
Administrator/Manager 기본 Global 역할은6개, Operator/Viewer/Auditor는3개 read만 추가한다.
users/roles 관리 Permission은 확대하지 않는다. auth policy version1 의미를 바꾸지 않고
additive `catalog-policy-v1`을 migration으로 설치한다. 기존 grants/사용자 설정/폐기 이력은 그대로 보존한다.
기존 계정의 새 권한은0002 SQL의 명시적인 role_permissions INSERT로 설치하며 Bootstrap 재실행에 의존하지 않는다.
그 결정·version·권한 추가 범위는 foundation_metadata에 보존한다. 이후 실제 변경 감사는 actor별 audit/revision으로 기록한다.

| 작업 | 필요한 범위 |
|---|---|
| 공유 Product/SKU/Account/Mapping metadata 조회 | 해당 read Global 또는 실제 warehouse에 연결된 read grant |
| 전체 Product/SKU 정의 수정 | Global products.write |
| Account/Mapping 변경·로컬 검토 | Global mappings.manage + 최근 재인증5분 미만 |
| 새 Warehouse 생성 | Global warehouses.manage |
| Warehouse 목록 | Global warehouses.read는 전체, scope만 있으면 SQL WHERE에서 허용ID만 |
| 특정 Warehouse 조회/수정 | 해당 read/manage Global 또는 그 warehouse UUID의 grant |
| 위치 조회/변경/이력 | 소유 warehouse를 DB에서 resolve한 뒤 locations.read/manage scope 검증 |
| Global 역할 변경 | 기존 roles.manage + 최근 재인증, 기존 endpoint는 Global만 교체 |
| Warehouse Grant 부여/회수 | Global roles.manage + 최근 재인증, 자기 변경/Administrator scoped grant 거부 |

Warehouse grant는 실제 FK가 있는 UUID에만 부여한다. 권한을 즉시 다시 조회하며 cache하지 않는다.
Auth me의 `permissions`는 Global만, `grants`는 실제 scope를 포함한다. UI의 숨김은 서버 판정을 대체하지 않는다.
Catalog guard는 완전 MFA 세션 확인 후, **실제 query/mutation transaction 내부**에서 resolve/권한을 다시 검사한다.
모든 mutation은 기존 보안 변경과 동일한 advisory74002→session/user→row→audit74003 순서를 사용한다.
이 작은 시스템에서는 짧은 metadata mutation 직렬화로 교차 사용자 grant 회수/last-admin 경합을 단순화한다.
정상 Catalog 변경에 5분마다 MFA를 강제하지 않는다. 네트워크 외부 호출/긴 작업을 이 잠금 안에 넣으면 안 된다.

## API

기본 `/api/v1`. 모든 응답 no-store, 입력 additionalProperties:false, UUID/길이/enum/정렬 allowlist.
모든 POST에 `Idempotency-Key`8–128 ASCII가 필요하며 PATCH는 `{version,...변경필드}`를 요구한다.
변경은 session+Origin+CSRF 필수. Cookie/토큰/SQL/URL/body 원문은 로그하지 않는다.

| 경로 | Method/입력 |
|---|---|
| products | GET 목록 / POST name_ja,name_ko?,name_en?,description?,status? |
| products/:id | GET / PATCH version + 선택필드 |
| skus | GET 목록 / POST product_id,code,barcode?,status? |
| skus/:id | GET / PATCH version + 선택필드 |
| skus/:id/mappings | GET / POST account_id,provider,marketplace=JP,external_code,status?,trust? |
| mappings/:id | PATCH version + 선택필드; 식별 변경 시 새 mapping ID 반환 |
| integration-accounts | GET / POST provider,account_ref,name,status? |
| integration-accounts/:id | GET / PATCH version,name?,status?; provider/ref 재지정 거부 |
| warehouses | GET / POST code,name,type,status?,adapter_config_ref? |
| warehouses/:id | GET / PATCH version + 선택필드 |
| warehouses/:id/locations | GET / POST code,name,parent_id?,status? |
| locations/:id | PATCH version + 선택필드 |
| 각 상세 경로/history | GET limit≤100,before=version?; append-only revision 최신순 페이지 |
| users/:id/grants | GET Global/scoped grant 조회, roles.read |
| users/:id/warehouse-roles | PUT warehouse_id,roles[]; 빈 배열은 해당 warehouse만 회수 |

400 입력/커서,401 세션,403 권한/CSRF/재인증,404 없음,409 unique/version/key payload,
422 관계·전이,429 제한,503 DB 의존성. 공통 오류 DTO `INVALID_RELATION`을 추가했으며 내부 상세는 null이다.
후속 업무 endpoint는 기존 default deny와 명시적 Permission/UoW 계약을 그대로 적용해야 한다.

## 검색·커서·동시성

목록 `{items,nextCursor,asOf}`. 기본25/최대100은 **페이지 응답 한도**다.
q≤100, status, SKU product_id, mapping provider/account_id, Warehouse type; 허용되지 않는 필터 조합은400.
sort는 각 Entity의 id/name_ja/name/code/status/provider/external_code 중 서버 정의 allowlist만, order asc/desc.
Product는 ja/ko/en, SKU는 code/barcode/외부 mapping code, mapping external code 검색. `%`/`_`는 literal escape한다.
검색은 PG ILIKE, 기본 PK/복합 keyset 인덱스와 PostgreSQL 표준 pg_trgm GIN을 이용한다. extension 설치는 migration 권한의 책임이며
새 유료 서비스/별도 DB는 없다. extension의 함수/연산자만 public에 공유하고 마스터 행은 고유 test schema에 격리한다.
정렬은 `(sort_value,id)`로 안정화, SQL LIMIT+1. 전체 fetch 후 JS slice하지 않는다.
서명된 bounded cursor는 actor/current grants/entity/parent/필터/sort/order/limit에 결합하며 변조/다른 조건 재사용400.
실시간 keyset이므로 변경 중 snapshot 격리는 보장하지 않는다. 정렬값이 바뀐 행은 재등장/누락할 수 있어 새 검색/첫 페이지로 다시 조회한다.
`asOf`는 응답 시각이며 모든 페이지의 고정 snapshot이라고 주장하지 않는다.
이력의 before는 대상별 version 경계이고 매 요청 동일 entity/warehouse 권한을 다시 검사한다.

CAS expected version이 다르면409, 조용한 덮어쓰기/자동 최신화 저장 없음.
command_results는 actor+key의 영속 결과다. 같은 key/동일 canonical payload는 같은 결과,
다른 operation/payload는409. commit 이후 응답 유실/프로세스 재시작도 같은 key로 회복한다.
권한/CSRF/최근 재인증은 저장된 응답을 반환하기 전에도 재검증한다. 결과·revision·audit는 metadata와 같은 transaction이다.
기본 정리/만료 삭제는 아직 없다. DEV04의 금융/외부 업무는 별도 안전 정책·원자성을 추가하며 이 키만으로 외부 exactly-once를 가정하지 않는다.
Catalog before/after는 키 정렬·UTC Date 직렬화한 canonical JSON 문자열을 기존 AuditSink에 전달한다.
따라서 저장 JSONB의 키 순서와 관계없이 SHA256(JSON.stringify(canonicalPayload(snapshot)))로 해당 digest를 재검증한다.
기존 인증 이벤트의 hash chain/event format은 변경하지 않는다.

## UI·개발·DEV04 연결

기존 Products에는 상품/SKU/상세/상태/관련 mapping/이력, Warehouses에는 창고/위치 계층,
Integrations에는 비밀 없는 계정과 SKU별 mapping, Settings에는 Warehouse grant 선택·회수를 연결했다.
ja/ko/en, mobile table scroll,44px controls, 키보드/로딩/빈 목록/오류·409/저장 중 잠금/상태 변경 확인,
실패 입력 보존/같은 key 재사용/로그아웃·offline·권한 회수 후 지연 응답 무효화. 민감 API cache/offline queue 없음.
신규 API가 단순 wmsCatalog flag만으로 Permission 검사를 우회하지 못하도록 정확한 설치 method/path allowlist를 사용한다.
기존 각 화면의 未実装 영역은 **원장 등 후속 물류 업무**를 뜻하며 구현된 metadata와 구분한다.

합성 import `scripts/catalog-fixture.ts`는 test URL + 고유 wms_test schema 이중 guard이며 명시적으로 테스트에서만 호출한다.
기존 JSON60과 generator120/1000의 Product/SKU/4창고유형/2provider metadata만 삽입한다.
good/reserved/expected_available는 원장용 입력 자산으로 보존하고 DB/화면 수량으로 사용하지 않는다.
자동 app 시작 seed/실사용 상품/운영 자격증명/외부 통신 없음.

DEV04는 이 SKU/warehouse UUID를 FK로 사용하고 `catalogEligible` 필요조건, 실제 권한·상태·mapping 증거와 원장/예약을
동일 UoW에서 재확인한다. 출고/입고/재고량/Provider verification/Pi 운영/Windows 실장비는 본 단계 완료와 별개다.
실제 결과/미실행은 [DEV03 보고](dev-reports/DEV-03.md)를 따른다.

## DEV04 현재 작업

불변 복식 재고 원장·예약·증거·부분 입출고·이동·정정·대조를 기존 Catalog/Auth UUID에 연결한다. 내부 구현·로컬 검증을 완료했다. GitHub 병합은 연결된 실제 PR 결과로 별도 판정하며 운영 배포가 아니다. [구현 계약](../docs/INVENTORY_LEDGER.md) · [실제 검증/미실행 범위](../docs/dev-reports/DEV-04.md). 미검증 수동/외부 증거와 위험 조정은 보류한다.
