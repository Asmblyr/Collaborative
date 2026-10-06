import {
  defineCollection,
  type CollectionRow,
  type CollectionStorage,
} from "../src/index.js";

const entries = defineCollection({
  name: "entries",
  primaryKey: { name: "id", type: "uuid" },
  timestamps: { createdAt: true, updatedAt: false },
  fields: {
    body: { type: "text", required: true, nullable: true },
    author: { type: "uuid", required: false, nullable: true },
    resolved: {
      type: "boolean",
      required: false,
      nullable: false,
      defaultValue: false,
    },
    price: { type: "decimal", required: false, nullable: true },
    day: { type: "date", required: false, nullable: true },
    counter: { type: "bigint", required: false, nullable: true },
  },
});

declare const row: CollectionRow<typeof entries>;
const body: string | null = row.body;
const createdAt: string = row.created_at;
// @ts-expect-error Disabled timestamps are not part of the row.
row.updated_at;
// @ts-expect-error Nullable storage fields must be narrowed.
const author: string = row.author;
void [body, createdAt, author];

declare const storage: CollectionStorage<typeof entries>;
storage.create({ body: "hello", author: null });
storage.update("id", { resolved: true, price: "12.30" });
storage.update("id", { day: "2026-10-04", counter: "9007199254740993" });
const day: string | null = row.day;
const counter: string | null = row.counter;
void [day, counter];
// @ts-expect-error Bigint values must not be passed through lossy JS numbers.
storage.update("id", { counter: 9007199254740993 });
// @ts-expect-error A calendar date is a string, not a timezone-dependent Date.
storage.update("id", { day: new Date() });
storage.list({ sort: "created_at" });
// @ts-expect-error Generated primary keys are managed by Core.
storage.create({ id: "generated", body: "hello" });
// @ts-expect-error API requiredness is independent of database nullability.
storage.create({ body: null });
// @ts-expect-error Required fields cannot be omitted.
storage.create({ author: null });
// @ts-expect-error Required fields cannot be cleared on update.
storage.update("id", { body: null });
// @ts-expect-error Field type comes from the declaration.
storage.update("id", { resolved: "true" });
// @ts-expect-error Unknown fields are not writable.
storage.create({ body: "hello", missing: true });
// @ts-expect-error Managed timestamps are not writable.
storage.update("id", { created_at: "2026-01-01" });
// @ts-expect-error Full-row storage does not accept field projections.
storage.list({ fields: ["body"] });
// @ts-expect-error Sort fields are inferred.
storage.list({ sort: "unknown" });

const catalog = defineCollection({
  name: "catalog",
  primaryKey: { name: "code", type: "text" },
  fields: {},
});
declare const codes: CollectionStorage<typeof catalog>;
codes.create({ code: "example" });
// @ts-expect-error Manual text keys are required.
codes.create({});

const logs = defineCollection({
  name: "logs",
  primaryKey: { name: "sequence", type: "bigserial" },
  fields: {},
});
declare const log: CollectionRow<typeof logs>;
const sequence: string = log.sequence;
void sequence;

const defaults = defineCollection({
  name: "defaults",
  primaryKey: { name: "id", type: "serial" },
  fields: {
    title: {
      type: "text",
      required: true,
      nullable: false,
      defaultValue: "Untitled",
    },
    payload: { type: "json", required: false, nullable: false },
  },
});
declare const withDefaults: CollectionStorage<typeof defaults>;
withDefaults.create({ payload: {} });
// @ts-expect-error A nonnullable field without a default must be supplied.
withDefaults.create({});
// @ts-expect-error Nonnullable JSON fields cannot be cleared through the API.
withDefaults.update(1, { payload: null });
