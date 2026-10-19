import type { SampleTemplateDefinition, DocumentKind } from "@wms/contracts";
/** Data-only defaults. Explicit authorized registration required; no startup side effect. */
export const sampleTemplates: Record<DocumentKind, SampleTemplateDefinition> = {
  instruction: {
    renderer: "sample-grid-v1",
    title: {
      ja: "サンプル出荷指示書",
      ko: "샘플 출고 지시서",
      en: "Sample shipping instruction",
    },
    footer: {
      ja: "サンプル・送信禁止。作成は出荷の証拠ではありません。",
      ko: "샘플·발송 금지. 문서 생성은 출고 증거가 아닙니다.",
      en: "SAMPLE — DO NOT SEND. Generation is not shipping evidence.",
    },
    watermark: "SAMPLE / サンプル / 샘플",
    columns: [
      "sku",
      "product",
      "requested",
      "remaining",
      "reserved",
      "shipped",
      "received",
      "transit",
    ],
  },
  manifest: {
    renderer: "sample-grid-v1",
    title: {
      ja: "サンプル出荷明細書",
      ko: "샘플 출고 명세서",
      en: "Sample shipment manifest",
    },
    footer: {
      ja: "サンプル・送信禁止。実際の出荷数量は確認済み証拠によります。",
      ko: "샘플·발송 금지. 실제 출고 수량은 확인된 증거를 따릅니다.",
      en: "SAMPLE — DO NOT SEND. Shipment totals require confirmed evidence.",
    },
    watermark: "SAMPLE / サンプル / 샘플",
    columns: [
      "sku",
      "product",
      "requested",
      "shipped",
      "received",
      "remaining",
      "reserved",
      "transit",
    ],
  },
};
