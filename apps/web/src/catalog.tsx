import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useAuth, AuthRequestError, authRequest } from "./auth";
import type { Locale } from "./i18n";
const words = {
  ja: {
    external_email: "外部メール倉庫",
    blocked: "業務利用不可（商品・SKU状態）",
    history: "変更履歴",
    products: "商品",
    skus: "SKU",
    warehouses: "倉庫",
    locations: "ロケーション",
    accounts: "連携アカウント",
    mappings: "外部コード",
    new: "新規登録",
    save: "保存",
    cancel: "キャンセル",
    search: "検索",
    status: "状態",
    sort: "並び順",
    next: "次のページ",
    first: "最初のページ",
    empty: "該当するデータはありません",
    loading: "読み込み中",
    error:
      "保存できません。入力・権限・接続を確認してください。入力内容は保持されています。",
    conflict: "重複またはバージョン競合です。再取得して比較してください。",
    success: "サーバーに保存しました",
    unknown: "在庫：未連携・未計測",
    detail: "詳細・編集",
    version: "バージョン",
    confirm: "状態を変更しますか？",
    dirty: "未保存の入力を破棄しますか？",
    scope: "倉庫別権限",
    grant: "権限を保存",
    revoke: "この倉庫の権限を回収",
    global: "Global権限は既存ユーザー管理で変更します",
    review: "ローカル確認のみ。外部API未検証。",
    refresh: "再取得",
    readonly: "閲覧のみ",
    related: "関連データ",
    select: "選択",
    name_ja: "商品名（日本語）",
    name_ko: "商品名（韓国語）",
    name_en: "商品名（英語）",
    description: "説明",
    code: "コード",
    barcode: "バーコード",
    product_id: "商品ID",
    name: "名称",
    type: "種類",
    adapter_config_ref: "設定参照（Secret不可）",
    parent_id: "親ロケーションID",
    provider: "プロバイダー",
    account_ref: "非秘密のアカウント参照",
    account_id: "連携アカウントID",
    marketplace: "マーケットプレイス",
    external_code: "外部コード",
    trust: "確認状態",
    order: "方向",
    active: "有効",
    inactive: "無効",
    discontinued: "終売",
    asc: "昇順",
    desc: "降順",
    unverified: "未検証",
    local_reviewed: "ローカル確認済",
    user: "ユーザー",
    warehouse: "対象倉庫",
    role: "役割",
    grants: "現在の権限",
    filter: "絞り込み",
  },
  ko: {
    external_email: "외부 이메일 창고",
    blocked: "업무 사용 불가 (상품·SKU 상태)",
    history: "변경 이력",
    products: "상품",
    skus: "SKU",
    warehouses: "창고",
    locations: "위치",
    accounts: "연동 계정",
    mappings: "외부 코드",
    new: "신규 등록",
    save: "저장",
    cancel: "취소",
    search: "검색",
    status: "상태",
    sort: "정렬",
    next: "다음 페이지",
    first: "첫 페이지",
    empty: "검색 결과가 없습니다",
    loading: "불러오는 중",
    error:
      "저장하지 못했습니다. 입력·권한·연결을 확인하세요. 입력은 보존됩니다.",
    conflict: "중복 또는 버전 충돌입니다. 다시 조회하여 비교하세요.",
    success: "서버에 저장했습니다",
    unknown: "재고: 미연동·미측정",
    detail: "상세·수정",
    version: "버전",
    confirm: "상태를 변경할까요?",
    dirty: "저장하지 않은 입력을 버릴까요?",
    scope: "창고별 권한",
    grant: "권한 저장",
    revoke: "이 창고 권한 회수",
    global: "Global 권한은 기존 사용자 관리에서 변경합니다",
    review: "로컬 검토만 지원합니다. 외부 API 미검증.",
    refresh: "다시 조회",
    readonly: "조회 전용",
    related: "관련 데이터",
    select: "선택",
    name_ja: "상품명 (일본어)",
    name_ko: "상품명 (한국어)",
    name_en: "상품명 (영어)",
    description: "설명",
    code: "코드",
    barcode: "바코드",
    product_id: "상품 ID",
    name: "이름",
    type: "유형",
    adapter_config_ref: "설정 참조 (비밀값 금지)",
    parent_id: "상위 위치 ID",
    provider: "제공자",
    account_ref: "비밀이 아닌 계정 참조",
    account_id: "연동 계정 ID",
    marketplace: "마켓플레이스",
    external_code: "외부 코드",
    trust: "검토 상태",
    order: "방향",
    active: "활성",
    inactive: "비활성",
    discontinued: "단종",
    asc: "오름차순",
    desc: "내림차순",
    unverified: "미검증",
    local_reviewed: "로컬 검토 완료",
    user: "사용자",
    warehouse: "대상 창고",
    role: "역할",
    grants: "현재 권한",
    filter: "필터",
  },
  en: {
    external_email: "External email warehouse",
    blocked: "Not eligible (product/SKU status)",
    history: "Change history",
    products: "Products",
    skus: "SKU",
    warehouses: "Warehouses",
    locations: "Locations",
    accounts: "Integration accounts",
    mappings: "External codes",
    new: "Create",
    save: "Save",
    cancel: "Cancel",
    search: "Search",
    status: "Status",
    sort: "Sort",
    next: "Next page",
    first: "First page",
    empty: "No matching records",
    loading: "Loading",
    error:
      "Could not save. Check input, permission and connection. Your input is retained.",
    conflict:
      "Duplicate or version conflict. Reload and compare before saving.",
    success: "Saved on server",
    unknown: "Inventory: not connected / not measured",
    detail: "Details / edit",
    version: "Version",
    confirm: "Change status?",
    dirty: "Discard unsaved input?",
    scope: "Warehouse permissions",
    grant: "Save permissions",
    revoke: "Revoke this warehouse grant",
    global: "Change Global grants in existing user management",
    review: "Local review only. External API not verified.",
    refresh: "Reload",
    readonly: "Read only",
    related: "Related records",
    select: "Select",
    name_ja: "Product name (Japanese)",
    name_ko: "Product name (Korean)",
    name_en: "Product name (English)",
    description: "Description",
    code: "Code",
    barcode: "Barcode",
    product_id: "Product ID",
    name: "Name",
    type: "Type",
    adapter_config_ref: "Config reference (no secrets)",
    parent_id: "Parent location ID",
    provider: "Provider",
    account_ref: "Non-secret account reference",
    account_id: "Integration account ID",
    marketplace: "Marketplace",
    external_code: "External code",
    trust: "Review state",
    order: "Direction",
    active: "Active",
    inactive: "Inactive",
    discontinued: "Discontinued",
    asc: "Ascending",
    desc: "Descending",
    unverified: "Unverified",
    local_reviewed: "Locally reviewed",
    user: "User",
    warehouse: "Warehouse",
    role: "Role",
    grants: "Current grants",
    filter: "Filter",
  },
};
export type CatalogTextKey = keyof typeof words.ja;
export const catalogText = (l: Locale, k: CatalogTextKey) =>
  words[l][k] ?? words.ja[k];
