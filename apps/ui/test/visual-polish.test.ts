import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { defaultHiddenColumnNames } from "../src/components/items/table-column-defaults";
import { reconcileColumns } from "../src/components/items/column-state";
import { extractUserInitials } from "../src/components/items/user-avatar-initials";
import { ItemTableValue } from "../src/components/items/item-table-value";
import { ConfiguredFieldLayout } from "../src/components/items/configured-field-layout";
import type { ItemColumn } from "../src/components/items/item-columns";
import type { CollectionField } from "../src/components/items/types";
import {
  FALLBACK_TIMEZONES,
  buildTimezoneOption,
  buildTimezoneOptions,
  canonicalTimeZone,
  filterTimezoneOptions,
  formatUtcOffset,
  matchesAutoTimezoneQuery,
  supportedTimeZones,
} from "../src/components/settings/timezone-options";

test("UUID primary key columns are hidden by default only when another human-readable column exists", () => {
  const uuidPk = { name: "id", type: "uuid" as const };
  const serialPk = { name: "id", type: "serial" as const };
  const textPk = { name: "code", type: "text" as const };

  const idCol: ItemColumn = { name: "id", label: "ID", type: "uuid" };
  const titleCol: ItemColumn = {
    name: "title",
    label: "Название",
    type: "text",
  };
  const createdCol: ItemColumn = {
    name: "created_at",
    label: "Создано",
    type: "datetime",
  };
  const updatedCol: ItemColumn = {
    name: "updated_at",
    label: "Обновлено",
    type: "datetime",
  };
  const rawUuidCol: ItemColumn = {
    name: "external_uid",
    label: "Внешний UUID",
    type: "uuid",
  };
  const ownerRelationCol: ItemColumn = {
    name: "owner_id",
    label: "Ответственный",
    type: "uuid",
    relation: {
      kind: "m2o",
      collection: "@users",
      primaryKey: { name: "id", type: "uuid" },
      onDelete: "setNull",
    },
  };

  assert.deepEqual(
    defaultHiddenColumnNames(uuidPk, [idCol, titleCol, createdCol]),
    ["id"],
  );
  assert.deepEqual(
    defaultHiddenColumnNames(uuidPk, [idCol, ownerRelationCol]),
    ["id"],
  );
  assert.deepEqual(defaultHiddenColumnNames(uuidPk, [idCol]), []);
  assert.deepEqual(
    defaultHiddenColumnNames(uuidPk, [idCol, createdCol, updatedCol]),
    [],
  );
  assert.deepEqual(defaultHiddenColumnNames(uuidPk, [idCol, rawUuidCol]), []);
  assert.deepEqual(
    defaultHiddenColumnNames(serialPk, [
      { name: "id", label: "ID", type: "serial" },
      titleCol,
    ]),
    [],
  );
  assert.deepEqual(
    defaultHiddenColumnNames(textPk, [
      { name: "code", label: "Код", type: "text" },
      titleCol,
    ]),
    [],
  );
});

test("reconcileColumns hides default UUID ID until user explicitly customizes hidden columns", () => {
  const names = ["id", "title", "owner_id"];
  const defaultHidden = ["id"];

  // Fresh user with no saved column preferences
  assert.deepEqual(reconcileColumns("null", names, defaultHidden), {
    order: ["id", "title", "owner_id"],
    hidden: ["id"],
    widths: {},
  });

  // Invalid JSON falls back to defaultHidden
  assert.deepEqual(reconcileColumns("not-json", names, defaultHidden), {
    order: ["id", "title", "owner_id"],
    hidden: ["id"],
    widths: {},
  });

  // Power user re-enables ID via «Вид» -> hidden: [] is respected
  assert.deepEqual(
    reconcileColumns(
      JSON.stringify({ order: names, hidden: [], widths: {} }),
      names,
      defaultHidden,
    ),
    {
      order: ["id", "title", "owner_id"],
      hidden: [],
      widths: {},
    },
  );

  // User hides another column while keeping ID visible
  assert.deepEqual(
    reconcileColumns(
      JSON.stringify({ order: names, hidden: ["owner_id"], widths: {} }),
      names,
      defaultHidden,
    ),
    {
      order: ["id", "title", "owner_id"],
      hidden: ["owner_id"],
      widths: {},
    },
  );

  // Guard: never hide every column
  assert.deepEqual(reconcileColumns("null", ["id"], ["id"]), {
    order: ["id"],
    hidden: [],
    widths: {},
  });
});

