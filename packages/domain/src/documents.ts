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
      "columns,footer,renderer,title,watermark" ||
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
