import assert from "node:assert/strict";
import test from "node:test";
import { createClient, defineSchema } from "../dist/index.js";

const schema = defineSchema()(
  {
    articles: {
      id: { kind: "scalar", nullable: false },
      title: { kind: "text", nullable: true },
      price: { kind: "ordered", nullable: false },
      status: { kind: "text", nullable: false },
      published: { kind: "scalar", nullable: false },
      created_at: { kind: "ordered", nullable: false },
      data: { kind: "none", nullable: true },
    },
  },
  { Articles: "articles" },
);
function fixture() {
  const calls = [];
  const envelope = {
    data: [{ id: "1", title: "Example" }],
    labels: { 1: "Example" },
    page: { total: "1" },
  };
  const client = createClient({
    baseUrl: "https://example.test/api",
    schema,
    fetch: async (input, init) => {
      calls.push({ url: new URL(input), init });
      return Response.json(envelope);
    },
  });
  return { client, calls, envelope };
}
test("search relevance, explicit field sorting and restored relevance preserve immutable query branches", async () => {
  const { client, calls } = fixture();
  const base = client.Articles.search("корм");
  const manual = base.orderBy((a) => a.title.asc());
  await base.exec();
  await manual.search("кошки").exec();
  await manual.orderByRelevance().page(2).exec();
  assert.equal(calls[0].url.searchParams.get("order"), "relevance");
  assert.equal(calls[1].url.searchParams.get("order"), "field");
  assert.equal(calls[2].url.searchParams.get("order"), "relevance");
  assert.equal(calls[2].url.searchParams.get("sort"), "title");
  assert.equal(calls[2].url.searchParams.get("page"), "2");
});
test("fluent callbacks build the native filter and projection without changing decimal precision", async () => {
  const { client, calls, envelope } = fixture();
  const rows = await client.Articles.select((a) => [a.id, a.title])
    .where((a) =>
      a.status.eq("published").and(a.price.gte("1000.000000000000000001")),
    )
    .orderBy((a) => a.created_at.desc())
    .limit(20)
    .exec();
  assert.deepEqual(rows, envelope.data);
  assert.equal(calls.length, 1);
  const { url } = calls[0];
  assert.equal(url.pathname, "/api/items/articles");
  assert.equal(url.searchParams.get("fields"), "id,title");
  assert.equal(url.searchParams.get("sort"), "created_at");
  assert.equal(url.searchParams.get("direction"), "desc");
  assert.equal(url.searchParams.get("limit"), "20");
  assert.deepEqual(JSON.parse(url.searchParams.get("filter")), {
    logic: "and",
    children: [
      { field: "status", op: "eq", value: "published" },
      { field: "price", op: "gte", value: "1000.000000000000000001" },
    ],
  });
});
test("queries are reusable and immutable; result preserves the envelope and repeated where means AND", async () => {
  const { client, calls, envelope } = fixture();
  const base = client.collection("articles").where((a) => a.published.eq(true));
  const filtered = base
    .where((a) => a.title.isNull().or(a.title.contains("draft")))
    .page(2)
    .search("article");
  assert.deepEqual(await filtered.result(), envelope);
  await base.exec();
  assert.equal(calls[0].url.searchParams.get("page"), "2");
  assert.equal(calls[1].url.searchParams.has("page"), false);
  const filter = JSON.parse(calls[0].url.searchParams.get("filter"));
  assert.equal(filter.children[0].value, "true");
  assert.equal(filter.children[1].logic, "or");
  assert.deepEqual(
    JSON.parse(calls[1].url.searchParams.get("filter")).children,
    [filter.children[0]],
  );
});
test("unsupported fields/operators, forged references, unsafe numbers and invalid pagination never fetch", () => {
  const { client, calls } = fixture();
  assert.equal(client.Articles, client.collection("articles"));
  assert.throws(() => client.collection("missing"));
  assert.throws(() => client.Articles.select(() => [{ name: "title" }]));
  assert.throws(() => client.Articles.select(() => []));
  assert.throws(() =>
    client.Articles.orderBy(() => ({ name: "id", direction: "asc" })),
  );
  assert.throws(() => client.Articles.where(() => true));
  assert.throws(() => client.Articles.where((a) => a.data.eq({})));
  assert.throws(() => client.Articles.where((a) => a.price.contains("1")));
  assert.throws(() => client.Articles.where((a) => a.id.isNull()));
  assert.throws(() =>
    client.Articles.where((a) => a.price.eq(9007199254740993)),
  );
  assert.throws(() => client.Articles.where((a) => a.status.in([])));
  assert.throws(() => client.Articles.limit(101));
  assert.throws(() => client.Articles.page(0));
  assert.equal(calls.length, 0);
});
test("fluent exec preserves cancellation and HTTP errors from the standard transport", async () => {
  const { client, calls } = fixture();
  await assert.rejects(client.Articles.exec({ signal: AbortSignal.abort() }), {
    name: "AbortError",
  });
  assert.equal(calls.length, 0);
  const forbidden = createClient({
    baseUrl: "https://example.test",
    schema,
    fetch: async () => Response.json({ message: "Forbidden" }, { status: 403 }),
  });
  await assert.rejects(
    forbidden.Articles.exec(),
    (error) => error.status === 403,
  );
});
