import { randomUUID } from "node:crypto";
import { authFixture } from "./auth-helper";
export async function catalogFixture() {
  const f = await authFixture();
  await f.login();
  async function create(path: string, body: unknown, key = randomUUID()) {
    const r = await f.request(path, body, "POST", { "idempotency-key": key });
    if (r.statusCode !== 200)
      throw new Error("CATALOG_SETUP_" + r.statusCode + "_" + path);
    return r.json();
  }
  const product = await create("products", { name_ja: "合成商品" });
  const warehouse = await create("warehouses", {
    code: "SYNTHETIC-A",
    name: "合成倉庫A",
    type: "internal",
  });
  return { ...f, create, product, warehouse };
}
