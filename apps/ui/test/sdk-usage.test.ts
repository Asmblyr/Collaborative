import assert from "node:assert/strict";
import test from "node:test";
import { readEditorItem } from "../src/lib/item-read";
import { loadSessionUser } from "../src/lib/session";
import { asmblyr } from "../src/lib/asmblyr";

test("the record editor reads through SDK; relation link attributes keep their own endpoint", async (t) => {
  const calls: string[] = [];
  t.mock.method(
    globalThis,
    "fetch",
    async (url: string, options: RequestInit) => {
      calls.push(String(url));
      assert.equal(options.method, "GET");
      return Response.json({
        data: { id: "key", title: "Example" },
        label: "Example",
      });
    },
  );
  assert.equal((await readEditorItem("shops", "shop / 20%")).label, "Example");
  await readEditorItem(
    "junction",
    "key",
    undefined,
    "/api/items/shops/1/relations/tags/links/key",
  );
  await asmblyr.items.list("shops", { fields: ["id"], limit: 20 });
  assert.deepEqual(calls, [
    "/api/items/shops/shop%20%2F%2020%25",
    "/api/items/shops/1/relations/tags/links/key",
    "/api/items/shops?fields=id&limit=20",
  ]);
});

test("the editor preserves useful errors and passes cancellation through SDK", async (t) => {
  let status = 403;
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ message: "API error" }, { status }),
  );
  await assert.rejects(readEditorItem("shops", "1"), /нет доступа/);
  status = 404;
  await assert.rejects(readEditorItem("shops", "1"), /не найдена/);
  status = 400;
  await assert.rejects(readEditorItem("shops", "1"), /Некорректный адрес/);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(readEditorItem("shops", "1", controller.signal), {
    name: "AbortError",
  });
});

test("session loading uses users.me with a request-local token and preserves 401 renewal behavior", async (t) => {
  const user = {
    id: "user",
    email: "user@example.test",
    superuser: false,
    displayName: null,
    pictureUrl: null,
    hasPassword: true,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
  let status = 200;
  t.mock.method(
    globalThis,
    "fetch",
    async (url: string, options: RequestInit) => {
      assert.equal(new URL(url).pathname, "/users/me");
      assert.equal(
        new Headers(options.headers).get("authorization"),
        "Bearer test-session",
      );
      assert.equal(options.cache, "no-store");
      return Response.json({ data: user }, { status });
    },
  );
  assert.deepEqual(await loadSessionUser("test-session"), user);
  status = 401;
  assert.equal(await loadSessionUser("test-session"), null);
  status = 503;
  await assert.rejects(loadSessionUser("test-session"), /Core API недоступен/);
});
