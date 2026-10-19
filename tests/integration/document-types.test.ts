import { it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import type { SnapshotBuilder } from "@wms/contracts";
import type { PoolClient } from "pg";
import { documentFixture } from "../document-helper";
import { PostgresSnapshotBuilder } from "../../apps/api/src/documents/snapshot";
import { DocumentService } from "../../apps/api/src/documents/service";
it.each([
  "quantity_number",
  "source_quantity_number",
  "sample_string",
  "schema_string",
])(
  "SQL Snapshot types reject forged %s rather than coercing it",
  async (kind) => {
    const f = await documentFixture();
    try {
      let outboundVersion = "1";
      if (kind === "source_quantity_number") {
        const r = await f.command("outbounds/" + f.outbound.id + "/reserve", {
          version: "1",
        });
        expect(r.statusCode).toBe(200);
        outboundVersion = r.json().version;
      }
      const before = await f.stockDigest();
      const builder: SnapshotBuilder<PoolClient> = {
        build: async (c, input) => {
          const s = await new PostgresSnapshotBuilder().build(c, input);
          // Deliberately bypass TypeScript to verify PostgreSQL's own JSON contract.
          if (kind === "quantity_number")
            Object.assign(s.lines[0]!, { requested: 100 });
          if (kind === "source_quantity_number")
            Object.assign(s.sources[0]!, { quantity: 100 });
          if (kind === "sample_string") Object.assign(s, { sample: "true" });
          if (kind === "schema_string")
            Object.assign(s, { schemaVersion: "1" });
          return s;
        },
      };
      await expect(
        new DocumentService(f.service, builder).recordSnapshot(
          f.ctx,
          randomUUID(),
          { ...f.input, outboundVersion },
        ),
      ).rejects.toMatchObject({ code: "23514" });
      expect(
        (await f.db.pool.query("SELECT count(*)::int n FROM documents")).rows[0]
          .n,
      ).toBe(0);
      expect(await f.stockDigest()).toEqual(before);
    } finally {
      await f.cleanup();
    }
  },
);
