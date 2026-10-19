import { it, expect } from "vitest";
import { documentQuantityPlan, validTemplateDefinition } from "@wms/domain";
import { sampleTemplateManifests } from "../../apps/api/src/documents/templates";
import { documentHash } from "../../apps/api/src/documents/service";
const line = { id: "line", remaining: "5", reserved: "5" };
const sources = [{ lineId: "line", shipmentLineId: "ship", quantity: "95" }];
it("four pinned Japanese-default sample manifests cover both formats/kinds and all required fields", () => {
  expect(new Set(sampleTemplateManifests.map((t) => t.code)).size).toBe(4);
  for (const t of sampleTemplateManifests) {
    expect(validTemplateDefinition(t.definition)).toBe(true);
    expect(t.definition.manifest.fields).toHaveLength(13);
    expect(t.definition.manifest.defaultLocale).toBe("ja");
    expect(t.definition.watermark).toContain("SAMPLE");
    expect(documentHash(t.definition)).toMatch(/^[a-f0-9]{64}$/);
  }
});
it.each([
  { schemaVersion: 2 },
  { format: "html" },
  { script: "exec" },
  { defaultLocale: "en" },
  { locales: ["ja", "ja", "en"] },
  { layout: { paper: "A4", orientation: "portrait", marginMm: 0 } },
  { style: { font: "https://remote", sizePt: 10, accent: "slate" } },
  { fields: [] },
  { fields: [{ field: "sku", source: "javascript:alert(1)" }] },
])(
  "rejects executable, unknown, incomplete or non-pinned manifest %#",
  (patch) => {
    const d = structuredClone(sampleTemplateManifests[0]!.definition);
    expect(
      validTemplateDefinition({ ...d, manifest: { ...d.manifest, ...patch } }),
    ).toBe(false);
  },
);
it.each([
  "<script>bad</script>",
  "https://remote/file",
  "javascript:bad",
  "$(shell)",
  "`shell`",
])("rejects template executable/remote text %s", (text) => {
  const d = structuredClone(sampleTemplateManifests[0]!.definition);
  d.title.ja = text;
  expect(validTemplateDefinition(d)).toBe(false);
});
it("remaining instructions select only five, manifest records confirmed95 without implying shipment", () => {
  expect(
    documentQuantityPlan("instruction", "partially_shipped", [line], sources)
      .lines[0]!.quantity,
  ).toBe("5");
  expect(
    documentQuantityPlan("manifest", "partially_shipped", [line], sources)
      .lines[0]!.quantity,
  ).toBe("95");
});
it("quantities above Number.MAX_SAFE_INTEGER remain exact", () => {
  const n = "9007199254740993";
  expect(
    documentQuantityPlan(
      "instruction",
      "reserved",
      [{ ...line, remaining: n, reserved: n }],
      [],
    ).lines[0]!.quantity,
  ).toBe(n);
});
it.each([
  { lines: [{ lineId: "line", quantity: "0" }] },
  { lines: [{ lineId: "line", quantity: "6" }] },
  { lines: [{ lineId: "line", quantity: "-1" }] },
  { lines: [{ lineId: "line", quantity: "01" }] },
  { lines: [{ lineId: "line", quantity: 5 }] },
  { lines: [{ lineId: "other", quantity: "1" }] },
  {
    lines: [
      { lineId: "line", quantity: "1" },
      { lineId: "line", quantity: "1" },
    ],
  },
  { shipmentLineIds: ["ship"] },
  { productName: "forged" },
])(
  "invalid instruction selection %# cannot reissue prior shipments",
  (selection) => {
    expect(() =>
      documentQuantityPlan(
        "instruction",
        "partially_shipped",
        [line],
        sources,
        selection as never,
      ),
    ).toThrow();
  },
);
it.each(["draft", "held", "cancelled", "cancellation_requested", "shipped"])(
  "unsafe state %s cannot produce positive instructions",
  (state) => {
    expect(() =>
      documentQuantityPlan("instruction", state, [line], sources),
    ).toThrow();
  },
);
it("manifest shipment selection rejects foreign or duplicate lines", () => {
  for (const ids of [["foreign"], ["ship", "ship"], []])
    expect(() =>
      documentQuantityPlan("manifest", "shipped", [line], sources, {
        shipmentLineIds: ids,
      }),
    ).toThrow();
});
