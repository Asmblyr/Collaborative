import {
  createClient,
  type ItemListResult,
  type JsonRecord,
} from "../src/index.js";

interface Schema {
  articles: { id: number; title: string; created_at: string | null };
  shops: { key: string; name: string };
}

async function checkTypes(): Promise<void> {
  const client = createClient<Schema>({ baseUrl: "/api" });
  const result = await client.items.list("articles", {
    fields: ["title"],
    sort: "id",
  });
  const title: string | undefined = result.data[0].title;
  void title;
  // @ts-expect-error Unrequested fields are not part of the selected projection.
  result.data[0].created_at;
  // @ts-expect-error Permissions may omit a required schema field.
  const required: string = result.data[0].title;
  void required;
  // @ts-expect-error Unknown collection.
  await client.items.list("unknown");
  // @ts-expect-error Unknown field.
  await client.items.list("articles", { fields: ["password"] });
  // @ts-expect-error Unknown sort field.
  await client.items.list("shops", { sort: "title" });
  const shop = await client.items.get("shops", "key", { fields: ["name"] });
  const name: string | undefined = shop.data.name;
  void name;
  // @ts-expect-error There is no arbitrary actor override.
  await client.items.get("shops", "key", { superuser: true });
  const all = await client.items.get("articles", 1);
  const createdAt: string | null | undefined = all.data.created_at;
  void createdAt;
  const me = await client.users.me();
  const email: string = me.data.email;
  void email;
  // @ts-expect-error Database credential fields are not public.
  me.data.password_hash;
  const dynamic = createClient({ baseUrl: "/api" });
  const records: ItemListResult<JsonRecord> =
    await dynamic.items.list("anything");
  void records;
  const created = await client.items.create("articles", { title: "Created" });
  const optionalTitle: string | undefined = created.data?.title;
  void optionalTitle;
  // @ts-expect-error A write may succeed without read access.
  created.data.title;
  await client.items.update("articles", 1, { created_at: null });
  // @ts-expect-error Invalid field name.
  await client.items.create("articles", { secret: "hidden" });
  // @ts-expect-error Invalid field value type.
  await client.items.update("articles", 1, { title: 42 });
  // @ts-expect-error Nullability comes from the provided schema.
  await client.items.update("articles", 1, { title: null });
  // @ts-expect-error Unknown collection.
  await client.items.delete("unknown", 1);
  const committed = await client.items.commit("articles", {
    values: { title: "Created" },
  });
  const id: string = committed.data.id;
  void id;
  // @ts-expect-error Root commit values use the collection schema too.
  await client.items.commit("articles", { values: { title: 42 } });
  await client.items.commit("articles", {
    id: "1",
    values: { title: "New" },
    expectedValues: { title: "Old" },
  });
  await client.items.commit("articles", {
    id: "1",
    values: { title: "New" },
    // @ts-expect-error Preconditions use the root collection schema.
    expectedValues: { title: 42 },
  });
  // @ts-expect-error Request options cannot override the actor.
  await client.items.create("articles", {}, { superuser: true });
}

void checkTypes;
