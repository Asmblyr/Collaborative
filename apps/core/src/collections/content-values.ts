import { richTextSanitizerOptions } from "@asmblyr-collaborative/contracts";
import type { FieldConstraints } from "@asmblyr-collaborative/contracts";
export type { FieldConstraints } from "@asmblyr-collaborative/contracts";
import sanitizeHtml from "sanitize-html";
import { decodeHTML } from "entities";
import { CollectionInputError } from "./validation.js";

export function parseConstraints(
  value: unknown,
  type: string,
): FieldConstraints {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new CollectionInputError("Invalid field constraints");
  const result = value as FieldConstraints;
  const keys =
    type === "text" || type === "email"
      ? ["minLength", "maxLength"]
      : type === "integer"
        ? ["min", "max"]
        : [];
  for (const [key, bound] of Object.entries(result)) {
    if (
      !keys.includes(key) ||
      !Number.isInteger(bound) ||
      (key.endsWith("Length")
        ? bound < 0 || bound > 100000
        : bound < -2147483648 || bound > 2147483647)
    ) {
      throw new CollectionInputError(
        "Invalid or incompatible field constraint",
      );
    }
  }
  if (
    (result.minLength ?? 0) > (result.maxLength ?? Infinity) ||
    (result.min ?? -Infinity) > (result.max ?? Infinity)
  ) {
    throw new CollectionInputError("Minimum must not exceed maximum");
  }
  return result;
}

export function safeHtml(value: string): string {
  return sanitizeHtml(value, richTextSanitizerOptions);
}

export function parseContentValue(
  value: string | number,
  presentation:
    | { interface?: string; constraints?: FieldConstraints }
    | undefined,
  required = false,
) {
  let output = value;
  const editor = presentation?.interface;
  if (typeof output === "string" && editor === "url") {
    try {
      const url = new URL(output);
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password ||
        /\s/.test(output)
      )
        throw new Error();
    } catch {
      throw new Error(
        "Supply an absolute HTTP or HTTPS URL without credentials",
      );
    }
  }
  if (typeof output === "string" && editor === "richtext") {
    if (output.length > 100000)
      throw new Error("Formatted text exceeds 100000 characters");
    output = safeHtml(output);
  }
  const plain =
    typeof output === "string" && editor === "richtext"
      ? decodeHTML(
          sanitizeHtml(output, { allowedTags: [], allowedAttributes: {} }),
        ).trim()
      : output;
  if (required && typeof plain === "string" && !plain.trim())
    throw new Error("Field requires a nonempty value");
  const bounds = presentation?.constraints;
  if (
    typeof plain === "string" &&
    bounds &&
    (Array.from(plain).length < (bounds.minLength ?? 0) ||
      Array.from(plain).length > (bounds.maxLength ?? Infinity))
  ) {
    throw new Error("Text length is outside configured limits");
  }
  if (
    typeof plain === "number" &&
    bounds &&
    (plain < (bounds.min ?? -Infinity) || plain > (bounds.max ?? Infinity))
  )
    throw new Error("Number is outside configured limits");
  return output;
}
