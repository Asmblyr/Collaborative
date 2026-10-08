import assert from "node:assert/strict";
import test from "node:test";
import { ApiError, createClient } from "../dist/index.js";

test("list serializes HTTP query options once and preserves the API envelope", async () => {
  const filter = {
    logic: "and",
    children: [{ field: "author.name", op: "eq", value: "Анна & 20%" }],
  };
  const result = {
    data: [{ id: 1, title: "Hello" }],
    labels: { 1: "Hello" },
    page: {
      number: 2,
      size: 20,
      total: "9007199254740993",
      sort: "title",
      direction: "desc",
    },
  };
  const client = createClient({
    baseUrl: "https://example.test/api/",
    accessToken: "test-token",
    fetch: async (input, init) => {
      const url = new URL(input);
      assert.equal(url.pathname, "/api/items/articles");
      assert.deepEqual(Object.fromEntries(url.searchParams), {
        fields: "id,title",
        page: "2",
        limit: "20",
        sort: "title",
        direction: "desc",
        q: "a+b & 20%",
        filter: JSON.stringify(filter),
      });
      assert.equal(init.method, "GET");
      assert.equal(init.headers.get("authorization"), "Bearer test-token");
      assert.equal(init.cache, "no-store");
      assert.equal(init.redirect, "error");
      assert.equal(init.body, undefined);
      return Response.json(result);
    },
  });
  assert.deepEqual(
    await client.items.list("articles", {
      fields: ["id", "title"],
      page: 2,
      limit: 20,
      sort: "title",
      direction: "desc",
      q: "a+b & 20%",
      filter,
    }),
    result,
  );
});

test("get encodes manual keys and preserves bigint strings; empty fields are explicit", async () => {
  const calls = [];
  const client = createClient({
    baseUrl: "/api",
    fetch: async (url, init) => {
      calls.push(url);
      assert.equal(init.credentials, "same-origin");
      assert.equal(init.headers.has("authorization"), false);
      return Response.json({ data: {}, label: "Example" });
    },
  });
  await client.items.get("shops", "shop / 20%?#", { fields: [] });
  await client.items.get("shops", "9223372036854775806");
  await client.items.list("shops", { fields: [] });
  assert.deepEqual(calls, [
    "/api/items/shops/shop%20%2F%2020%25%3F%23?fields=",
    "/api/items/shops/9223372036854775806",
    "/api/items/shops?fields=",
  ]);
});

test("token providers refresh per request and headers never bleed between clients", async () => {
  let token = "first";
  const calls = [];
  const fetch = async (url, init) => {
    calls.push([
      url,
      init.headers.get("authorization"),
      init.headers.get("x-client"),
    ]);
    return Response.json({ data: { id: "user" } });
  };
  const headers = new Headers({ "x-client": "sdk" });
  const one = createClient({
    baseUrl: "/api",
    accessToken: async () => token,
    fetch,
    headers,
  });
  const two = createClient({ baseUrl: "http://localhost:3001", fetch });
  headers.set("x-client", "changed");
  assert.deepEqual(await one.users.me(), { data: { id: "user" } });
  token = "second";
  await Promise.all([one.users.me(), two.users.me()]);
  assert.ok(
    calls.some((call) => call[1] === "Bearer first" && call[2] === "sdk"),
  );
  assert.ok(
    calls.some((call) => call[1] === "Bearer second" && call[2] === "sdk"),
  );
  assert.ok(
    calls.some(
      (call) =>
        call[0] === "http://localhost:3001/users/me" && call[1] === null,
    ),
  );
});

test("API failures retain status, code and requestId without retries", async () => {
  for (const status of [400, 401, 403, 404, 429, 500]) {
    let calls = 0;
    const client = createClient({
      baseUrl: "/api",
      fetch: async () => {
        calls++;
        return Response.json(
          {
            code: "TEST_ERROR",
            message: "Denied",
            details: { field: "title" },
            requestId: "request-1",
          },
          { status },
        );
      },
    });
    await assert.rejects(client.users.me(), (error) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.status, status);
      assert.equal(error.code, "TEST_ERROR");
      assert.equal(error.requestId, "request-1");
      assert.equal(error.message, "Denied");
      assert.deepEqual(error.details, { field: "title" });
      return true;
    });
    assert.equal(calls, 1);
  }
  const proxy = createClient({
    baseUrl: "/api",
    fetch: async () =>
      new Response("<html>upstream unavailable</html>", { status: 502 }),
  });
  await assert.rejects(proxy.users.me(), { name: "ApiError", status: 502 });
  const broken = createClient({
    baseUrl: "/api",
    fetch: async () => new Response("not JSON"),
  });
  await assert.rejects(broken.users.me(), {
    name: "ApiError",
    code: "INVALID_RESPONSE",
  });
});

test("invalid IDs cannot change endpoint paths or lose numeric precision", async () => {
  let calls = 0;
  const client = createClient({
    baseUrl: "/api",
    fetch: async () => {
      calls++;
      return Response.json({});
    },
  });
  for (const id of [
    undefined,
    null,
    {},
    "",
    ".",
    "..",
    NaN,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
  ]) {
    await assert.rejects(client.items.get("articles", id), TypeError);
  }
  for (const collection of ["../users", "articles/1", "//other.test", "a?b"]) {
    await assert.rejects(client.items.list(collection), TypeError);
  }
  await assert.rejects(
    client.items.list("articles", { fields: ["id,secret"] }),
    TypeError,
  );
  assert.equal(calls, 0);
  for (const baseUrl of [
    "//other.test",
    "file:///tmp",
    "https://user:password@a.test",
    "https://a.test?token=x",
    "https://a.test/#fragment",
  ]) {
    assert.throws(() => createClient({ baseUrl }), TypeError);
  }
});

test("a broken response stream keeps its network error", async () => {
  const failure = new TypeError("Connection closed while reading response");
  const client = createClient({
    baseUrl: "/api",
    fetch: async () =>
      new Response(
        new ReadableStream({
          start(stream) {
            stream.error(failure);
          },
        }),
      ),
  });
  await assert.rejects(client.users.me(), (error) => error === failure);
});
