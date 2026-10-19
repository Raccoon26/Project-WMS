import { it, expect, vi } from "vitest";
import type { PoolClient } from "pg";
import { PostgresSnapshotBuilder } from "../../apps/api/src/documents/snapshot";
import { sampleTemplates } from "../../apps/api/src/documents/templates";
it.each([0, 5000, 5001])(
  "SnapshotBuilder bounds source-history materialization at %i rows (resource budget, not a SKU cap)",
  async (n) => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            id: "outbound",
            version: "1",
            business_ref: "synthetic",
            state: "draft",
            source_warehouse_id: "source",
            destination_warehouse_id: "destination",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          { id: "source", code: "A", name: "合成倉庫", type: "internal" },
          { id: "destination", code: "B", name: "Synthetic", type: "internal" },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: Array.from({ length: n }, () => ({})) })
      .mockResolvedValueOnce({
        rows: [{ time: "2026-10-19T00:00:00.000000Z" }],
      });
    const result = new PostgresSnapshotBuilder().build(
      { query } as unknown as PoolClient,
      {
        documentId: "synthetic",
        actorId: "synthetic",
        outboundId: "outbound",
        outboundVersion: "1",
        locale: "ja",
        template: {
          templateId: "template",
          version: 1,
          kind: "instruction",
          sha256: "0".repeat(64),
          sample: true,
          definition: sampleTemplates.instruction,
        },
      },
    );
    if (n > 5000) await expect(result).rejects.toMatchObject({ status: 413 });
    else expect((await result).sources).toHaveLength(n);
    expect(query.mock.calls[3]![0]).toContain("LIMIT 5001");
    // A unit-level dependency double verifies bounded reading only; it is not a real 5000-row DB/file acceptance test.
  },
);
