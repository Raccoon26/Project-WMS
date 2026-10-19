import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useAuth, AuthRequestError } from "./auth";
import { catalogRequest, ReferencePicker } from "./catalog";
import { formatDate } from "./i18n";
import type { Locale } from "./i18n";
const words = {
  ja: {
    formula: "実物＝正常＋損傷＋隔離、引当可能＝正常−予約、所有＝実物＋輸送中",
    allWarehouses: "全倉庫",
    summary: "SKU・倉庫別集計",
    owned: "所有合計",
    title: "在庫原帳",
    balances: "在庫残高",
    transactions: "原帳履歴",
    reservations: "予約",
    outbounds: "出荷依頼",
    inbounds: "入荷予定",
    transfers: "倉庫間移動",
    reconciliations: "実棚照合",
    opening: "合成初期在庫",
    reclassify: "品質区分変更",
    draft: "出荷計画作成",
    transfer: "移動計画作成",
    reserve: "予約実行",
    cancel: "取消要求",
    ship: "出発証拠を記録",
    receive: "受領証拠を記録",
    reverse: "反対仕訳",
    reconcile: "観測値を照合",
    sku: "SKUを検索",
    warehouse: "出発・対象倉庫",
    destination: "到着倉庫",
    quantity: "数量（整数）",
    reason: "理由",
    reference: "証拠参照",
    source: "証拠の出所",
    synthetic: "合成テスト専用",
    manual: "手動（検証待ち）",
    external: "外部（未検証）",
    save: "サーバーに記録",
    refresh: "再取得",
    next: "次のページ",
    detail: "詳細",
    version: "バージョン",
    target: "対象ID",
    line: "明細ID",
    shipment: "Shipment明細ID",
    account: "在庫口座ID",
    from: "変更前区分",
    to: "変更後区分",
    good: "正常",
    damaged: "損傷",
    quarantine: "隔離",
    transit: "輸送中",
    reserved: "予約済",
    available: "引当可能",
    physical: "実物在庫",
    observed: "観測数量",
    asof: "観測基準時刻",
    search: "検索",
    empty: "該当データなし",
    busy: "処理中",
    saved: "サーバーに記録しました",
    error: "保存できません。入力・権限・証拠・接続を確認してください。",
    conflict:
      "重複またはバージョン競合です。入力を保持しています。再取得して比較してください。",
    warning:
      "実際の発送指示は送信しません。手動・外部証拠と危険調整は保留です。合成データは実在庫ではありません。",
    confirm: "対象・数量・理由を確認して記録しますか？",
    state: "状態",
    evidence: "証拠",
    events: "証拠一覧",
    time: "確定時刻",
    choose: "選択",
    transaction: "原取引ID",
  },
  ko: {
    formula: "실물=정상+손상+격리, 가용=정상−예약, 소유=실물+운송 중",
    allWarehouses: "전체 창고",
    summary: "SKU·창고별 집계",
    owned: "소유 합계",
    title: "재고 원장",
    balances: "재고 잔액",
    transactions: "원장 이력",
    reservations: "예약",
    outbounds: "출고 요청",
    inbounds: "입고 계획",
    transfers: "창고 이동",
    reconciliations: "실사 대조",
    opening: "합성 초기 재고",
    reclassify: "품질 분류 변경",
    draft: "출고 계획 생성",
    transfer: "이동 계획 생성",
    reserve: "예약 실행",
    cancel: "취소 요청",
    ship: "출발 증거 기록",
    receive: "수령 증거 기록",
    reverse: "반대 거래",
    reconcile: "관측값 대조",
    sku: "SKU 검색",
    warehouse: "출발·대상 창고",
    destination: "도착 창고",
    quantity: "수량(정수)",
    reason: "사유",
    reference: "증거 참조",
    source: "증거 출처",
    synthetic: "합성 테스트 전용",
    manual: "수동(검증 대기)",
    external: "외부(미검증)",
    save: "서버에 기록",
    refresh: "새로 조회",
    next: "다음 페이지",
    detail: "상세",
    version: "버전",
    target: "대상 ID",
    line: "명세 ID",
    shipment: "Shipment 명세 ID",
    account: "재고 계정 ID",
    from: "기존 분류",
    to: "변경 분류",
    good: "정상",
    damaged: "손상",
    quarantine: "격리",
    transit: "운송 중",
    reserved: "예약",
    available: "가용",
    physical: "실물 재고",
    observed: "관측 수량",
    asof: "관측 기준 시각",
    search: "검색",
    empty: "데이터 없음",
    busy: "처리 중",
    saved: "서버에 기록했습니다",
    error: "입력·권한·증거·연결을 확인하세요.",
    conflict:
      "중복 또는 버전 충돌입니다. 입력은 유지됩니다. 다시 조회하여 비교하세요.",
    warning:
      "실제 출고 지시를 전송하지 않습니다. 수동·외부 증거와 위험 조정은 보류합니다. 합성 데이터는 실제 재고가 아닙니다.",
    confirm: "대상·수량·사유를 확인하고 기록할까요?",
    state: "상태",
    evidence: "증거",
    events: "증거 목록",
    time: "확정 시각",
    choose: "선택",
    transaction: "원거래 ID",
  },
  en: {
    formula:
      "Physical = Good + Damaged + Quarantine; Available = Good − Reserved; Owned = Physical + Transit",
    allWarehouses: "All warehouses",
    summary: "SKU / warehouse totals",
    owned: "Owned total",
    title: "Inventory ledger",
    balances: "Balances",
    transactions: "Ledger history",
    reservations: "Reservations",
    outbounds: "Outbounds",
    inbounds: "Inbounds",
    transfers: "Transfers",
    reconciliations: "Reconciliation",
    opening: "Synthetic opening",
    reclassify: "Reclassify stock",
    draft: "Create outbound plan",
    transfer: "Create transfer plan",
    reserve: "Reserve stock",
    cancel: "Request cancellation",
    ship: "Record shipment evidence",
    receive: "Record receipt evidence",
    reverse: "Reverse transaction",
    reconcile: "Reconcile observation",
    sku: "Search SKU",
    warehouse: "Source / target warehouse",
    destination: "Destination warehouse",
    quantity: "Quantity (integer)",
    reason: "Reason",
    reference: "Evidence reference",
    source: "Evidence source",
    synthetic: "Synthetic test only",
    manual: "Manual (pending verification)",
    external: "External (unverified)",
    save: "Record on server",
    refresh: "Refresh",
    next: "Next page",
    detail: "Details",
    version: "Version",
    target: "Target ID",
    line: "Line ID",
    shipment: "Shipment line ID",
    account: "Account ID",
    from: "Previous condition",
    to: "New condition",
    good: "Good",
    damaged: "Damaged",
    quarantine: "Quarantine",
    transit: "In transit",
    reserved: "Reserved",
    available: "Available",
    physical: "Physical",
    observed: "Observed quantity",
    asof: "Observation cutoff",
    search: "Search",
    empty: "No matching records",
    busy: "Working",
    saved: "Recorded on server",
    error: "Check input, permission, evidence and connection.",
    conflict:
      "Duplicate or version conflict. Input is retained. Refresh and compare.",
    warning:
      "No dispatch instructions are sent. Manual/external evidence and dangerous adjustments are held. Synthetic data is not operational stock.",
    confirm: "Confirm target, quantity and reason before recording?",
    state: "State",
    evidence: "Evidence",
    events: "Evidence list",
    time: "Recorded at",
    choose: "Select",
    transaction: "Original transaction ID",
  },
};
export function inventoryNotice(locale: Locale) {
  return words[locale].warning;
}
type Word = keyof typeof words.ja;
type Row = Record<string, unknown>;
const initialEntity = (path: string) =>
  path === "/outbound"
    ? "outbounds"
    : path === "/inbound"
      ? "inbounds"
      : path === "/transfers"
        ? "transfers"
        : path === "/activity-logs"
          ? "transactions"
          : "balances";
