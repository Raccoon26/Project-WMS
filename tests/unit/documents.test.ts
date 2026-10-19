import { it, expect } from "vitest";
import { validTemplateDefinition, documentDispatchBlock } from "@wms/domain";
import { sampleTemplates } from "../../apps/api/src/documents/templates";
import { documentHash } from "../../apps/api/src/documents/service";
it("sample template definitions contain ja/ko/en plain data and a non-removable sample watermark", () => {
  for (const d of Object.values(sampleTemplates)) {
    expect(validTemplateDefinition(d)).toBe(true);
    expect(d.title.ja).toContain("サンプル");
    expect(d.footer.en).toContain("DO NOT SEND");
  }
});
it.each([
  null,
  {},
  [],
  { ...sampleTemplates.instruction, watermark: "APPROVED" },
  { ...sampleTemplates.instruction, renderer: "eval" },
  { ...sampleTemplates.instruction, script: "alert(1)" },
  { ...sampleTemplates.instruction, columns: ["sku", "sku"] },
  { ...sampleTemplates.instruction, columns: ["unknown"] },
  { ...sampleTemplates.instruction, title: { ja: "日本語" } },
  {
    ...sampleTemplates.instruction,
    title: { ja: "x".repeat(201), ko: "x", en: "x" },
  },
  { ...sampleTemplates.instruction, footer: { ja: "", ko: "x", en: "x" } },
])("invalid or executable template definition is rejected: %#", (value) =>
  expect(validTemplateDefinition(value)).toBe(false),
);
it.each([0, 31, 127, 0x202e, 0x2066, 0xd800])(
  "control/bidi/lone-surrogate template text is rejected: %i",
  (n) =>
    expect(
      validTemplateDefinition({
        ...sampleTemplates.instruction,
        title: { ja: String.fromCharCode(n), ko: "한국어", en: "English" },
      }),
    ).toBe(false),
);
it("snapshot SHA-256 is deterministic for key order, Unicode and exact bigint decimal strings", () => {
  expect(documentHash({ b: "9223372036854775807", a: "日本語 한국어" })).toBe(
    documentHash({ a: "日本語 한국어", b: "9223372036854775807" }),
  );
  expect(documentHash({ quantity: "9007199254740993" })).not.toBe(
    documentHash({ quantity: "9007199254740992" }),
  );
});
it("a sample reference is never dispatch authorization, even ready/current", () => {
  expect(documentDispatchBlock(true, true, true)).toBe("SAMPLE_DOCUMENT");
  expect(documentDispatchBlock(false, false, true)).toBe("DOCUMENT_NOT_READY");
  expect(documentDispatchBlock(false, true, false)).toBe("STALE_DOCUMENT");
  expect(documentDispatchBlock(false, true, true)).toBe(
    "APPROVAL_AND_VERIFIED_DELIVERY_REQUIRED",
  );
});
