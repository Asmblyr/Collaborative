import { defineCollection } from "../src/index.js";

defineCollection({
  name: "entries",
  primaryKey: { name: "id", type: "uuid" },
  fields: {
    body: {
      type: "text",
      required: true,
      nullable: true,
      presentation: { interface: "textarea", width: "full" },
    },
    resolved: {
      type: "boolean",
      required: false,
      nullable: false,
      defaultValue: false,
    },
    // @ts-expect-error Boolean fields cannot have string defaults.
    invalidDefault: {
      type: "boolean",
      required: false,
      nullable: false,
      defaultValue: "false",
    },
    // @ts-expect-error Search participation is currently supported only for text and email.
    invalidSearch: {
      type: "integer",
      required: false,
      nullable: true,
      searchable: true,
    },
    // @ts-expect-error Core does not support arbitrary scalar types.
    invalidType: { type: "money", required: false, nullable: true },
    // @ts-expect-error Database nullability must be explicit and separate from API requiredness.
    missingNullability: { type: "text", required: true },
  },
});

const entries = defineCollection({
  name: "entries",
  primaryKey: { name: "id", type: "uuid" },
  fields: { body: { type: "text", required: true, nullable: false } },
});
const localName: "entries" = entries.name;
void localName;

defineCollection({
  name: "entries",
  // @ts-expect-error Primary key types follow Core's shared contract.
  primaryKey: { name: "id", type: "boolean" },
  fields: {},
});

defineCollection({
  name: "entries",
  primaryKey: { name: "id", type: "uuid" },
  fields: {},
  // @ts-expect-error Physical table names belong to the future Core installer.
  table: "asmblyr_users",
});
