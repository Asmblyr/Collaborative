import assert from "node:assert/strict";
import test from "node:test";
import { parseFieldPresentation } from "../src/collections/field-presentation-validation.js";
import { parseFieldExtension } from "../src/collections/field-extension.js";

test("field extension settings survive without installed plugin code", () => {
  const extension = {
    id: "custom_plugin:picker",
    options: { palette: ["#123456"], allowCustom: false },
  };
  const result = parseFieldPresentation(
    { extension, constraints: { maxLength: 7 } },
    "text",
  );
  assert.deepEqual(result.extension, extension);
  assert.equal(result.interface, "auto");
  assert.deepEqual(result.constraints, { maxLength: 7 });
  assert.deepEqual(
    parseFieldExtension({ id: "color:picker" }, "text").options,
    {},
  );
});

test("field extensions cannot replace storage types or combine with content parsers", () => {
  const extension = { id: "color:picker", options: {} };
  for (const type of ["integer", "json", "relation", "alias", "email"]) {
    assert.throws(
      () => parseFieldPresentation({ extension }, type),
      /text storage/,
    );
  }
  for (const editor of ["select", "markdown", "richtext"]) {
    assert.throws(
      () => parseFieldPresentation({ extension, interface: editor }, "text"),
      /fallback/,
    );
  }
});

test("extension metadata rejects unsafe, non-JSON and oversized options", () => {
  const parse = (options: unknown) =>
    parseFieldExtension({ id: "color:picker", options }, "text");
  for (const options of [
    null,
    [],
    { value: NaN },
    { value: undefined },
    { value: new Date() },
    { value: () => 1 },
    JSON.parse('{"__proto__":{}}'),
  ]) {
    assert.throws(() => parse(options));
  }
  assert.throws(() => parse({ value: "я".repeat(5000) }), /8 KiB/);
  assert.throws(() => parse({ value: Array(1001).fill(1) }), /complex/);
  let deep: object = {};
  for (let i = 0; i < 10; i += 1) {
    deep = { child: deep };
  }
  assert.throws(() => parse(deep), /complex/);
  for (const id of ["picker", "../color:picker", "color:a/b", "Color:picker"]) {
    assert.throws(
      () => parseFieldExtension({ id, options: {} }, "text"),
      /namespaced/,
    );
  }
});
