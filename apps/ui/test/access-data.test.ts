import assert from "node:assert/strict";
import test from "node:test";
import { loadAccessData, loadResource } from "../src/lib/access-data";
import { HttpError } from "../src/lib/http-request";

test("access loaders preserve a permission denial instead of reporting Core unavailable", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    Response.json(
      { message: "Forbidden", code: "FORBIDDEN", requestId: "access-denied" },
      { status: 403 },
    ),
  );
  await assert.rejects(loadResource("/users", "test-placeholder"), (error) => {
    assert.ok(error instanceof HttpError);
    assert.equal(error.status, 403);
    assert.equal(error.code, "FORBIDDEN");
    assert.equal(error.requestId, "access-denied");
    return true;
  });
  const result = await loadAccessData("test-placeholder", "users");
  assert.equal(result.error, "Нет доступа к этому действию или записи.");
  assert.deepEqual(result.data, { users: [], policies: [], permissions: [] });
});

test("server outages and failed connections are distinguished from denied permissions", async (t) => {
  const fetch = t.mock.method(
    globalThis,
    "fetch",
    async () => new Response("Unavailable", { status: 503 }),
  );
  assert.equal(
    (await loadAccessData("test-placeholder")).error,
    "Сервис временно недоступен. Попробуйте позже.",
  );
  fetch.mock.mockImplementation(async () => {
    throw new TypeError("fetch failed");
  });
  assert.equal(
    (await loadAccessData("test-placeholder")).error,
    "Не удалось связаться с сервером",
  );
});

test("user management uses the scoped policy options rather than loading policy definitions or permissions", async (t) => {
  const paths: string[] = [];
  t.mock.method(globalThis, "fetch", async (input: URL, init: RequestInit) => {
    paths.push(input.pathname);
    assert.equal(
      new Headers(init.headers).get("authorization"),
      "Bearer test-placeholder",
    );
    return Response.json({
      data: input.pathname === "/users" ? [{ id: "u" }] : [{ id: "p" }],
    });
  });
  const result = await loadAccessData("test-placeholder", "users");
  assert.equal(result.error, "");
  assert.deepEqual(paths.sort(), ["/settings/options/policies", "/users"]);
  assert.deepEqual(result.data, {
    users: [{ id: "u" }],
    policies: [{ id: "p" }],
    permissions: [],
  });
});
