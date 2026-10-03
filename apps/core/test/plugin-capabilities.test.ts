import assert from "node:assert/strict";
import test from "node:test";
import {
  approvedCapabilities,
  validatePluginCapabilities,
} from "../src/plugins/capabilities.js";
import {
  parseSettingsDefinition,
  resolveSettingsValues,
  validateSettingsValues,
} from "../src/plugins/settings-validation.js";

test("capabilities are known, explicit, and approved per package", () => {
  assert.deepEqual(approvedCapabilities({}, {}, "example"), []);
  assert.throws(
    () => approvedCapabilities({}, { capabilities: ["items.read"] }, "example"),
    /requires approval/,
  );
  assert.throws(() =>
    approvedCapabilities({}, { capabilities: ["unknown"] }, "example"),
  );
  const project = {
    asmblyr: { pluginPermissions: { example: ["items.read", "items.write"] } },
  };
  assert.deepEqual(
    approvedCapabilities(project, { capabilities: ["items.read"] }, "example"),
    ["items.read"],
  );
  assert.throws(
    () =>
      approvedCapabilities(project, { capabilities: ["items.read"] }, "other"),
    /requires approval/,
  );
  assert.throws(
    () =>
      validatePluginCapabilities({
        name: "example",
        definition: {},
        endpoints: [],
        settings: { title: "Test", fields: {} },
      }),
    /settings/,
  );
  assert.throws(
    () =>
      validatePluginCapabilities({
        name: "example",
        definition: {},
        endpoints: [],
        capabilities: ["hooks.items"],
        hooks: [
          {
            id: "wrong",
            definition: { event: "collections.delete", handle() {} },
          },
        ],
      }),
    /hooks.collections/,
  );
});

test("typed settings reject invalid definitions and exact values, adding fields uses defaults", () => {
  const definition = parseSettingsDefinition({
    title: "Settings",
    fields: {
      enabled: { type: "boolean", label: "Enabled", default: true },
      title: { type: "string", label: "Title", default: "x", maxLength: 5 },
      mode: {
        type: "select",
        label: "Mode",
        default: "one",
        options: [{ value: "one", label: "One" }],
      },
    },
  });
  assert.deepEqual(
    resolveSettingsValues(definition, { enabled: false, oldField: "removed" }),
    { enabled: false, title: "x", mode: "one" },
  );
  assert.throws(() =>
    validateSettingsValues(definition, {
      enabled: true,
      title: "longer than five",
      mode: "one",
    }),
  );
  assert.throws(() =>
    validateSettingsValues(definition, {
      enabled: true,
      title: "x",
      mode: "missing",
    }),
  );
  assert.throws(() =>
    parseSettingsDefinition({
      title: "Bad",
      fields: {
        number: {
          type: "number",
          label: "Number",
          default: 5,
          min: 10,
          max: 1,
        },
      },
    }),
  );
  assert.throws(() =>
    parseSettingsDefinition({
      title: "Bad",
      fields: {
        constructor: { type: "boolean", label: "Bad", default: false },
      },
    }),
  );
});
