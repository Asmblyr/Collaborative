import assert from "node:assert/strict";
import test from "node:test";
import { safeNext } from "../src/lib/safe-next";

test("login keeps a record link and its table query", () => {
  const path = "/items/shops/4?page=2&filter=%7B%7D#details";
  assert.equal(safeNext(path), path);
});

test("login return paths cannot redirect outside the app", () => {
  for (const path of [null, "", "https://example.com", "//example.com", "/\\example.com",
    "/\t/example.com", "/\n/example.com", "/a/..//example.com", "/\n/["]) {
    assert.equal(safeNext(path), "/", JSON.stringify(path));
  }
});
