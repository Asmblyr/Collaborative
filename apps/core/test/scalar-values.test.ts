import assert from "node:assert/strict";
import test from "node:test";
import {
  parseCalendarDate,
  parseBigintString,
} from "@asmblyr-collaborative/contracts";
import { fieldTypeFromDatabase } from "../src/collections/field-types.js";

test("calendar dates reject rollover, timezone and implicit Date coercion", () => {
  for (const date of [
    "0001-01-01",
    "0099-02-28",
    "2000-02-29",
    "2026-10-04",
    "9999-12-31",
  ]) {
    assert.equal(parseCalendarDate(date), date);
  }
  for (const value of [
    "0000-01-01",
    "1900-02-29",
    "2026-02-29",
    "2026-04-31",
    "2026-00-01",
    "2026-13-01",
    "2026-10-04T00:00:00Z",
    "2026-1-1",
    new Date(),
    20261004,
    "infinity",
  ]) {
    assert.throws(() => parseCalendarDate(value));
  }
});

test("int8 accepts only exact canonical signed strings across the full range", () => {
  for (const value of [
    "0",
    "-1",
    "9007199254740993",
    "-9223372036854775808",
    "9223372036854775807",
  ]) {
    assert.equal(parseBigintString(value), value);
  }
  for (const value of [
    "9223372036854775808",
    "-9223372036854775809",
    "-0",
    "01",
    "+1",
    "1.0",
    "1e3",
    " 1",
    1,
    9007199254740993,
    1n,
  ]) {
    assert.throws(() => parseBigintString(value));
  }
  assert.equal(fieldTypeFromDatabase("character varying"), "text");
  assert.equal(fieldTypeFromDatabase("varchar", "email"), "email");
  assert.equal(fieldTypeFromDatabase("bigint"), "bigint");
  assert.equal(fieldTypeFromDatabase("date"), "date");
  assert.equal(fieldTypeFromDatabase("timestamp without time zone"), null);
});
