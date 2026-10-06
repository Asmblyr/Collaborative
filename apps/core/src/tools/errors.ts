import { ActionInputError, EndpointError } from "@asmblyr-collaborative/kit";
import { InputError } from "../shared/input.js";
import { ItemError } from "../items/validation.js";
import { AccessDeniedError } from "../permissions/access.js";
import { connectionToolError } from "../connections/tool-errors.js";
import { filterToolError } from "./filter-errors.js";

export const unavailableToolResult = {
  code: "REQUEST_UNAVAILABLE",
  error: "Request unavailable, invalid or timed out.",
  hint: "Access or schema may have changed. Describe the collection again before retrying. Do not infer data from this error.",
};

export class ToolArgumentError extends Error {
  constructor(
    readonly code: "INVALID_ARGUMENTS" | "SCHEMA_REQUIRED",
    readonly hint: string,
    readonly argumentNames?: string[],
  ) {
    super(
      code === "SCHEMA_REQUIRED"
        ? "Collection schema is required."
        : "Invalid tool arguments.",
    );
  }
}

/** Only fixed diagnostics cross MCP; database errors and operand values stay private. */
export function toolErrorResult(error: unknown): object {
  if (
    error instanceof AccessDeniedError ||
    ((error instanceof ItemError || error instanceof EndpointError) &&
      error.statusCode === 403)
  ) {
    return {
      code: "PERMISSION_DENIED",
      error:
        "Недостаточно прав для этого действия или данные недоступны для MCP.",
      hint: "Do not retry this operation or infer unavailable fields or records.",
    };
  }
  if (error instanceof ToolArgumentError) {
    return {
      code: error.code,
      error: error.message,
      hint: error.hint,
      ...(error.argumentNames ? { arguments: error.argumentNames } : {}),
    };
  }
  if (error instanceof ActionInputError) {
    return {
      code: "INVALID_ARGUMENTS",
      error: error.message,
      hint: "Correct the input according to the advertised plugin schema.",
    };
  }
  const connectionError = connectionToolError(error);
  if (connectionError) {
    return connectionError;
  }
  if (error instanceof ItemError && error.statusCode === 409) {
    return {
      code: "SCHEMA_CHANGED",
      error: "Collection schema changed.",
      hint: "Start a new request and describe the collection again; do not use a replacement collection in this turn.",
    };
  }
  if (
    error instanceof InputError ||
    (error instanceof ItemError && error.statusCode === 400)
  ) {
    if (error instanceof ItemError) {
      const filterDiagnostic = filterToolError(error);
      if (filterDiagnostic) {
        return filterDiagnostic;
      }
    }
    const filterError =
      error instanceof ItemError &&
      /filter|quantifier|relation existence|unknown relation/i.test(
        error.message,
      );
    return {
      code: filterError ? "INVALID_FILTER" : "INVALID_ARGUMENTS",
      error: filterError ? "Invalid filter." : "Invalid tool arguments.",
      hint: filterError
        ? "Use filterPaths from describe_collection and the documented logic/children/field/op/value syntax. Scalar values must be strings; relation paths have one level. Change the invalid filter before retrying."
        : "Provide all advertised arguments. Use null for nullable defaults and only fields with readableValue=true, the primary key or readable timestamps. Related arrays are not readable values; query the related collection.",
    };
  }
  return unavailableToolResult;
}

/** Persist a fixed code only, never an arbitrary plugin error or exception message. */
export function toolDiagnosticCode(result: object): string | null {
  if (
    !("error" in result) &&
    !("isError" in result && result.isError === true)
  ) {
    return null;
  }
  const allowed = new Set([
    "INVALID_ARGUMENTS",
    "INVALID_FILTER",
    "INVALID_JSON",
    "SCHEMA_REQUIRED",
    "SCHEMA_CHANGED",
    "PERMISSION_DENIED",
    "REQUEST_UNAVAILABLE",
    "REPEATED_TOOL_ERROR",
  ]);
  return "code" in result &&
    typeof result.code === "string" &&
    allowed.has(result.code)
    ? result.code
    : "TOOL_ERROR";
}
