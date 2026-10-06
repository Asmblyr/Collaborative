import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  fieldConditionMatches,
  resolveRelationChoiceFilter,
  type RelationChoiceFilter,
} from "@asmblyr-collaborative/contracts";
import {
  changeFieldDraft,
  effectiveFieldDraft,
  fieldIsRequired,
  fieldIsReadonly,
} from "../src/components/items/field-rule-draft";
import { defaultPresentation } from "../src/components/collections/field-presentation-defaults";
import { ContentValue } from "../src/components/items/content-value";
import { ItemTableValue } from "../src/components/items/item-table-value";
import { ItemForm } from "../src/components/items/item-form";
import {
  effectiveLayout,
  fieldsInNodes,
} from "../src/components/items/form-layout-model";
import {
  templateLabel,
  itemLabelField,
} from "../src/components/items/item-label";
import { labelPathOptions } from "../src/components/collections/label-path-options";
import type {
  Collection,
  CollectionField,
} from "../src/components/items/types";

const field = (name: string, type = "text"): CollectionField => ({
  name,
  type,
  required: false,
  nullable: true,
});
const filter = (dependency: string): RelationChoiceFilter => ({
  logic: "and",
  children: [
    { field: "parent", op: "eq", value: { kind: "field", field: dependency } },
  ],
});
const collection = (name: string, fields: CollectionField[]): Collection => ({
  name,
  fields,
  folderId: null,
  mode: "multiple",
  primaryKey: { name: "id", type: "uuid" },
  timestamps: { createdAt: false, updatedAt: false },
  access: {
    read: ["*"],
    create: ["*"],
    update: ["*"],
    delete: true,
    structure: true,
  },
});

test("required conditions preserve false and zero, and read-only/computed fields are not writable", () => {
  const value = {
    ...field("note"),
    presentation: {
      ...defaultPresentation,
      rules: {
        requiredWhen: {
          mode: "all" as const,
          rules: [{ field: "enabled", operator: "eq" as const, value: false }],
        },
      },
    },
  };
  assert.equal(fieldIsRequired(value, { enabled: "false" }), true);
  assert.equal(fieldIsRequired(value, { enabled: "true" }), false);
  const effective = effectiveFieldDraft(
    [{ ...field("enabled", "boolean"), defaultValue: false }],
    { enabled: "" },
    false,
    { parent: "parent-id" },
  );
  assert.equal(effective.enabled, "false");
  assert.equal(effective.parent, "parent-id");
  assert.equal(fieldIsRequired(value, effective), true);
  assert.equal(
    effectiveFieldDraft(
      [{ ...field("enabled", "boolean"), defaultValue: false }],
      { enabled: "" },
      true,
    ).enabled,
    "",
  );

  assert.equal(
    fieldConditionMatches(
      { mode: "all", rules: [{ field: "count", operator: "notEmpty" }] },
      { count: 0 },
    ),
    true,
  );
  assert.equal(
    fieldIsReadonly({
      ...field("code"),
      presentation: {
        ...defaultPresentation,
        rules: { computed: { relation: "city", field: "code" } },
      },
    }),
    true,
  );
});

test("dependent choice drafts clear transitively, never on unrelated or unchanged edits", () => {
  const fields = [
    field("region"),
    {
      ...field("city", "relation"),
      presentation: {
        ...defaultPresentation,
        relationFilter: filter("region"),
      },
    },
    {
      ...field("office", "relation"),
      presentation: { ...defaultPresentation, relationFilter: filter("city") },
    },
    field("note"),
  ];
  const draft = { region: "1", city: "2", office: "3", note: "keep" };
  assert.equal(changeFieldDraft(fields, draft, "region", "1"), draft);
  assert.deepEqual(changeFieldDraft(fields, draft, "region", "4"), {
    region: "4",
    city: "",
    office: "",
    note: "keep",
  });
  assert.equal(changeFieldDraft(fields, draft, "note", "new").city, "2");
  assert.equal(
    resolveRelationChoiceFilter(filter("region"), { region: "" }),
    null,
  );
  assert.deepEqual(
    resolveRelationChoiceFilter(filter("region"), { region: 0 }),
    { logic: "and", children: [{ field: "parent", op: "eq", value: "0" }] },
  );
});

test("sensitive values cannot render as content, table tooltips, plugin displays or record labels", () => {
  const secret = {
    ...field("credential"),
    presentation: { ...defaultPresentation, sensitive: true },
  };
  const content = renderToStaticMarkup(
    createElement(ContentValue, { field: secret, value: "private-secret" }),
  );
  const table = renderToStaticMarkup(
    createElement(ItemTableValue, {
      column: { ...secret, label: "Credential" },
      value: "private-secret",
      primary: false,
      emphasized: false,
    }),
  );
  assert.ok(
    !content.includes("private-secret") && !table.includes("private-secret"),
  );
  assert.ok(content.includes("••••••••"));
  const source = collection("records", [secret, field("title")]);
  source.displayField = "credential";
  assert.equal(itemLabelField(source), "id");
  assert.ok(
    !labelPathOptions(source, [source]).some(
      (option) => option.value === "credential",
    ),
  );
});

test("to-many aliases occupy configured groups and computed fields show a saved-value hint", () => {
  const aliases = [field("children", "alias")];
  const layout = {
    version: 1 as const,
    tabs: [
      {
        id: "main",
        label: "Main",
        children: [
          {
            id: "group",
            kind: "group" as const,
            label: "Relations",
            description: "",
            collapsed: false,
            collapsible: false,
            children: [
              {
                id: "children",
                kind: "field" as const,
                field: "children",
                width: "full" as const,
              },
            ],
          },
        ],
      },
    ],
  };
  assert.deepEqual(
    effectiveLayout(layout, aliases).tabs.flatMap((tab) =>
      fieldsInNodes(tab.children),
    ),
    ["children"],
  );
  const html = renderToStaticMarkup(
    createElement(ItemForm, {
      fields: [],
      aliasFields: aliases,
      renderAlias: () => createElement("p", null, "related-panel"),
      formLayout: layout,
      catalog: [],
      primaryKey: { name: "id", type: "uuid" },
      pending: false,
      onSave: async () => {},
      onCancel: () => {},
    }),
  );
  assert.equal((html.match(/related-panel/g) ?? []).length, 1);
  assert.equal(
    templateLabel("{{city.region.title}} · {{title}}", {
      "city.region.title": "North",
      title: "Office",
    }),
    "North · Office",
  );
  assert.equal(
    templateLabel("{{city.region.title}} · {{title}}", { title: "Office" }),
    null,
  );
});
