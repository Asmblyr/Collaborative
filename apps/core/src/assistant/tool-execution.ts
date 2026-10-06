import { createHash } from "node:crypto";
import { toolDiagnosticCode, unavailableToolResult } from "../tools/errors.js";
import type { ToolCall } from "./provider-step.js";
import type { AssistantRun } from "./tool-contract.js";

function canonical(value: unknown, depth = 0): unknown {
  if (depth > 64) {
    throw new Error("Arguments are too deeply nested");
  }
  if (Array.isArray(value)) {
    return value.map((entry) => canonical(entry, depth + 1));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, canonical(entry, depth + 1)]),
    );
  }
  return value;
}

/** Failed-call fingerprints live only for this turn; arguments never enter telemetry. */
export function createToolExecutor(
  run: AssistantRun | undefined,
  signal: AbortSignal,
) {
  const failed = new Set<string>();
  let finalize = false;
  return {
    get finalize() {
      return finalize;
    },
    async execute(tool: ToolCall): Promise<object> {
      signal.throwIfAborted();
      let args: unknown;
      let invalid = false;
      let raw = "";
      let normalized = "";
      try {
        raw =
          typeof tool.arguments === "string"
            ? tool.arguments
            : JSON.stringify(tool.arguments);
        if (!raw || raw.length > 12000) {
          invalid = true;
        } else {
          args = JSON.parse(raw);
          normalized = JSON.stringify(canonical(args));
        }
      } catch {
        invalid = true;
      }
      const fingerprint = createHash("sha256")
        .update(tool.name)
        .update("\0")
        .update(invalid ? raw : normalized)
        .digest("hex");
      if (failed.has(fingerprint)) {
        finalize = true;
        return {
          code: "REPEATED_TOOL_ERROR",
          error:
            "The same request already failed in this turn; it was not executed again.",
          hint: "Give a final answer from successful results. Explain what is unknown; do not infer data from errors.",
        };
      }
      const result = invalid
        ? {
            code: "INVALID_JSON",
            error: "Invalid JSON arguments.",
            hint: "Use a complete JSON object matching the advertised tool schema, up to 12000 characters.",
          }
        : ((await run?.tools?.execute(tool.name, args, signal)) ??
          unavailableToolResult);
      signal.throwIfAborted();
      if (toolDiagnosticCode(result)) {
        failed.add(fingerprint);
      }
      return result;
    },
  };
}
