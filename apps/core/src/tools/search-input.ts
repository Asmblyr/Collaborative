import { ToolArgumentError } from "./errors.js";

/** Nullable model arguments must not accidentally become a literal text search. */
export function parseToolSearch(value: unknown, fallback = ""): string {
  if (value === "null") {
    throw new ToolArgumentError(
      "INVALID_ARGUMENTS",
      'q="null" is not a default. Use actual JSON null to inherit defaults, or q="" to clear search. To intentionally search the literal word null, use q="NULL" (search is case-insensitive) or a text filter with value="null". Correct q before retrying; no search was executed.',
      ["q"],
    );
  }
  const resolved = value === null ? fallback : value;
  if (typeof resolved !== "string" || resolved.length > 100) {
    throw new ToolArgumentError(
      "INVALID_ARGUMENTS",
      'q must be a string of at most 100 characters or actual JSON null; use q="" to clear search.',
      ["q"],
    );
  }
  return resolved;
}
