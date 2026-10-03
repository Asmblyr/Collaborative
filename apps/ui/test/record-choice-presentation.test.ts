import assert from "node:assert/strict";
import test from "node:test";
import { recordChoiceColumns, recordChoicePresentation } from "../src/components/items/record-choice-presentation";
import type { Collection, CollectionField } from "../src/components/items/types";

const base: Collection = { name: "base", folderId: null, mode: "multiple", primaryKey: { name: "id", type: "serial" },
  timestamps: { createdAt: false, updatedAt: false }, fields: [],
  access: { read: ["*"], create: null, update: null, delete: false, structure: false } };
const text = (name: string): CollectionField => ({ name, type: "text", nullable: true, required: false });
const relation = (name: string, collection: string): CollectionField => ({ ...text(name), type: "integer",
  relation: { kind: "m2o", collection, primaryKey: base.primaryKey, onDelete: "restrict" } });
const categories = { ...base, name: "categories", fields: [text("name")] };
const shops = { ...base, name: "shops", fields: [text("name")] };
const source: Collection = { ...base, name: "links", displayField: "local_name",
  fields: [text("local_name"), relation("shop_id", "shops"), relation("category_id", "categories")] };
const catalog = [source, shops, categories];
const columns = recordChoiceColumns(source, catalog, ["category_id"]);
const labels = new Map([[JSON.stringify(["categories", "2"]), "кофе молотый"],
  [JSON.stringify(["shops", "4"]), "Ozon"], [JSON.stringify(["shops", "1"]), "Utkonos"]]);
const item = { id: 19, local_name: null, category_id: 2, shop_id: 4 };

test("blank labels use the configured relation column and retain context for duplicate names", () => {
  const ozon = recordChoicePresentation(source, item, columns, labels);
  const other = recordChoicePresentation(source, { ...item, id: 2, shop_id: 1 }, columns, labels);
  assert.equal(ozon.label, "кофе молотый");
  assert.equal(ozon.selectedLabel, "кофе молотый · Ozon");
  assert.equal(other.selectedLabel, "кофе молотый · Utkonos");
  assert.match(ozon.detail, /shop_id: Ozon · ID: 19/);
});

test("explicit labels and templates take precedence and zero remains a valid label", () => {
  assert.equal(recordChoicePresentation(source, { ...item, local_name: "Own name" }, columns, labels).label, "Own name");
  assert.equal(recordChoicePresentation({ ...source, displayTemplate: "Record {{id}}" }, item, columns, labels).label, "Record 19");
  assert.equal(recordChoicePresentation(source, { ...item, local_name: 0 }, columns, labels).label, "0");
  assert.equal(recordChoicePresentation(source, item, columns, labels, "id").label, "19");
  assert.equal(recordChoicePresentation(source, item, columns, labels, "category_id").label, "кофе молотый");
});

test("source and target grants exclude unreadable relations and hidden template fields", () => {
  const restricted = { ...source, access: { ...source.access, read: ["shop_id"] } };
  assert.deepEqual(recordChoiceColumns(restricted, catalog, ["category_id"]).map((c) => c.name), ["shop_id"]);
  assert.equal(recordChoicePresentation({ ...restricted, displayTemplate: "{{local_name}}" },
    { ...item, local_name: "Secret" }, [], labels).label, "19");
  assert.deepEqual(recordChoiceColumns(source, [shops, { ...categories, access: { ...categories.access, read: null } }],
    ["category_id"]).map((c) => c.name), ["shop_id"]);
});

test("missing primary lookup keeps the ID instead of mislabelling the item with a secondary relation", () => {
  const missing = new Map([[JSON.stringify(["shops", "4"]), "Ozon"]]);
  const result = recordChoicePresentation(source, item, columns, missing);
  assert.equal(result.label, "19"); assert.match(result.detail, /Ozon/);
  assert.equal(recordChoicePresentation(source, item, columns, new Map()).label, "19");
});
