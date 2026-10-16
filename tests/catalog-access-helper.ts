import { randomUUID } from "node:crypto";
import { totpCode } from "../apps/api/src/auth/crypto";
import type { catalogFixture } from "./catalog-helper";
export async function catalogUser(
  f: Awaited<ReturnType<typeof catalogFixture>>,
  roles: string[] = [],
  warehouse?: string,
) {
  const response = await f.request("users", {
    login: "catalog-" + randomUUID(),
    password: f.password,
    displayName: "Synthetic catalog user",
    locale: "ja",
  });
  if (response.statusCode !== 200) throw new Error("USER_SETUP");
  const id = response.json().id;
  if (warehouse) {
    const grant = await f.request(
      "users/" + id + "/warehouse-roles",
      { warehouse_id: warehouse, roles },
      "PUT",
    );
    if (grant.statusCode !== 200)
      throw new Error("GRANT_SETUP_" + grant.statusCode);
  } else await f.request("users/" + id + "/roles", { roles }, "PUT");
  const limited = await f.service.tx((c) => f.service.issue(c, id));
  const initial = {
    token: limited.token,
    csrf: limited.csrf,
    origin: f.origin,
    ip: "synthetic",
    requestId: "synthetic-enrollment",
  };
  const enrollment = await f.service.enroll(initial);
  const verified = await f.service.confirm(
    initial,
    totpCode(enrollment.secret),
  );
  const ctx = {
    ...initial,
    token: verified.issued.token,
    csrf: verified.issued.csrf,
  };
  const request = (
    path: string,
    body?: unknown,
    method = "POST",
    extra: Record<string, string> = {},
  ) =>
    f.app.inject({
      url: "/api/v1/" + path,
      method: body === undefined ? "GET" : (method as "POST"),
      headers: {
        cookie: "wms_session=" + ctx.token,
        origin: f.origin,
        "x-csrf-token": ctx.csrf,
        ...extra,
      },
      ...(body === undefined ? {} : { payload: body as object }),
    });
  return { id, ctx, request };
}