test("extractUserInitials handles Cyrillic, Latin, parenthetical metadata, emails, and empty input", () => {
  assert.equal(extractUserInitials("Иван Петров"), "ИП");
  assert.equal(extractUserInitials("Анна Мария Сидорова"), "АМ");
  assert.equal(extractUserInitials("Иван"), "И");
  assert.equal(extractUserInitials("Администратор (admin@corp.ru)"), "А");
  assert.equal(extractUserInitials("  elena   sokolova  "), "ES");
  assert.equal(extractUserInitials("elena.sokolova@corp.ru"), "ES");
  assert.equal(extractUserInitials("admin@corp.ru"), "A");
  assert.equal(extractUserInitials(""), "");
  assert.equal(extractUserInitials("   "), "");
  assert.equal(extractUserInitials(null), "");
  assert.equal(extractUserInitials(undefined), "");
  assert.equal(extractUserInitials("—"), "");
});

test("ItemTableValue renders mini-avatars for @users M2O relations and keeps Link2 for regular collections", () => {
  const userColumn: ItemColumn = {
    name: "assignee_id",
    label: "Исполнитель",
    type: "uuid",
    relation: {
      kind: "m2o",
      collection: "@users",
      primaryKey: { name: "id", type: "uuid" },
      onDelete: "setNull",
    },
  };
  const clientColumn: ItemColumn = {
    name: "client_id",
    label: "Клиент",
    type: "uuid",
    relation: {
      kind: "m2o",
      collection: "clients",
      primaryKey: { name: "id", type: "uuid" },
      onDelete: "setNull",
    },
  };

  const resolvedUserHtml = renderToStaticMarkup(
    createElement(ItemTableValue, {
      column: userColumn,
      value: "550e8400-e29b-41d4-a716-446655440000",
      primary: false,
      emphasized: false,
      relationLabel: "Иван Петров",
    }),
  );
  assert.match(resolvedUserHtml, /size-5/);
  assert.match(resolvedUserHtml, /rounded-full/);
  assert.match(resolvedUserHtml, /ring-1/);
  assert.match(resolvedUserHtml, />ИП</);
  assert.match(resolvedUserHtml, />Иван Петров</);
  assert.doesNotMatch(resolvedUserHtml, /lucide-link-2/);

  const unresolvedUserHtml = renderToStaticMarkup(
    createElement(ItemTableValue, {
      column: userColumn,
      value: "550e8400-e29b-41d4-a716-446655440000",
      primary: false,
      emphasized: false,
    }),
  );
  assert.match(unresolvedUserHtml, /size-5/);
  assert.match(unresolvedUserHtml, /lucide-user-round/);
  assert.match(unresolvedUserHtml, /550e8400…0000/);

  const regularRelationHtml = renderToStaticMarkup(
    createElement(ItemTableValue, {
      column: clientColumn,
      value: "550e8400-e29b-41d4-a716-446655440001",
      primary: false,
      emphasized: false,
      relationLabel: "ООО Ромашка",
    }),
  );
  assert.match(regularRelationHtml, /lucide-link-2/);
  assert.match(regularRelationHtml, />ООО Ромашка</);
  assert.doesNotMatch(regularRelationHtml, /size-5/);
});

test("ConfiguredFieldLayout renders secondary form tabs with underline tab bar styling", () => {
  const fields: CollectionField[] = [
    { name: "title", type: "text", required: true, nullable: false },
    { name: "notes", type: "text", required: false, nullable: true },
  ];
  const layoutProps: Parameters<typeof ConfiguredFieldLayout>[0] = {
    fields,
    layout: {
      version: 1,
      tabs: [
        {
          id: "main",
          label: "Основное",
          children: [
            { id: "f1", kind: "field", field: "title", width: "full" },
          ],
        },
        {
          id: "tasks",
          label: "Задачи",
          children: [
            { id: "f2", kind: "field", field: "notes", width: "full" },
          ],
        },
      ],
    },
    values: { title: "Demo", notes: "" },
    forced: new Set<string>(),
    children: (field) => createElement("span", null, field.name),
  };
  const html = renderToStaticMarkup(
    createElement(ConfiguredFieldLayout, layoutProps),
  );
  assert.match(html, /data-variant="underline"/);
  assert.match(html, /border-b border-border/);
  assert.match(html, /border-b-2/);
  assert.match(html, /data-\[state=active\]:border-primary/);
  assert.match(html, /Основное/);
  assert.match(html, /Задачи/);
});

