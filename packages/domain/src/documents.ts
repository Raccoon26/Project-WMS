/** Plain-data template validation, never an executable template language. */
export const documentColumns = [
  "sku",
  "product",
  "requested",
  "remaining",
  "shipped",
  "received",
  "reserved",
  "transit",
] as const;
export const sampleWatermark = "SAMPLE / サンプル / 샘플";
export function validTemplateDefinition(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  if (
    Object.keys(v).sort().join() !==
      (v.manifest === undefined
        ? "columns,footer,renderer,title,watermark"
        : "columns,footer,manifest,renderer,title,watermark") ||
    v.renderer !== "sample-grid-v1" ||
    v.watermark !== sampleWatermark
  )
    return false;
  for (const [field, max] of [
    ["title", 200],
    ["footer", 500],
  ] as const) {
    const texts = v[field];
    if (
      !texts ||
      typeof texts !== "object" ||
      Array.isArray(texts) ||
      Object.keys(texts).sort().join() !== "en,ja,ko"
    )
      return false;
    if (
      !Object.values(texts).every(
        (t) =>
          typeof t === "string" &&
          t.trim().length > 0 &&
          t.length <= max &&
          !/[<>]|(?:https?|javascript|data|file):|\$\(|`/i.test(t) &&
          !Array.from(t).some((c) => {
            const n = c.codePointAt(0)!;
            return (
              n < 32 ||
              n === 127 ||
              (n >= 0x202a && n <= 0x202e) ||
              (n >= 0x2066 && n <= 0x2069) ||
              (n >= 0xd800 && n <= 0xdfff)
            );
          }),
      )
    )
      return false;
  }
  if (v.manifest !== undefined && !validTemplateManifest(v.manifest))
    return false;
  return (
    Array.isArray(v.columns) &&
    v.columns.length > 0 &&
    v.columns.length <= documentColumns.length &&
    new Set(v.columns).size === v.columns.length &&
    v.columns.every((c) => documentColumns.includes(c))
  );
}
/** Sample generation is never shipping authorization. No live dispatcher exists. */
export function documentDispatchBlock(
  sample: boolean,
  ready: boolean,
  current: boolean,
): string {
  if (sample) return "SAMPLE_DOCUMENT";
  if (!ready) return "DOCUMENT_NOT_READY";
  if (!current) return "STALE_DOCUMENT";
  return "APPROVAL_AND_VERIFIED_DELIVERY_REQUIRED";
}

/** No expressions, arbitrary paths, network references, markup or executable hooks. */
export const documentFieldSources = {
  outbound: "outbound.businessRef",
  sourceWarehouse: "outbound.source.name",
  destinationWarehouse: "outbound.destination.name",
  sku: "lines.skuCode",
  product: "lines.productName",
  requested: "lines.requested",
  cancelled: "lines.cancelled",
  reservedRemaining: "lines.reserved",
  alreadyShipped: "lines.shipped",
  unshipped: "lines.remaining",
  received: "lines.received",
  transit: "lines.transit",
  thisDocumentQuantity: "documentQuantities.lines.quantity",
} as const;
const exactKeys = (v: Record<string, unknown>, keys: string[]) =>
  Object.keys(v).sort().join() === keys.sort().join();
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
export function validTemplateManifest(v: unknown): boolean {
  if (
    !object(v) ||
    !exactKeys(v, [
      "schemaVersion",
      "format",
      "kind",
      "defaultLocale",
      "locales",
      "layout",
      "style",
      "fields",
    ]) ||
    v.schemaVersion !== 1 ||
    !["xlsx", "pdf"].includes(v.format as string) ||
    !["instruction", "manifest"].includes(v.kind as string) ||
    v.defaultLocale !== "ja" ||
    !Array.isArray(v.locales) ||
    [...v.locales].sort().join() !== "en,ja,ko" ||
    !object(v.layout) ||
    !exactKeys(v.layout, ["paper", "orientation", "marginMm"]) ||
    v.layout.paper !== "A4" ||
    !["portrait", "landscape"].includes(v.layout.orientation as string) ||
    ![12, 16, 20].includes(v.layout.marginMm as number) ||
    !object(v.style) ||
    !exactKeys(v.style, ["font", "sizePt", "accent"]) ||
    v.style.font !== "noto-cjk" ||
    ![10, 11, 12].includes(v.style.sizePt as number) ||
    !["slate", "navy"].includes(v.style.accent as string) ||
    !Array.isArray(v.fields) ||
    v.fields.length !== Object.keys(documentFieldSources).length
  )
    return false;
  const seen = new Set<string>();
  for (const f of v.fields) {
    if (
      !object(f) ||
      !exactKeys(f, ["field", "source"]) ||
      typeof f.field !== "string" ||
      seen.has(f.field) ||
      !Object.hasOwn(documentFieldSources, f.field) ||
      f.source !==
        documentFieldSources[f.field as keyof typeof documentFieldSources]
    )
      return false;
    seen.add(f.field as string);
  }
  return true;
}
/** All arithmetic is bigint; serialized values are canonical nonnegative decimal strings. */
export function documentQuantityPlan(
  kind: "instruction" | "manifest",
  state: string,
  lines: readonly { id: string; remaining: string; reserved: string }[],
  sources: readonly {
    lineId: string;
    shipmentLineId: string | null;
    quantity: string;
  }[],
  selection: {
    lines?: readonly { lineId: string; quantity: string }[];
    shipmentLineIds?: readonly string[];
  } = {},
) {
  const invalid = () => {
    throw new Error("INVALID_DOCUMENT_QUANTITY");
  };
  if (
    !object(selection) ||
    Object.keys(selection).some(
      (k) => !["lines", "shipmentLineIds"].includes(k),
    )
  )
    invalid();
  if (
    selection.lines !== undefined &&
    (!Array.isArray(selection.lines) || kind !== "instruction")
  )
    invalid();
  if (
    selection.shipmentLineIds !== undefined &&
    (!Array.isArray(selection.shipmentLineIds) || kind !== "manifest")
  )
    invalid();
  const ids =
    selection.shipmentLineIds ??
    sources.flatMap((s) => (s.shipmentLineId ? [s.shipmentLineId] : []));
  if (
    new Set(ids).size !== ids.length ||
    ids.some((id) => !sources.some((s) => s.shipmentLineId === id))
  )
    invalid();
  const chosen = new Map<string, string>();
  for (const l of selection.lines ?? []) {
    if (
      !object(l) ||
      !exactKeys(l, ["lineId", "quantity"]) ||
      typeof l.quantity !== "string" ||
      !/^(0|[1-9][0-9]{0,18})$/.test(l.quantity) ||
      typeof l.lineId !== "string" ||
      chosen.has(l.lineId) ||
      !lines.some((x) => x.id === l.lineId)
    )
      invalid();
    chosen.set(l.lineId as string, l.quantity as string);
  }
  const result = lines.map((l) => {
    const remaining = BigInt(l.remaining),
      reserved = BigInt(l.reserved);
    const max = remaining < reserved ? remaining : reserved;
    const q =
      kind === "instruction"
        ? selection.lines
          ? BigInt(chosen.get(l.id) ?? "0")
          : max
        : sources
            .filter(
              (s) =>
                s.lineId === l.id &&
                s.shipmentLineId &&
                ids.includes(s.shipmentLineId),
            )
            .reduce((n, s) => n + BigInt(s.quantity), 0n);
    if (
      q < 0n ||
      (kind === "instruction" &&
        (q > max ||
          (q > 0n && !["reserved", "partially_shipped"].includes(state))))
    )
      invalid();
    return { lineId: l.id, quantity: q.toString() };
  });
  if (!result.some((l) => BigInt(l.quantity) > 0n)) invalid();
  return {
    purpose: kind,
    shipmentLineIds: kind === "manifest" ? [...ids].sort() : [],
    lines: result,
  };
}
