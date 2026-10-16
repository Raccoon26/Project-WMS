import { randomUUID } from "node:crypto";
import { createDatabase, testDatabaseUrl } from "@wms/db";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { createServer } from "node:net";
export function testUrl() {
  return testDatabaseUrl(process.env.TEST_DATABASE_URL);
}
export async function scopedDatabase(timeoutMs = 500) {
  const url = testUrl();
  const admin = createDatabase(url);
  const schema = "wms_test_" + randomUUID().replaceAll("-", "");
  await admin.pool.query(`CREATE SCHEMA ${schema}`);
  const db = createDatabase(url, { schema, timeoutMs });
  return {
    db,
    schema,
    async cleanup() {
      await db.close();
      try {
        await admin.pool.query(`DROP SCHEMA ${schema} CASCADE`);
      } finally {
        await admin.close();
      }
    },
  };
}
export async function until(fn: () => Promise<boolean>, timeout = 20000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await fn()) return;
    await delay(50);
  }
  throw new Error("CONDITION_TIMEOUT");
}
export async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("NO_PORT");
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return address.port;
}
export function child(entry: string, env: NodeJS.ProcessEnv) {
  const p = spawn(
    process.execPath,
    ["--conditions=source", "--import", "tsx", entry],
    { env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] },
  );
  let output = "";
  p.stdout.on("data", (d) => {
    output += String(d);
  });
  p.stderr.on("data", (d) => {
    output += String(d);
  });
  let exited = false;
  const exit = new Promise<{
    code: number | null;
    signal: NodeJS.Signals | null;
  }>((resolve) =>
    p.on("exit", (code, signal) => {
      exited = true;
      resolve({ code, signal });
    }),
  );
  return {
    process: p,
    exit,
    get output() {
      return output;
    },
    async started() {
      await until(async () => {
        if (exited) throw new Error("CHILD_STARTUP_FAILED");
        return output.includes('"event":"started"');
      });
    },
    async stop(signal: NodeJS.Signals = "SIGTERM") {
      if (!exited) p.kill(signal);
      let timer: NodeJS.Timeout | undefined;
      try {
        return await Promise.race([
          exit,
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              if (!exited) p.kill("SIGKILL");
              reject(new Error("CHILD_EXIT_TIMEOUT"));
            }, 12000);
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    },
    dispose() {
      if (!exited) p.kill("SIGKILL");
    },
  };
}
