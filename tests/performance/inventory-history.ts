/** Opt-in large-history profile, never selected by the required correctness suites. */
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { cpus, totalmem, platform, release } from "node:os";
import { createDatabase, testDatabaseUrl, schemaName } from "@wms/db";
import { inventoryFixture } from "../inventory-helper.js";
import {
  InventoryService,
  inventoryHash,
} from "../../apps/api/src/inventory/service.js";
const count = Number(process.argv[process.argv.indexOf("--entries") + 1]);
if (!Number.isInteger(count) || count < 2 || count > 1000000 || count % 2 !== 0)
  throw new Error("EXPLICIT_EVEN_ENTRIES_2_TO_1000000_REQUIRED");
const f = await inventoryFixture();
const load = createDatabase(testDatabaseUrl(process.env.TEST_DATABASE_URL), {
  schema: schemaName(f.schema),
  timeoutMs: 600000,
  max: 1,
});
try {
  if (
    !f.schema.startsWith("wms_test_") ||
    (await load.pool.query("SELECT current_schema() AS name")).rows[0].name !==
      f.schema
  )
    throw new Error("ISOLATED_SYNTHETIC_SCHEMA_REQUIRED");
  await f.opening(String(count / 2 + 100));
  const service = new InventoryService(f.service, f.key);
  const c = await load.pool.connect();
  const started = performance.now();
  try {
    await c.query("BEGIN");
    const from = await service.account(c, f.sku.id, f.warehouse.id, "good"),
      to = await service.account(c, f.sku.id, f.warehouse.id, "quarantine");
    await service.accounts(c, [from, to]);
    await c.query("COMMIT");
    await c.query(
      "CREATE TEMP TABLE inventory_history_source(tid uuid,eid uuid) ON COMMIT DELETE ROWS",
    );
    for (let done = 0; done < count / 2; done += 1000) {
      const batch = randomUUID(),
        transactions = Math.min(1000, count / 2 - done);
      await c.query("BEGIN");
      await service.accounts(c, [from, to]);
      await c.query(
        "INSERT INTO inventory_history_source SELECT gen_random_uuid(),gen_random_uuid() FROM generate_series(1,$1)",
        [transactions],
      );
      await c.query(
        "INSERT INTO inventory_evidence(id,source,source_event_id,operation,scope,sku_id,quantity,reference,trust,actor_id,payload_hash,occurred_at) SELECT eid,'synthetic',tid::text,'reclassify',$1,$2,1,tid::text,'synthetic_test',$3,encode(sha256(convert_to(tid::text,'UTF8')),'hex'),now() FROM inventory_history_source",
        [f.warehouse.id, f.sku.id, f.bootstrap.id],
      );
      await c.query(
        "INSERT INTO inventory_transactions(id,movement_type,reason,reference_type,reference_id,actor_id,source_system,source_event_id,scope,idempotency_key,payload_hash,evidence_id,request_id,occurred_at) SELECT tid,'reclassify','Synthetic isolated history profile','synthetic_batch',$1::uuid,$2,'synthetic',tid::text,$3,tid::text,encode(sha256(convert_to(tid::text,'UTF8')),'hex'),eid,($1::uuid)::text,now() FROM inventory_history_source",
        [batch, f.bootstrap.id, f.warehouse.id],
      );
      await c.query(
        "INSERT INTO inventory_entries(id,transaction_id,sku_id,account_id,quantity,line_no,recorded_at) SELECT gen_random_uuid(),src.tid,$1,CASE WHEN line=1 THEN $2::uuid ELSE $3::uuid END,CASE WHEN line=1 THEN -1 ELSE 1 END,line,transaction_timestamp() FROM inventory_history_source src CROSS JOIN generate_series(1,2) AS line",
        [f.sku.id, from, to],
      );
      const result = {
        id: batch,
        synthetic: true,
        additionalEntries: transactions * 2,
      };
      await service.event(
        c,
        { ip: "synthetic", requestId: batch },
        { user_id: f.bootstrap.id } as Parameters<typeof service.event>[2],
        batch,
        "synthetic-history-batch",
        result,
      );
      await c.query(
        "INSERT INTO command_results(actor_id,key,operation,payload_hash,result) VALUES($1,$2,$3,$4,$5)",
        [
          f.bootstrap.id,
          batch,
          "inventory.synthetic-history-batch",
          inventoryHash(result),
          JSON.stringify(result),
        ],
      );
      await c.query("COMMIT");
      if ((done + transactions) % 10000 === 0)
        console.log(
          JSON.stringify({
            seededEntries: (done + transactions) * 2,
            elapsedMs: performance.now() - started,
          }),
        );
    }
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
  const seedMs = performance.now() - started;
  await load.pool.query("ANALYZE inventory_entries");
  await load.pool.query("ANALYZE inventory_transactions");
  const invalid = (
    await load.pool.query(
      "SELECT a.id FROM inventory_accounts a JOIN inventory_balances b ON b.account_id=a.id WHERE b.quantity<>(SELECT coalesce(sum(quantity),0) FROM inventory_entries e WHERE e.account_id=a.id) OR b.reserved<>(SELECT coalesce(sum(quantity-consumed-released),0) FROM reservations r WHERE r.account_id=a.id)",
    )
  ).rowCount;
  const unbalanced = (
    await load.pool.query(
      "SELECT transaction_id FROM inventory_entries GROUP BY transaction_id,sku_id HAVING sum(quantity)<>0",
    )
  ).rowCount;
  if (invalid || unbalanced) throw new Error("INVENTORY_INVARIANTS_FAILED");
  // Trace the actual unmodified Fastify/PG query, not a simplified substitute.
  let requestSql = "",
    requestValues: unknown[] = [];
  const clients = await Promise.all(
    Array.from({ length: 5 }, () => f.db.pool.connect()),
  );
  const originalQueries = clients.map((client) => ({
    client,
    query: client.query,
  }));
  for (const { client, query } of originalQueries) {
    client.query = new Proxy(query, {
      apply(fn, receiver, args) {
        if (
          typeof args[0] === "string" &&
          args[0].startsWith("SELECT result.*") &&
          args[0].includes("inventory_transactions")
        ) {
          requestSql = args[0];
          requestValues = Array.isArray(args[1]) ? [...args[1]] : [];
        }
        return Reflect.apply(fn, receiver, args);
      },
    });
    client.release();
  }
  const times: number[] = [];
  for (let i = 0; i < 20; i++) {
    const at = performance.now();
    const r = await f.request(
      "inventory/transactions?limit=100&sku_id=" + f.sku.id,
    );
    if (r.statusCode !== 200 || r.json().items.length !== 100)
      throw new Error("BOUNDED_API_PAGE_FAILED");
    times.push(performance.now() - at);
  }
  for (const { client, query } of originalQueries) client.query = query;
  if (!requestSql) throw new Error("ACTUAL_API_QUERY_NOT_CAPTURED");
  const apiPlan = (
    await load.pool.query(
      "EXPLAIN(ANALYZE,BUFFERS,FORMAT JSON) " + requestSql,
      requestValues,
    )
  ).rows;
  const plan = (
    await load.pool.query(
      "EXPLAIN(ANALYZE,BUFFERS,FORMAT JSON) SELECT * FROM inventory_entries WHERE sku_id=$1 ORDER BY recorded_at,id LIMIT 100",
      [f.sku.id],
    )
  ).rows;
  const size = (
    await load.pool.query(
      "SELECT sum(pg_total_relation_size(c.oid))::text AS bytes FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relkind IN ('r','m')",
      [f.schema],
    )
  ).rows[0].bytes;
  times.sort((a, b) => a - b);
  const report = {
    synthetic: true,
    additionalEntries: count,
    actualEntries: (
      await load.pool.query("SELECT count(*) FROM inventory_entries")
    ).rows[0].count,
    seedMs,
    entryThroughput: count / (seedMs / 1000),
    apiSamples: 20,
    concurrency: 1,
    p50: times[10],
    p95: times[18],
    processRss: process.memoryUsage().rss,
    scopeRelationBytes: size,
    node: process.version,
    postgres: (await load.pool.query("SHOW server_version")).rows[0]
      .server_version,
    os: platform() + " " + release(),
    cpu: cpus()[0]?.model,
    ram: totalmem(),
    plan,
    apiPlan,
    apiQueryHash: inventoryHash(requestSql),
    transport: "Fastify inject / real PostgreSQL, no TCP latency",
    batchTransactions: 1000,
    invalidBalances: invalid,
    unbalancedTransactions: unbalanced,
    failedRequests: 0,
  };
  mkdirSync("test-results", { recursive: true });
  writeFileSync(
    "test-results/inventory-history-" + count + ".json",
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify({
      entries: report.actualEntries,
      seedMs,
      p50: report.p50,
      p95: report.p95,
      invalidBalances: invalid,
      unbalancedTransactions: unbalanced,
    }),
  );
} finally {
  await load.close();
  await f.cleanup();
}
