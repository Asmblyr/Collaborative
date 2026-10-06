import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  isColumnWidth,
  reconcileColumnWidths,
} from "@asmblyr-collaborative/contracts";
import { reconcileColumns } from "../src/components/items/column-state";
import { beginColumnResize } from "../src/components/items/column-width";
import { ColumnResizeHandle } from "../src/components/items/column-resize-handle";

test("saved widths survive hiding and ordering, while inaccessible or invalid fields are discarded", () => {
  const names = ["id", "title", "new_field"];
  assert.deepEqual(
    reconcileColumns(
      JSON.stringify({
        order: ["title", "removed", "id"],
        hidden: ["title", "title", "removed"],
        widths: { title: 400, id: 80, removed: 200, new_field: "100" },
      }),
      names,
    ),
    {
      order: ["title", "id", "new_field"],
      hidden: ["title"],
      widths: { title: 400, id: 80 },
    },
  );
  for (const raw of [
    "bad",
    "null",
    "[]",
    '{"order":[],"hidden":["id","title","new_field"]}',
  ]) {
    assert.deepEqual(reconcileColumns(raw, names), {
      order: names,
      hidden: [],
      widths: {},
    });
  }
  for (const width of [79, 1201, 100.5, NaN, Infinity, "100", null, true]) {
    assert.equal(isColumnWidth(width), false);
  }
  assert.equal(isColumnWidth(1200), true);
  assert.deepEqual(reconcileColumnWidths(null, names), {});
  const special = reconcileColumnWidths(
    JSON.parse('{"__proto__":200,"constructor":80}'),
    ["__proto__", "constructor"],
  );
  assert.equal(Object.getPrototypeOf(special), Object.prototype);
  assert.equal(Object.hasOwn(special, "__proto__"), true);
  assert.equal(special["__proto__"], 200);
});

test("drag previews change one column with bounded table overflow and cancellation restores styles", () => {
  const first = { dataset: { columnSize: "id" }, style: { width: "148px" } };
  const target = {
    dataset: { columnSize: "title" },
    style: { width: "360px" },
  };
  const table = {
    style: { minWidth: "556px", userSelect: "text" },
    querySelectorAll: () => [first, target],
  };
  const handle = { closest: () => table } as unknown as HTMLElement;
  const gesture = beginColumnResize(handle, "title", 100)!;
  assert.equal(gesture.update(140), 400);
  assert.equal(target.style.width, "400px");
  assert.equal(first.style.width, "148px");
  assert.equal(table.style.minWidth, "596px");
  assert.equal(table.style.userSelect, "none");
  assert.equal(gesture.update(-500), 80);
  assert.equal(table.style.minWidth, "276px");
  assert.equal(gesture.update(10000), 1200);
  gesture.restore();
  gesture.restore();
  assert.deepEqual(table.style, { minWidth: "556px", userSelect: "text" });
  assert.equal(target.style.width, "360px");
  assert.equal(gesture.width, 1200);
  assert.equal(beginColumnResize(handle, "missing", 0), null);
});

test("resize handle exposes an accessible focusable separator rather than a sort or drag button", () => {
  const html = renderToStaticMarkup(
    createElement(ColumnResizeHandle, {
      name: "title",
      label: "Название",
      width: 360,
      onResize() {},
    }),
  );
  assert.match(html, /role="separator"/);
  assert.match(html, /aria-orientation="vertical"/);
  assert.match(html, /aria-valuenow="360"/);
  assert.match(html, /tabindex="0"/);
  assert.match(html, /draggable="false"/);
  assert.match(html, /Изменить ширину столбца Название/);
});