type Kind =
  "products" | "skus" | "warehouses" | "locations" | "accounts" | "mappings";
type Row = {
  id: string;
  version: number;
  status: string;
  [key: string]: unknown;
};
type Page = { items: Row[]; nextCursor: string | null };
const configs: Record<
  Kind,
  {
    path: string;
    fields: CatalogTextKey[];
    read: string;
    write: string;
    sort: string[];
  }
> = {
  products: {
    path: "products",
    fields: ["name_ja", "name_ko", "name_en", "description", "status"],
    read: "products.read",
    write: "products.write",
    sort: ["id", "name_ja", "status"],
  },
  skus: {
    path: "skus",
    fields: ["product_id", "code", "barcode", "status"],
    read: "products.read",
    write: "products.write",
    sort: ["id", "code", "status"],
  },
  warehouses: {
    path: "warehouses",
    fields: ["code", "name", "type", "status", "adapter_config_ref"],
    read: "warehouses.read",
    write: "warehouses.manage",
    sort: ["id", "code", "name", "status"],
  },
  locations: {
    path: "locations",
    fields: ["code", "name", "parent_id", "status"],
    read: "locations.read",
    write: "locations.manage",
    sort: ["id", "code", "name", "status"],
  },
  accounts: {
    path: "integration-accounts",
    fields: ["provider", "account_ref", "name", "status"],
    read: "mappings.read",
    write: "mappings.manage",
    sort: ["id", "name", "provider", "status"],
  },
  mappings: {
    path: "mappings",
    fields: [
      "account_id",
      "provider",
      "marketplace",
      "external_code",
      "status",
      "trust",
    ],
    read: "mappings.read",
    write: "mappings.manage",
    sort: ["id", "external_code", "status"],
  },
};
export async function catalogRequest(
  path: string,
  body?: unknown,
  method = "POST",
  key?: string,
): Promise<unknown> {
  if (body === undefined) return authRequest(path);
  if (!navigator.onLine) throw new Error("OFFLINE");
  const csrf = (await authRequest("auth/csrf")) as { csrf: string };
  const response = await fetch("/api/v1/" + path, {
    method,
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      "x-csrf-token": csrf.csrf,
      ...(key ? { "idempotency-key": key } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    if (response.status === 401)
      window.dispatchEvent(new Event("wms-unauthorized"));
    throw new AuthRequestError(response.status);
  }
  return response.json();
}
export function ReferencePicker({
  path,
  onSelect,
  label,
  locale,
}: {
  path: string;
  onSelect: (row: Row) => void;
  label: string;
  locale: Locale;
}) {
  const [data, setData] = useState<Page>({ items: [], nextCursor: null }),
    [query, setQuery] = useState(""),
    [cursor, setCursor] = useState(""),
    [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    void authRequest(
      path +
        "?limit=25" +
        (query ? "&q=" + encodeURIComponent(query) : "") +
        (cursor ? "&cursor=" + encodeURIComponent(cursor) : ""),
    )
      .then((r) => {
        if (active) {
          setData(r as Page);
          setError(false);
        }
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [path, query, cursor]);
  return (
    <fieldset className="reference-picker">
      <legend>{label}</legend>
      <input
        aria-label={label + " " + catalogText(locale, "search")}
        value={query}
        maxLength={100}
        onChange={(e) => {
          setQuery(e.target.value);
          setCursor("");
        }}
      />
      {error ? (
        <p role="alert">{catalogText(locale, "error")}</p>
      ) : (
        <select
          aria-label={label}
          defaultValue=""
          onChange={(e) => {
            const r = data.items.find((r) => r.id === e.target.value);
            if (r) onSelect(r);
          }}
        >
          <option value="">{catalogText(locale, "select")}</option>
          {data.items.map((r) => (
            <option value={r.id} key={r.id}>
              {String(r.name_ja ?? r.name ?? r.login ?? r.code ?? r.id)}
            </option>
          ))}
        </select>
      )}
      <button
        type="button"
        aria-label={label + " " + catalogText(locale, "next")}
        disabled={!data.nextCursor}
        onClick={() => setCursor(data.nextCursor!)}
      >
        {catalogText(locale, "next")}
      </button>
      {cursor && (
        <button
          type="button"
          aria-label={label + " " + catalogText(locale, "first")}
          onClick={() => setCursor("")}
        >
          {catalogText(locale, "first")}
        </button>
      )}
    </fieldset>
  );
}
export function CatalogPanel({
  initial,
  locale,
}: {
  initial: Kind;
  locale: Locale;
}) {
  const { user } = useAuth();
  const [kind, setKind] = useState<Kind>(initial),
    [parent, setParent] = useState<Row | null>(null),
    [product, setProduct] = useState<Row | null>(null);
  const [data, setData] = useState<Page>({ items: [], nextCursor: null }),
    [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [status, setStatus] = useState(""),
    [type, setType] = useState(""),
    [sort, setSort] = useState("id"),
    [order, setOrder] = useState("asc"),
    [cursor, setCursor] = useState(""),
    [refresh, setRefresh] = useState(0);
  const [form, setForm] = useState<Record<string, string> | null>(null),
    [selected, setSelected] = useState<Row | null>(null),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [notice, setNotice] = useState("");
  const [historyRows, setHistoryRows] = useState<Row[]>([]),
    [historyTarget, setHistoryTarget] = useState<string | null>(null),
    [historyBefore, setHistoryBefore] = useState<string | null>(null);
  const generation = useRef(0),
    pending = useRef(false),
    requestKey = useRef({ hash: "", key: "" }),
    dirty = useRef(false);
  const t = (k: CatalogTextKey) => catalogText(locale, k),
    config = configs[kind];
  const grants = user?.grants ?? [];
  const canWrite =
    !!user?.permissions.includes(config.write) ||
    !!(
      parent &&
      ["locations", "warehouses"].includes(kind) &&
      grants.some(
        (g) =>
          g.permission === config.write &&
          g.scope === parent.id &&
          g.policyVersion === 1,
      )
    );
  const path =
    kind === "locations"
      ? "warehouses/" + parent?.id + "/locations"
      : kind === "mappings"
        ? "skus/" + parent?.id + "/mappings"
        : config.path;
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    const navigate = (e: Event) => {
      if (dirty.current && !window.confirm(catalogText(locale, "dirty")))
        e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    window.addEventListener("wms-before-navigation", navigate);
    return () => {
      window.removeEventListener("beforeunload", warn);
      window.removeEventListener("wms-before-navigation", navigate);
    };
  }, [locale]);
  useEffect(() => {
    const current = ++generation.current;
    let active = true;
    void Promise.resolve().then(() => {
      if (active) setLoading(true);
    });
    const q = new URLSearchParams({
      limit: "25",
      sort,
      order,
      ...(query ? { q: query } : {}),
      ...(status ? { status } : {}),
      ...(cursor ? { cursor } : {}),
      ...(kind === "skus" && product ? { product_id: product.id } : {}),
      ...(kind === "warehouses" && type ? { type } : {}),
      ...(kind === "mappings" && type ? { provider: type } : {}),
    });
    void authRequest(path + "?" + q)
      .then((r) => {
        if (active && current === generation.current) {
          setData(r as Page);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active && current === generation.current) {
          setData({ items: [], nextCursor: null });
          setNotice(t("error"));
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
    // Locale does not refetch stored metadata; translations are applied while rendering.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    path,
    query,
    status,
    sort,
    order,
    cursor,
    refresh,
    product?.id,
    type,
    user,
  ]);
  const discard = () => !dirty.current || window.confirm(t("dirty"));
  function changeKind(next: Kind, p: Row | null = null) {
    if (!discard()) return;
    dirty.current = false;
    setKind(next);
    setParent(p);
    setForm(null);
    setSelected(null);
    setCursor("");
    setQuery("");
    setSearch("");
    setStatus("");
    setType("");
    setSort("id");
    setNotice("");
    setHistoryRows([]);
    setHistoryTarget(null);
  }
  function edit(row: Row | null) {
    if (!discard()) return;
    dirty.current = false;
    setSelected(row);
    setForm(
      Object.fromEntries(
        config.fields.map((f) => [
          f,
          String(
            row?.[f] ??
              (f === "status"
                ? "active"
                : f === "type"
                  ? "external_email"
                  : f === "provider"
                    ? "amazon"
                    : f === "marketplace"
                      ? "JP"
                      : f === "trust"
                        ? "unverified"
                        : f === "product_id"
                          ? (product?.id ?? "")
                          : ""),
          ),
        ]),
      ),
    );
    requestKey.current = { hash: "", key: "" };
    setNotice("");
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (pending.current || !form) return;
    if (
      selected &&
      form.status !== selected.status &&
      !window.confirm(t("confirm"))
    )
      return;
    pending.current = true;
    setBusy(true);
    const current = generation.current;
    const body: Record<string, unknown> = {};
    for (const f of config.fields) {
      const v = form[f] ?? "";
      if (v) body[f] = v;
      else if (
        [
          "barcode",
          "parent_id",
          "adapter_config_ref",
          "name_ko",
          "name_en",
          "description",
        ].includes(f)
      )
        body[f] = null;
    }
    if (selected) body.version = selected.version;
    const encoded = JSON.stringify(body);
    if (requestKey.current.hash !== encoded)
      requestKey.current = { hash: encoded, key: crypto.randomUUID() };
    try {
      const saved = (await catalogRequest(
        selected ? config.path + "/" + selected.id : path,
        body,
        selected ? "PATCH" : "POST",
        requestKey.current.key,
      )) as Row;
      if (current === generation.current) {
        dirty.current = false;
        setForm(null);
        setSelected(saved);
        setNotice(t("success"));
        setRefresh((x) => x + 1);
      }
    } catch (e) {
      if (current === generation.current)
        setNotice(
          t(
            e instanceof AuthRequestError && e.status === 409
              ? "conflict"
              : "error",
          ),
        );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function showHistory(id: string, before?: string) {
    const current = generation.current;
    try {
      const result = (await authRequest(
        config.path +
          "/" +
          id +
          "/history" +
          (before ? "?before=" + before : ""),
      )) as Page;
      if (current === generation.current) {
        setHistoryTarget(id);
        setHistoryRows(result.items);
        setHistoryBefore(result.nextCursor);
      }
    } catch {
      if (current === generation.current) setNotice(t("error"));
    }
  }
  const options = (field: CatalogTextKey): string[] | null =>
    field === "status"
      ? kind === "products" || kind === "skus"
        ? ["active", "inactive", "discontinued"]
        : ["active", "inactive"]
      : field === "type"
        ? ["external_email", "internal", "fba", "rsl"]
        : field === "provider"
          ? ["amazon", "rakuten"]
          : field === "marketplace"
            ? ["JP"]
            : field === "trust"
              ? ["unverified", "local_reviewed"]
              : null;
  return (
    <section className="panel catalog" aria-label={t(initial)}>
      <div
        className="catalog-toolbar"
        role="navigation"
        aria-label={t("related")}
      >
        {(initial === "products"
          ? ["products", "skus"]
          : initial === "accounts"
            ? ["accounts"]
            : ["warehouses"]
        ).map((k) => (
          <button
            key={k}
            disabled={busy}
            onClick={() => {
              setProduct(null);
              changeKind(k as Kind);
            }}
          >
            {t(k as Kind)}
          </button>
        ))}
      </div>
      <h2>
        {t(kind)}{" "}
        {parent && <small>{String(parent.code ?? parent.name)}</small>}
      </h2>
      <p>{t("unknown")}</p>
      {kind === "mappings" && <p className="banner warning">{t("review")}</p>}
      <form
        className="catalog-toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          setCursor("");
          setQuery(search);
        }}
      >
        <label>
          {t("search")}
          <input
            value={search}
            maxLength={100}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <button>{t("search")}</button>
        <label>
          {t("status")}
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setCursor("");
            }}
          >
            <option value="">—</option>
            {options("status")!.map((v) => (
              <option key={v} value={v}>
                {t(v as CatalogTextKey)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("sort")}
          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value);
              setCursor("");
            }}
          >
            {config.sort.map((v) => (
              <option key={v} value={v}>
                {v === "id" ? "ID" : t(v as CatalogTextKey)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("order")}
          <select
            value={order}
            onChange={(e) => {
              setOrder(e.target.value);
              setCursor("");
            }}
          >
            <option value="asc">{t("asc")}</option>
            <option value="desc">{t("desc")}</option>
          </select>
        </label>
        {(kind === "warehouses" || kind === "mappings") && (
          <label>
            {t("filter")}
            <select
              value={type}
              onChange={(e) => {
                setType(e.target.value);
                setCursor("");
              }}
            >
              <option value="">—</option>
              {(kind === "warehouses"
                ? options("type")!
                : ["amazon", "rakuten"]
              ).map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
        )}
        <button type="button" onClick={() => setRefresh((x) => x + 1)}>
          {t("refresh")}
        </button>
      </form>
      {kind === "accounts" && (
        <ReferencePicker
          path="skus"
          label={t("mappings")}
          locale={locale}
          onSelect={(r) => changeKind("mappings", r)}
        />
      )}
      {kind === "skus" && (
        <ReferencePicker
          path="products"
          label={t("product_id")}
          locale={locale}
          onSelect={(r) => {
            if (discard()) {
              dirty.current = false;
              setForm(null);
              setProduct(r);
              setCursor("");
            }
          }}
        />
      )}
      {notice && (
        <p role="status" className="banner">
          {notice}
        </p>
      )}
      {loading ? (
        <p aria-live="polite">{t("loading")}</p>
      ) : data.items.length === 0 ? (
        <p>{t("empty")}</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{t("name")}</th>
                <th>{t("code")}</th>
                <th>{t("status")}</th>
                <th>{t("version")}</th>
                <th>{t("related")}</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((row) => (
                <tr key={row.id}>
                  <td>
                    {String(
                      row.name_ja ??
                        row.product_name ??
                        row.name ??
                        row.external_code ??
                        row.code,
                    )}
                    {kind === "locations" && row.parent_id ? (
                      <small className="catalog-parent">
                        ↳ {String(row.parent_code ?? row.parent_id)}
                      </small>
                    ) : null}
                  </td>
                  <td>
                    {String(
                      row.code ?? row.account_ref ?? row.external_code ?? "—",
                    )}
                  </td>
                  <td>
                    {t(row.status as CatalogTextKey)}
                    {row.catalog_active === false && (
                      <small> · {t("blocked")}</small>
                    )}
                    {kind === "mappings" && (
                      <small> · {t(row.trust as CatalogTextKey)}</small>
                    )}
                  </td>
                  <td>{row.version}</td>
                  <td>
                    <button
                      onClick={() => {
                        if (kind === "warehouses") setParent(row);
                        edit(row);
                      }}
                    >
                      {t("detail")}
                    </button>
                    <button onClick={() => void showHistory(row.id)}>
                      {t("history")}
                    </button>
                    {kind === "products" && (
                      <button
                        onClick={() => {
                          if (discard()) {
                            setProduct(row);
                            changeKind("skus");
                          }
                        }}
                      >
                        {t("skus")}
                      </button>
                    )}
                    {kind === "skus" && (
                      <button onClick={() => changeKind("mappings", row)}>
                        {t("mappings")}
                      </button>
                    )}
                    {kind === "warehouses" && (
                      <button onClick={() => changeKind("locations", row)}>
                        {t("locations")}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="catalog-toolbar">
        <button
          disabled={busy || loading || !cursor}
          onClick={() => setCursor("")}
        >
          {t("first")}
        </button>
        <button
          disabled={busy || loading || !data.nextCursor}
          onClick={() => setCursor(data.nextCursor!)}
        >
          {t("next")}
        </button>
        {canWrite &&
        (kind !== "warehouses" ||
          user?.permissions.includes("warehouses.manage")) ? (
          <button disabled={busy} onClick={() => edit(null)}>
            {t("new")}
          </button>
        ) : (
          <span>{t("readonly")}</span>
        )}
      </div>
      {historyTarget && (
        <section aria-label={t("history")}>
          <h3>{t("history")}</h3>
          <ol>
            {historyRows.map((r) => (
              <li key={r.id}>
                {t("version")} {r.version} ·{" "}
                {String(
                  (r.snapshot as Row).name_ja ??
                    (r.snapshot as Row).code ??
                    (r.snapshot as Row).external_code ??
                    (r.snapshot as Row).name ??
                    "",
                )}{" "}
                · {String((r.snapshot as Row).status)} ·{" "}
                {String((r.snapshot as Row).trust ?? "")}
              </li>
            ))}
          </ol>
          <button
            disabled={!historyBefore}
            onClick={() => void showHistory(historyTarget, historyBefore!)}
          >
            {t("next")}
          </button>
        </section>
      )}
      {form && (
        <form className="catalog-editor" onSubmit={(e) => void save(e)}>
          <h3>{selected ? t("detail") : t("new")}</h3>
          {selected && (
            <p>
              {t("version")}: {selected.version}
            </p>
          )}
          {kind === "mappings" && (
            <ReferencePicker
              path="integration-accounts"
              label={t("account_id")}
              locale={locale}
              onSelect={(r) => {
                dirty.current = true;
                setForm((f) => ({
                  ...f,
                  account_id: r.id,
                  provider: String(r.provider),
                }));
              }}
            />
          )}
          {kind === "locations" && (
            <ReferencePicker
              path={"warehouses/" + parent?.id + "/locations"}
              label={t("parent_id")}
              locale={locale}
              onSelect={(r) => {
                dirty.current = true;
                setForm((f) => ({ ...f, parent_id: r.id }));
              }}
            />
          )}
          {config.fields.map((field) => (
            <label key={field}>
              {t(field)}
              {options(field) ? (
                <select
                  value={form[field]}
                  disabled={busy || !canWrite}
                  onChange={(e) => {
                    dirty.current = true;
                    setForm({ ...form, [field]: e.target.value });
                  }}
                >
                  {options(field)!.map((v) => (
                    <option value={v} key={v}>
                      {v in words.ja ? t(v as CatalogTextKey) : v}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={form[field]}
                  maxLength={
                    field === "description"
                      ? 2000
                      : field === "barcode"
                        ? 14
                        : field === "code"
                          ? 64
                          : 200
                  }
                  required={[
                    "name_ja",
                    "name",
                    "code",
                    "product_id",
                    "account_id",
                    "account_ref",
                    "external_code",
                  ].includes(field)}
                  disabled={busy || !canWrite}
                  onChange={(e) => {
                    dirty.current = true;
                    setForm({ ...form, [field]: e.target.value });
                  }}
                />
              )}
            </label>
          ))}
          <button disabled={busy || !canWrite || !navigator.onLine}>
            {busy ? t("loading") : t("save")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (discard()) {
                dirty.current = false;
                setForm(null);
              }
            }}
          >
            {t("cancel")}
          </button>
        </form>
      )}
    </section>
  );
}
export function WarehouseGrantsPanel({ locale }: { locale: Locale }) {
  const { user } = useAuth(),
    [target, setTarget] = useState<Row | null>(null),
    [warehouse, setWarehouse] = useState<Row | null>(null),
    [roles, setRoles] = useState<string[]>([]),
    [grants, setGrants] = useState<
      { id: string; code: string; scope: string; warehouse_id: string | null }[]
    >([]),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const active = useRef(0),
    pending = useRef(false);
  const t = (k: CatalogTextKey) => catalogText(locale, k);
  useEffect(() => {
    const n = ++active.current;
    if (target)
      void authRequest("users/" + target.id + "/grants")
        .then((r) => {
          if (n === active.current)
            setGrants((r as { items: typeof grants }).items);
        })
        .catch(() => {
          if (n === active.current) setNotice(t("error"));
        });
    return () => {
      active.current = n + 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, user]);
  async function save(revoke = false) {
    if (pending.current || !target || !warehouse) return;
    pending.current = true;
    setBusy(true);
    const n = active.current;
    try {
      await catalogRequest(
        "users/" + target.id + "/warehouse-roles",
        { warehouse_id: warehouse.id, roles: revoke ? [] : roles },
        "PUT",
      );
      const result = (await authRequest("users/" + target.id + "/grants")) as {
        items: typeof grants;
      };
      if (n === active.current) {
        setGrants(result.items);
        setRoles(
          result.items
            .filter((g) => g.warehouse_id === warehouse.id)
            .map((g) => g.code),
        );
        setNotice(t("success"));
      }
    } catch {
      if (n === active.current) setNotice(t("error"));
    } finally {
      pending.current = false;
      if (n === active.current) setBusy(false);
    }
  }
  return (
    <section className="panel catalog">
      <h2>{t("scope")}</h2>
      <p>{t("global")}</p>
      <ReferencePicker
        path="users"
        label={t("user")}
        locale={locale}
        onSelect={(r) => {
          if (!busy) setTarget(r);
        }}
      />
      <ReferencePicker
        path="warehouses"
        label={t("warehouse")}
        locale={locale}
        onSelect={(r) => {
          if (!busy) {
            setWarehouse(r);
            setRoles(
              grants.filter((g) => g.warehouse_id === r.id).map((g) => g.code),
            );
          }
        }}
      />
      {target && <p>{String(target.login)}</p>}
      <fieldset disabled={busy}>
        <legend>{t("role")}</legend>
        {["Manager", "Operator", "Viewer", "Auditor"].map((r) => (
          <label key={r}>
            <input
              type="checkbox"
              checked={roles.includes(r)}
              onChange={(e) =>
                setRoles(
                  e.target.checked
                    ? [...roles, r]
                    : roles.filter((x) => x !== r),
                )
              }
            />
            {r}
          </label>
        ))}
      </fieldset>
      <button
        disabled={busy || !target || !warehouse || target.id === user?.id}
        onClick={() => void save()}
      >
        {t("grant")}
      </button>
      <button
        disabled={busy || !target || !warehouse || target.id === user?.id}
        onClick={() => void save(true)}
      >
        {t("revoke")}
      </button>
      {notice && <p role="status">{notice}</p>}
      <h3>{t("grants")}</h3>
      <ul>
        {grants.map((g) => (
          <li key={g.id}>
            {g.code} · {g.scope} · {g.warehouse_id ?? "Global"}
          </li>
        ))}
      </ul>
    </section>
  );
}
