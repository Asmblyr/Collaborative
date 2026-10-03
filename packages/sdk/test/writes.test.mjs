import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "../dist/index.js";

test("mutations preserve JSON, use the API methods and handle empty delete responses", async () => {
  const calls = [];
  const client = createClient({
    baseUrl: "/api",
    accessToken: "test-token",
    fetch: async (url, init) => {
      assert.equal(init.headers.get("authorization"), "Bearer test-token");
      assert.equal(init.redirect, "error");
      calls.push([url, init.method, init.body]);
      if (init.method === "DELETE") {
        assert.equal(init.body, undefined);
        return new Response(null, { status: 204 });
      }
      assert.equal(init.headers.get("content-type"), "application/json");
      return Response.json({ data: null });
    },
  });
  const values = {
    title: "Привет & 20%",
    meta: { tags: [1, "a"], optional: null },
    enabled: false,
  };
  assert.deepEqual(await client.items.create("articles", values), {
    data: null,
  });
  await client.items.update("articles", "a /?#", { title: null });
  assert.equal(
    await client.items.delete("articles", "9223372036854775806"),
    undefined,
  );
  assert.deepEqual(calls, [
    ["/api/items/articles", "POST", JSON.stringify(values)],
    ["/api/items/articles/a%20%2F%3F%23", "PATCH", '{"title":null}'],
    ["/api/items/articles/9223372036854775806", "DELETE", undefined],
  ]);
});

test("a draft is sent as one commit with all related changes", async () => {
  let calls = 0;
  const draft = {
    id: "1",
    values: { title: "Parent" },
    references: { category_id: { values: { title: "Category" } } },
    relations: {
      tags: {
        attach: [{ id: "3", record: { values: { note: "Link" } } }],
        detach: ["4"],
      },
    },
  };
  const client = createClient({
    baseUrl: "/api",
    timeoutMs: 1,
    fetch: async (url, init) => {
      calls++;
      assert.equal(url, "/api/items/articles/commit");
      assert.equal(init.signal, undefined); // Per-call override, used for long editor commits.
      assert.equal(init.method, "POST");
      assert.deepEqual(JSON.parse(init.body), draft);
      return Response.json({ data: { id: "1" } });
    },
  });
  assert.deepEqual(
    await client.items.commit("articles", draft, { timeoutMs: 0 }),
    {
      data: { id: "1" },
    },
  );
  assert.equal(calls, 1);
});

test("failed or uncertain writes are never retried", async () => {
  for (const outcome of [401, 403, 409, 500, "network", "invalid-response"]) {
    let calls = 0;
    const client = createClient({
      baseUrl: "/api",
      fetch: async () => {
        calls++;
        if (outcome === "network") throw new TypeError("Connection lost");
        if (outcome === "invalid-response")
          return new Response("broken JSON", { status: 201 });
        return Response.json(
          {
            message: "Write failed",
            code: "WRITE_ERROR",
            requestId: "request-1",
          },
          { status: outcome },
        );
      },
    });
    await assert.rejects(
      client.items.create("articles", { title: "Once" }),
      (error) => {
        if (typeof outcome === "number") {
          assert.equal(error.status, outcome);
          assert.equal(error.code, "WRITE_ERROR");
        }
        return true;
      },
    );
    assert.equal(calls, 1);
  }
});

test("aborted and unserializable writes do not send HTTP", async () => {
  const client = createClient({
    baseUrl: "/api",
    fetch: () => assert.fail("HTTP sent"),
  });
  const controller = new AbortController();
  controller.abort();
  const request = { signal: controller.signal };
  await assert.rejects(client.items.create("articles", {}, request), {
    name: "AbortError",
  });
  await assert.rejects(client.items.update("articles", 1, {}, request), {
    name: "AbortError",
  });
  await assert.rejects(client.items.delete("articles", 1, request), {
    name: "AbortError",
  });
  const cycle = {};
  cycle.self = cycle;
  await assert.rejects(client.items.create("articles", cycle), TypeError);
  await assert.rejects(
    client.items.create("articles", { large: 3n }),
    TypeError,
  );
  await assert.rejects(
    client.items.create("articles", {}, { timeoutMs: -1 }),
    TypeError,
  );
});
