import assert from "node:assert/strict";
import test from "node:test";
import { ItemError } from "../src/items/validation.js";
import { InputError } from "../src/shared/input.js";
import { AccessDeniedError } from "../src/permissions/access.js";
import { toolErrorResult, ToolArgumentError } from "../src/tools/errors.js";
import { AssistantTurnMetrics } from "../src/assistant/telemetry/turn-metrics.js";

test("safe validation hints distinguish schema, input, filter and permission failures", () => {
  const cases = [
    [
      new ToolArgumentError(
        "SCHEMA_REQUIRED",
        "Call describe_collection first.",
      ),
      "SCHEMA_REQUIRED",
    ],
    [new InputError("private-input"), "INVALID_ARGUMENTS"],
    [
      new ItemError("Invalid filter value: private-field", 400),
      "INVALID_FILTER",
    ],
    [new ItemError("Collection private-name changed", 409), "SCHEMA_CHANGED"],
    [new AccessDeniedError(), "PERMISSION_DENIED"],
    [new ItemError("private-name", 403), "PERMISSION_DENIED"],
    [new Error("SQL SELECT password, private-secret"), "REQUEST_UNAVAILABLE"],
  ] as const;
  for (const [error, code] of cases) {
    const result = toolErrorResult(error) as {
      code: string;
      error: string;
      hint: string;
    };
    assert.equal(result.code, code);
    assert.ok(result.hint.length > 0);
    assert.ok(!JSON.stringify(result).includes("private-"));
    assert.ok(!JSON.stringify(result).includes("SELECT"));
  }
});

test("filter repair hints explain the failing part without reflecting operands or fields", () => {
  const cases = [
    ["Invalid filter JSON", "INVALID_JSON"],
    ["Invalid filter node", "INVALID_GROUP"],
    ["Filter must be a group", "INVALID_GROUP"],
    ["Invalid filter condition", "INVALID_CONDITION"],
    ["Invalid filter value: private-field", "INVALID_VALUE"],
    ["Unexpected filter value", "UNEXPECTED_VALUE"],
    ["Unknown relation: private-field", "INVALID_PATH"],
    ["Unknown related collection: private-field", "INVALID_PATH"],
    ["Unsupported filter field: private-field", "INVALID_PATH"],
    ["Primary key cannot be null", "INVALID_OPERATOR"],
    ["Invalid relation quantifier", "INVALID_QUANTIFIER"],
    ["Relation existence requires a related field", "INVALID_EXISTENCE"],
    ["Too many filter conditions", "FILTER_LIMIT"],
  ];
  for (const [message, reason] of cases) {
    const result = toolErrorResult(new ItemError(message!, 400)) as {
      code: string;
      reason: string;
      hint: string;
    };
    assert.equal(result.code, "INVALID_FILTER");
    assert.equal(result.reason, reason);
    assert.ok(result.hint.includes("Correct the arguments"));
    assert.ok(!JSON.stringify(result).includes("private-field"));
  }
});

test("bounded tool trace retains counters and handles thrown exceptions without saving them", async () => {
  const metrics = new AssistantTurnMetrics("turn", "model");
  await metrics.recordTool(
    async () => ({ ok: true, rows: "private-result" }),
    "search_items",
  );
  await assert.rejects(
    metrics.recordTool(async () => {
      throw new Error("private-exception");
    }, "read_item"),
  );
  for (let i = 0; i < 33; i++) {
    await metrics.recordTool(
      async () => ({ error: "private-error", code: "INVALID_FILTER" }),
      "validate_filter",
    );
  }
  const summary = metrics.finish("failed");
  assert.equal(summary.toolCalls, 35);
  assert.equal(summary.toolErrors, 34);
  assert.equal(summary.toolTrace?.length, 32);
  assert.deepEqual(summary.toolTrace?.[1], {
    index: 2,
    name: "read_item",
    durationMs: summary.toolTrace?.[1].durationMs,
    status: "failed",
    errorCode: "TOOL_ERROR",
  });
  assert.ok(summary.toolTrace?.every((entry) => entry.durationMs >= 0));
  assert.ok(!JSON.stringify(summary).includes("private-"));
  summary.toolTrace![0].name = "changed";
  assert.equal(metrics.finish("failed").toolTrace?.[0].name, "search_items");
});
