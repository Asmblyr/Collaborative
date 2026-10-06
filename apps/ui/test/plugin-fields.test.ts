import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { defineUiPlugin } from "@asmblyr-collaborative/kit/ui";
import { PluginRegistryProvider } from "../src/components/plugins/registry";
import { ItemFieldInput } from "../src/components/items/item-field-input";
import { ContentValue } from "../src/components/items/content-value";
import { readColorOptions } from "../../../examples/plugins/color/ui/color-options";
import colorPlugin from "../../../examples/plugins/color/ui/index";
import { uiPlugins } from "../src/generated/plugin-ui";

const installedPlugins = [...uiPlugins];
test.before(() => {
  // This example is a test fixture; production enables only configured packages.
  uiPlugins.push({
    packageName: "@asmblyr-collaborative/plugin-color",
    namespace: "color",
    definition: colorPlugin,
  });
});
test.after(() => {
  uiPlugins.splice(0, uiPlugins.length, ...installedPlugins);
});

const field = {
  name: "color",
  type: "text",
  required: false,
  nullable: true,
  presentation: {
    label: "Цвет",
    description: "",
    placeholder: "",
    interface: "auto" as const,
    width: "full" as const,
    order: 0,
    group: "",
    extension: {
      id: "color:picker",
      options: { palette: ["#123456"], allowCustom: false },
    },
  },
};

test("disabled plugin preserves an editable draft and uses a plain display", () => {
  const input = renderToStaticMarkup(
    createElement(ItemFieldInput, {
      id: "color",
      field,
      value: "#abcdef",
      disabled: false,
      catalog: [],
      onChange: () => assert.fail("render must not mutate the draft"),
    }),
  );
  assert.match(input, /value="#abcdef"/);
  assert.match(input, /Редактор расширения недоступен/);
  const display = renderToStaticMarkup(
    createElement(ContentValue, { field, value: "#abcdef" }),
  );
  assert.match(display, /#abcdef/);
  assert.doesNotMatch(display, /background-color/);
});

test("active color editor retains values outside the palette and honors disabled controls", () => {
  const input = renderToStaticMarkup(
    createElement(
      PluginRegistryProvider,
      { enabled: ["@asmblyr-collaborative/plugin-color"] },
      createElement(ItemFieldInput, {
        id: "color",
        field,
        value: "#abcdef",
        disabled: true,
        catalog: [],
        onChange: () => assert.fail("render must not mutate the draft"),
      }),
    ),
  );
  assert.match(input, /value="#abcdef"/);
  assert.match(input, /Сохранённое значение вне палитры/);
  assert.match(input, /disabled=""/);
  assert.doesNotMatch(input, /Редактор расширения недоступен/);
});

test("plugin display escapes arbitrary stored text instead of treating it as CSS or HTML", () => {
  const html = renderToStaticMarkup(
    createElement(
      PluginRegistryProvider,
      { enabled: ["@asmblyr-collaborative/plugin-color"] },
      createElement(ContentValue, {
        field,
        value: '<img src=x onerror="alert(1)">',
      }),
    ),
  );
  assert.match(html, /&lt;img/);
  assert.doesNotMatch(html, /<img|background-color/);
  assert.deepEqual(
    readColorOptions({ palette: ["unfinished"], allowCustom: false }),
    {
      palette: ["unfinished"],
      allowCustom: false,
    },
  );
});

test("field UI contributions reject ambiguous IDs and duplicate registrations", () => {
  const entry = {
    id: "picker",
    title: "Цвет",
    types: ["text"] as const,
    editor: () => null,
  };
  assert.throws(
    () => defineUiPlugin({ fieldInterfaces: [entry, entry] }),
    /Duplicate/,
  );
  assert.throws(
    () => defineUiPlugin({ fieldInterfaces: [{ ...entry, id: "../picker" }] }),
    /URL-safe/,
  );
  assert.throws(
    () => defineUiPlugin({ fieldInterfaces: [{ ...entry, types: [] }] }),
    /text storage/,
  );
});