export function InventoryPanel({
  locale,
  path,
}: {
  locale: Locale;
  path: string;
}) {
  const t = (k: Word) => words[locale]?.[k] ?? words.ja[k];
  const { user } = useAuth();
  const [entity, setEntity] = useState(initialEntity(path)),
    [rows, setRows] = useState<Row[]>([]),
    [cursor, setCursor] = useState(""),
    [next, setNext] = useState<string | null>(null),
    [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [loading, setLoading] = useState(false),
    [selected, setSelected] = useState<Row | null>(null),
    [operation, setOperation] = useState("opening"),
    [form, setForm] = useState<Record<string, string>>({
      quantity: "",
      version: "1",
      source: "local_manual",
      from_kind: "good",
      to_kind: "damaged",
      condition: "good",
    }),
    [sku, setSku] = useState<{
      id: string;
      version: number;
      code: string;
    } | null>(null),
    [rev, setRev] = useState(0);
  const detailVersion = useRef(0);
  const [eventRows, setEventRows] = useState<Row[]>([]),
    [eventPath, setEventPath] = useState(""),
    [eventCursor, setEventCursor] = useState<string | null>(null);
  const pendingEvidence = useRef({
      event: crypto.randomUUID(),
      at: new Date().toISOString(),
    }),
    busy = useRef(false),
    key = useRef(crypto.randomUUID()),
    generation = useRef(0);
  const permissions = user?.grants ?? [];
  const canWrite =
    operation === "opening" ||
    operation === "reclassify" ||
    operation === "reverse"
      ? permissions.some((g) => g.permission === "inventory.adjust")
      : operation === "reconcile"
        ? permissions.some((g) => g.permission === "inventory.adjust")
        : permissions.some((g) => g.permission === "outbound.create");
  const endpoint =
    entity === "balances"
      ? "inventory/balances"
      : entity === "summary"
        ? "inventory/summary"
        : entity === "transactions"
          ? "inventory/transactions"
          : entity;
  useEffect(() => {
    const current = ++generation.current;
    let active = true;
    void catalogRequest(
      endpoint +
        "?limit=25" +
        (cursor ? "&cursor=" + encodeURIComponent(cursor) : "") +
        (query ? "&q=" + encodeURIComponent(query) : "") +
        (filter ? "&warehouse_id=" + encodeURIComponent(filter) : ""),
    )
      .then((data) => {
        if (!active || current !== generation.current) return;
        const page = data as { items: Row[]; nextCursor: string | null };
        setRows(page.items);
        setNext(page.nextCursor);
      })
      .catch(() => {
        if (active && current === generation.current) {
          setRows([]);
          setSelected(null);
          setEventRows([]);
          setError(words[locale].error);
        }
      })
      .finally(() => {
        if (active && current === generation.current) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [endpoint, cursor, query, filter, rev, locale]);
  useEffect(() => {
    const offline = () => {
      generation.current++;
      setRows([]);
      setSelected(null);
      setError(words[locale].error);
    };
    const online = () => setRev((x) => x + 1);
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    return () => {
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
    };
  }, [locale]);
  function field(name: string, label: Word, type = "text", required = true) {
    return (
      <label key={name}>
        {t(label)}
        <input
          type={type}
          step={type === "datetime-local" ? "0.001" : undefined}
          value={form[name] ?? ""}
          required={required}
          maxLength={name === "reason" ? 1000 : 200}
          inputMode={
            ["quantity", "version", "observed"].includes(name)
              ? "numeric"
              : undefined
          }
          onChange={(e) => setForm({ ...form, [name]: e.target.value })}
        />
      </label>
    );
  }
  async function detail(row: Row) {
    if (entity === "summary") {
      setEntity("balances");
      setFilter(String(row.warehouse_id));
      setQuery(String(row.sku_code));
      setSearch(String(row.sku_code));
      setCursor("");
      return;
    }
    const current = generation.current,
      version = ++detailVersion.current;
    try {
      const data = (await catalogRequest(endpoint + "/" + row.id)) as Row;
      if (current !== generation.current || version !== detailVersion.current)
        return;
      setSelected(data);
      setEventRows([]);
      setEventPath("");
      setEventCursor(null);
      setForm((x) => ({
        ...x,
        target: String(row.id),
        version: String(row.version ?? "1"),
        account_id: String(row.id),
        transaction_id: String(row.id),
      }));
    } catch {
      setSelected(null);
      setEventRows([]);
      setError(t("error"));
    }
  }
  async function loadEvents(path: string, cursor?: string) {
    const current = generation.current,
      version = detailVersion.current;
    try {
      const data = (await catalogRequest(
        path +
          "?limit=25" +
          (cursor ? "&cursor=" + encodeURIComponent(cursor) : ""),
      )) as { items: Row[]; nextCursor: string | null };
      if (current !== generation.current || version !== detailVersion.current)
        return;
      setEventRows(data.items);
      setEventCursor(data.nextCursor);
      setEventPath(path);
    } catch {
      if (current === generation.current) setError(t("error"));
    }
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (busy.current || !navigator.onLine) return;
    if (!window.confirm(t("confirm"))) return;
    busy.current = true;
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const evidence = {
        source: form.source,
        source_event_id: pendingEvidence.current.event,
        evidence_ref: form.evidence_ref,
        reason: form.reason,
        occurred_at: pendingEvidence.current.at,
      };
      let body: Row = {},
        url = "";
      const identity = { sku_id: sku?.id, sku_version: sku?.version };
      if (operation === "opening" || operation === "reclassify") {
        body = {
          ...evidence,
          ...identity,
          warehouse_id: form.warehouse_id,
          quantity: form.quantity,
          ...(operation === "reclassify"
            ? { from_kind: form.from_kind, to_kind: form.to_kind }
            : {}),
        };
        url =
          "inventory/" +
          (operation === "opening" ? "openings" : "reclassifications");
      } else if (operation === "draft" || operation === "transfer") {
        url = operation === "draft" ? "outbounds" : "transfers";
        body = {
          business_ref: form.business_ref,
          source_warehouse_id: form.warehouse_id,
          destination_warehouse_id: form.destination_warehouse_id,
          lines: [{ ...identity, quantity: form.quantity }],
        };
      } else if (operation === "reserve" || operation === "cancel") {
        url = "outbounds/" + form.target + "/" + operation;
        body = { version: form.version };
      } else if (operation === "ship") {
        url = "outbounds/" + form.target + "/shipments";
        body = {
          ...evidence,
          ...identity,
          version: form.version,
          line_id: form.line_id,
          quantity: form.quantity,
        };
      } else if (operation === "receive") {
        url = "inbounds/" + form.target + "/receipts";
        body = {
          ...evidence,
          ...identity,
          version: form.version,
          shipment_line_id: form.shipment_line_id,
          quantity: form.quantity,
          condition: form.condition,
        };
      } else if (operation === "reverse") {
        url = "inventory/reversals";
        body = { ...evidence, transaction_id: form.transaction_id };
      } else {
        url = "reconciliations";
        body = {
          ...evidence,
          account_id: form.account_id,
          warehouse_id: form.warehouse_id,
          observed: form.observed,
          as_of: new Date(form.as_of ?? "").toISOString(),
        };
      }
      const result = (await catalogRequest(
        url,
        body,
        "POST",
        key.current,
      )) as Row;
      key.current = crypto.randomUUID();
      pendingEvidence.current = {
        event: crypto.randomUUID(),
        at: new Date().toISOString(),
      };
      setForm((x) => ({
        ...x,
        event_id: "",
        occurred_at: "",
        version: String(result.version ?? x.version),
      }));
      setSelected(result);
      setMessage(t("saved") + " · " + String(result.state ?? ""));
      setCursor("");
      if (
        sku &&
        ["opening", "reclassify"].includes(operation) &&
        ["balances", "summary"].includes(entity)
      ) {
        setQuery(sku.code);
        setSearch(sku.code);
      }
      setRev((x) => x + 1);
    } catch (e) {
      setError(
        e instanceof AuthRequestError && e.status === 409
          ? t("conflict")
          : t("error"),
      );
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }
  const evidenceOps = [
    "opening",
    "reclassify",
    "ship",
    "receive",
    "reverse",
    "reconcile",
  ];
  const label = (key: string) => (key in words.ja ? t(key as Word) : key);
  return (
    <section className="catalog inventory-engine" aria-label={t("title")}>
      <h2>{t("title")}</h2>
      <p className="banner warning">{t("warning")}</p>
      <p>{t("formula")}</p>
      <div className="catalog-tabs">
        {[
          "balances",
          "summary",
          "transactions",
          "reservations",
          "outbounds",
          "inbounds",
          "transfers",
          "reconciliations",
        ].map((v) => (
          <button
            key={v}
            aria-pressed={v === entity}
            onClick={() => {
              setEntity(v);
              setQuery("");
              setSearch("");
              setCursor("");
              setSelected(null);
            }}
          >
            {label(v)}
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(search);
          setCursor("");
        }}
      >
        <label>
          {t("search")}
          <input
            name="q"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            maxLength={100}
          />
        </label>
        <button>{t("search")}</button>
      </form>
      <ReferencePicker
        path="warehouses"
        locale={locale}
        label={t("warehouse")}
        onSelect={(r) => {
          setFilter(r.id);
          setCursor("");
          setForm((x) => ({ ...x, warehouse_id: r.id }));
        }}
      />
      <button
        onClick={() => {
          setFilter("");
          setCursor("");
        }}
      >
        {t("allWarehouses")}
      </button>
      <button
        disabled={loading}
        onClick={() => {
          setCursor("");
          setRev((x) => x + 1);
        }}
      >
        {t("refresh")}
      </button>
      {loading && <p role="status">{t("busy")}</p>}
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {entity === "summary" ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {[
                  "sku",
                  "warehouse",
                  "good",
                  "damaged",
                  "quarantine",
                  "physical",
                  "reserved",
                  "available",
                  "transit",
                  "owned",
                  "detail",
                ].map((k) => (
                  <th key={k}>{label(k)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={String(row.id)}>
                  {[
                    "sku_code",
                    "warehouse_id",
                    "good",
                    "damaged",
                    "quarantine",
                    "physical",
                    "reserved",
                    "available",
                    "transit",
                    "owned",
                  ].map((k) => (
                    <td key={k}>{String(row[k])}</td>
                  ))}
                  <td>
                    <button onClick={() => void detail(row)}>
                      {t("detail")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {[
                  "sku",
                  "state",
                  "quantity",
                  "reserved",
                  "available",
                  "version",
                  "time",
                  "detail",
                ].map((k) => (
                  <th key={k}>{label(k)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={String(r.id)}>
                  <td>{String(r.sku_code ?? r.business_ref ?? r.id)}</td>
                  <td>
                    {label(
                      String(
                        r.kind ?? r.state ?? r.status ?? r.movement_type ?? "",
                      ),
                    )}
                  </td>
                  <td>{String(r.quantity ?? "—")}</td>
                  <td>{String(r.reserved ?? "—")}</td>
                  <td>{String(r.available ?? "—")}</td>
                  <td>{String(r.version ?? "—")}</td>
                  <td>
                    {formatDate(
                      String(
                        r.updated_at ?? r.recorded_at ?? r.created_at ?? "",
                      ),
                      locale,
                    )}
                  </td>
                  <td>
                    <button onClick={() => void detail(r)}>
                      {t("detail")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!loading && !rows.length && <p>{t("empty")}</p>}
      <button disabled={!next || loading} onClick={() => setCursor(next ?? "")}>
        {t("next")}
      </button>
      {selected && (
        <article aria-label={t("detail")}>
          <h3>{t("detail")}</h3>
          <dl>
            {Object.entries(selected)
              .filter(([, v]) => !Array.isArray(v) && typeof v !== "object")
              .map(([k, v]) => (
                <div key={k}>
                  <dt>{label(k)}</dt>
                  <dd style={{ overflowWrap: "anywhere" }}>
                    {String(v ?? "—")}
                  </dd>
                </div>
              ))}
          </dl>
          {!!selected.evidence && typeof selected.evidence === "object" && (
            <section aria-label={t("evidence")}>
              <h4>{t("evidence")}</h4>
              <dl>
                {Object.entries(selected.evidence as Row).map(([k, v]) => (
                  <div key={k}>
                    <dt>{label(k)}</dt>
                    <dd style={{ overflowWrap: "anywhere" }}>
                      {String(v ?? "—")}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
          {["shipments_url", "receipts_url"].map(
            (k) =>
              typeof selected[k] === "string" && (
                <button
                  key={k}
                  onClick={() => void loadEvents(String(selected[k]))}
                >
                  {t("events")}
                </button>
              ),
          )}
          {eventPath && (
            <div className="table-scroll">
              <table>
                <caption>{t("events")}</caption>
                <tbody>
                  {eventRows.map((row) => (
                    <tr key={String(row.id)}>
                      <td>
                        {Object.entries(row)
                          .map(([k, v]) => k + ": " + String(v))
                          .join(" · ")}
                      </td>
                      <td>
                        <button
                          onClick={() =>
                            setForm((x) => ({
                              ...x,
                              shipment_line_id: String(
                                row.shipment_line_id ?? row.id,
                              ),
                            }))
                          }
                        >
                          {t("choose")}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button
                disabled={!eventCursor}
                aria-label={t("evidence") + " " + t("next")}
                onClick={() =>
                  void loadEvents(eventPath, eventCursor ?? undefined)
                }
              >
                {t("next")}
              </button>
            </div>
          )}
          {["lines", "entries", "shipments"].map(
            (k) =>
              Array.isArray(selected[k]) && (
                <div key={k} className="table-scroll">
                  <table>
                    <caption>{k}</caption>
                    <tbody>
                      {(selected[k] as Row[]).map((r) => (
                        <tr key={String(r.id)}>
                          <td style={{ overflowWrap: "anywhere" }}>
                            {Object.entries(r)
                              .map(([k, v]) => k + ": " + String(v))
                              .join(" · ")}
                          </td>
                          <td>
                            <button
                              onClick={() =>
                                setForm((x) => ({
                                  ...x,
                                  line_id: String(r.id),
                                  shipment_line_id: String(r.id),
                                }))
                              }
                            >
                              {t("choose")}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ),
          )}
        </article>
      )}
      <form className="catalog-editor" onSubmit={(e) => void save(e)}>
        <label>
          {t("title")}
          <select
            value={operation}
            onChange={(e) => {
              setOperation(e.target.value);
              key.current = crypto.randomUUID();
              setForm((x) => ({ ...x, event_id: "", occurred_at: "" }));
            }}
          >
            {[
              "opening",
              "reclassify",
              "draft",
              "transfer",
              "reserve",
              "cancel",
              "ship",
              "receive",
              "reverse",
              "reconcile",
            ].map((o) => (
              <option key={o} value={o}>
                {label(o)}
              </option>
            ))}
          </select>
        </label>
        {[
          "opening",
          "reclassify",
          "draft",
          "transfer",
          "ship",
          "receive",
        ].includes(operation) && (
          <>
            <ReferencePicker
              path="skus"
              locale={locale}
              label={t("sku")}
              onSelect={(r) =>
                setSku({ id: r.id, version: r.version, code: String(r.code) })
              }
            />
            <p>{sku?.code ?? "—"}</p>
            {field("quantity", "quantity")}
          </>
        )}
        {["opening", "reclassify", "draft", "transfer", "reconcile"].includes(
          operation,
        ) && field("warehouse_id", "warehouse")}
        {["draft", "transfer"].includes(operation) && (
          <>
            <ReferencePicker
              path="warehouses"
              locale={locale}
              label={t("destination")}
              onSelect={(r) =>
                setForm((x) => ({ ...x, destination_warehouse_id: r.id }))
              }
            />
            {field("destination_warehouse_id", "destination")}
            {field("business_ref", "reference")}
          </>
        )}
        {["reserve", "cancel", "ship", "receive"].includes(operation) && (
          <>
            {field("target", "target")}
            {field("version", "version")}
          </>
        )}
        {operation === "ship" && field("line_id", "line")}
        {operation === "receive" && field("shipment_line_id", "shipment")}
        {operation === "reverse" && field("transaction_id", "transaction")}
        {operation === "reclassify" &&
          (["from_kind", "to_kind"] as const).map((k) => (
            <label key={k}>
              {t(k === "from_kind" ? "from" : "to")}
              <select
                value={form[k]}
                onChange={(e) => setForm({ ...form, [k]: e.target.value })}
              >
                {["good", "damaged", "quarantine"].map((v) => (
                  <option key={v} value={v}>
                    {label(v)}
                  </option>
                ))}
              </select>
            </label>
          ))}
        {operation === "receive" && (
          <label>
            {t("state")}
            <select
              value={form.condition}
              onChange={(e) => setForm({ ...form, condition: e.target.value })}
            >
              {["good", "damaged", "quarantine"].map((v) => (
                <option key={v} value={v}>
                  {label(v)}
                </option>
              ))}
            </select>
          </label>
        )}
        {operation === "reconcile" && (
          <>
            {field("account_id", "account")}
            {field("observed", "observed")}
            {field("as_of", "asof", "datetime-local")}
          </>
        )}
        {evidenceOps.includes(operation) && (
          <>
            <label>
              {t("source")}
              <select
                value={form.source}
                onChange={(e) => setForm({ ...form, source: e.target.value })}
              >
                <option value="local_manual">{t("manual")}</option>
                <option value="synthetic">{t("synthetic")}</option>
                <option value="external">{t("external")}</option>
              </select>
            </label>
            {field("evidence_ref", "reference")}
            {field("reason", "reason")}
          </>
        )}
        <button disabled={loading || !canWrite || !navigator.onLine}>
          {t("save")}
        </button>
      </form>
    </section>
  );
}