test("timezone helpers format UTC offsets, fallback safely, and filter by city, region, and offset", () => {
  const winterDate = new Date("2026-01-15T12:00:00Z");

  assert.deepEqual(formatUtcOffset("UTC", winterDate), {
    offsetLabel: "UTC+00:00",
    offsetMinutes: 0,
  });
  assert.deepEqual(formatUtcOffset("Europe/Moscow", winterDate), {
    offsetLabel: "UTC+03:00",
    offsetMinutes: 180,
  });
  assert.deepEqual(formatUtcOffset("Asia/Yekaterinburg", winterDate), {
    offsetLabel: "UTC+05:00",
    offsetMinutes: 300,
  });
  assert.deepEqual(formatUtcOffset("Asia/Kolkata", winterDate), {
    offsetLabel: "UTC+05:30",
    offsetMinutes: 330,
  });
  assert.deepEqual(formatUtcOffset("America/New_York", winterDate), {
    offsetLabel: "UTC-05:00",
    offsetMinutes: -300,
  });

  // Fallback when Intl.supportedValuesOf fails or returns empty
  const fallbackOnError = supportedTimeZones(() => {
    throw new Error("unsupported");
  });
  assert.ok(fallbackOnError.includes("UTC"));
  assert.ok(fallbackOnError.includes("Europe/Moscow"));
  assert.ok(fallbackOnError.length >= FALLBACK_TIMEZONES.length);

  const options = buildTimezoneOptions(
    [
      "Asia/Yekaterinburg",
      "America/New_York",
      "Europe/Moscow",
      "UTC",
      "Asia/Tokyo",
    ],
    winterDate,
  );
  assert.deepEqual(
    options.map((option) => option.label),
    [
      "UTC-05:00 · America/New_York",
      "UTC+00:00 · UTC",
      "UTC+03:00 · Europe/Moscow",
      "UTC+05:00 · Asia/Yekaterinburg",
      "UTC+09:00 · Asia/Tokyo",
    ],
  );

  assert.deepEqual(
    filterTimezoneOptions(options, "moscow").map((o) => o.id),
    ["Europe/Moscow"],
  );
  assert.deepEqual(
    filterTimezoneOptions(options, "new york").map((o) => o.id),
    ["America/New_York"],
  );
  assert.deepEqual(
    filterTimezoneOptions(options, "+5").map((o) => o.id),
    ["Asia/Yekaterinburg"],
  );
  assert.deepEqual(
    filterTimezoneOptions(options, "UTC+03:00").map((o) => o.id),
    ["Europe/Moscow"],
  );
  assert.deepEqual(
    filterTimezoneOptions(options, "−5").map((o) => o.id),
    ["America/New_York"],
  );
  assert.deepEqual(filterTimezoneOptions(options, "mars/olympus"), []);

  const browserOption = buildTimezoneOption("Asia/Yekaterinburg", winterDate);
  assert.equal(matchesAutoTimezoneQuery("", browserOption), true);
  assert.equal(matchesAutoTimezoneQuery("авто", browserOption), true);
  assert.equal(matchesAutoTimezoneQuery("yekat", browserOption), true);
  assert.equal(matchesAutoTimezoneQuery("+5", browserOption), true);
  assert.equal(matchesAutoTimezoneQuery("tokyo", browserOption), false);

  assert.equal(canonicalTimeZone("Europe/Moscow"), "Europe/Moscow");
  assert.equal(canonicalTimeZone("   "), null);
  assert.throws(() => canonicalTimeZone("Invalid/Zone"));
});
