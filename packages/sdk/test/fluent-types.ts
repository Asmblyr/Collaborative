import {
  createClient,
  defineSchema,
  type CollectionSchema,
} from "../src/index.js";
interface Schema {
  articles: CollectionSchema<
    {
      id: string;
      title: string | null;
      status: "draft" | "published";
      price: string;
      created_at: string;
      data: object;
    },
    { title: string },
    { title?: string }
  >;
  reports: CollectionSchema<{ id: number; title: string }, never, never, false>;
}
const schema = defineSchema<Schema>()(
  {
    articles: {
      id: { kind: "scalar", nullable: false },
      title: { kind: "text", nullable: true },
      status: { kind: "text", nullable: false },
      price: { kind: "ordered", nullable: false },
      created_at: { kind: "ordered", nullable: false },
      data: { kind: "none", nullable: false },
    },
    reports: {
      id: { kind: "scalar", nullable: false },
      title: { kind: "text", nullable: false },
    },
  },
  { Articles: "articles", Reports: "reports" },
);
const client = createClient({ baseUrl: "/api", schema });
async function check() {
  const rows = await client.Articles.select((a) => [a.id, a.title])
    .where((a) => a.status.eq("published").and(a.price.gte("1000.00")))
    .orderBy((a) => a.created_at.desc())
    .exec();
  const title: string | null | undefined = rows[0].title;
  void title;
  // @ts-expect-error Fields outside the projection are unavailable.
  rows[0].price;
  // @ts-expect-error Row-level permissions may omit a selected field.
  const id: string = rows[0].id;
  void id;
  client
    .collection("reports")
    .select((a) => [a.title])
    .exec();
  // @ts-expect-error Names are suggested from the generated schema.
  client.collection("missing");
  // @ts-expect-error Unknown field.
  client.Articles.select((a) => [a.missing]);
  // @ts-expect-error Enum values remain closed.
  client.Articles.where((a) => a.status.eq("bad"));
  // @ts-expect-error Decimal operands must be API strings.
  client.Articles.where((a) => a.price.gte(1000));
  // @ts-expect-error Dates remain strings.
  client.Articles.where((a) => a.created_at.gte(new Date()));
  // @ts-expect-error JSON has no scalar filters.
  client.Articles.where((a) => a.data.eq({}));
  // @ts-expect-error Range filters are unavailable for text.
  client.Articles.where((a) => a.title.gte("a"));
  // @ts-expect-error Key cannot be null.
  client.Articles.where((a) => a.id.isNull());
  client.Articles.where((a) => a.title.isNull());
  // @ts-expect-error Materialized views remain read-only in the existing items API.
  client.items.create("reports", { title: "bad" });
}
void check;
