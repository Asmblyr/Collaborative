import {
  createClient,
  type ItemListResult,
  type JsonRecord,
  type CollectionSchema,
} from "../src/index.js";

type Generated = {
  user_profiles: CollectionSchema<
    { id: string; bio: string },
    never,
    { bio?: string },
    true,
    { bio: string; creationOnly?: string }
  >;
  articles: CollectionSchema<
    { id: string; title: string; price: string | null },
    { title: string; price?: string | null },
    { title?: string; price?: string | null }
  >;
};
async function generatedConsumer() {
  const client = createClient<Generated>({ baseUrl: "/api" });
  await client.users.saveExtension("user_profiles", {
    bio: "About",
    creationOnly: "initial",
  });
  const custom = await client.users.extension("user_profiles");
  const customBio: string | undefined = custom.data?.data?.bio;
  void customBio;
  // @ts-expect-error Ordinary creation is unavailable for user-owned rows.
  await client.items.create("user_profiles", { bio: "orphan" });
  await client.users.updateMe({ firstName: "Ivan", avatarId: null });
  await client.users.updatePreferences({ timezone: "UTC" });
  await client.users.saveExtension("articles", { title: "Bio" });
  const extension = await client.users.extension("articles");
  const bio: string | undefined = extension.data?.data?.title;
  void bio;
  // @ts-expect-error Consumer profile fields come from the generated schema.
  await client.users.saveExtension("articles", { password: "bad" });
  // @ts-expect-error System account fields cannot be edited as profile fields.
  await client.users.updateMe({ superuser: true });
  await client.items.create("articles", { title: "Article" });
  // @ts-expect-error Generated required create field.
  await client.items.create("articles", {});
  // @ts-expect-error Generated key is readonly.
  await client.items.update("articles", "id", { id: "other" });
  // @ts-expect-error Decimal is a string, never a JS number.
  await client.items.create("articles", { title: "Article", price: 1.1 });
  await client.items.commit("articles", {
    id: "id",
    values: { price: "1.10" },
  });
  // @ts-expect-error Commit creation requires the create shape too.
  await client.items.commit("articles", { values: {} });
}
void generatedConsumer;

interface Schema {
  articles: { id: number; title: string; created_at: string | null };
  shops: { key: string; name: string };
  schedules: { id: number; day: string; counter: string; kind: 0 | 2 };
}

async function checkTypes(): Promise<void> {
  const client = createClient<Schema>({ baseUrl: "/api" });
  await client.items.create("schedules", {
    day: "2026-10-04",
    counter: "9007199254740993",
    kind: 0,
  });
  // @ts-expect-error Calendar values remain strings, not instants.
  await client.items.update("schedules", 1, { day: new Date() });
  // @ts-expect-error Large integers must not go through JS numbers.
  await client.items.update("schedules", 1, { counter: 9007199254740993 });
  // @ts-expect-error Numeric choice values retain their schema union.
  await client.items.update("schedules", 1, { kind: "0" });
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
