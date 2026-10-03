import type { FieldExtension, JsonRecord, JsonValue } from "@asmblyr/contracts";
import { CollectionInputError } from "./validation.js";

/** A disabled plugin's settings remain readable and editable without its code. */
export function parseFieldExtension(
  value: unknown,
  type: string,
): FieldExtension {
  if (type !== "text") {
    throw new CollectionInputError(
      "Field extensions currently require text storage",
    );
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CollectionInputError("Expected field extension settings");
  }

  const entry = value as Record<string, unknown>;
  if (
    Object.keys(entry).some((key) => !["id", "options"].includes(key)) ||
    typeof entry.id !== "string" ||
    !/^[a-z][a-z0-9_]{0,30}:[a-z][a-z0-9-]{0,63}$/.test(entry.id)
  ) {
    throw new CollectionInputError("Expected a namespaced field extension ID");
  }

  const options = entry.options === undefined ? {} : entry.options;
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new CollectionInputError(
      "Field extension options must be a JSON object",
    );
  }

  let nodes = 0;
  function parseJson(input: unknown, depth: number): JsonValue {
    nodes += 1;
    if (depth > 8 || nodes > 1000) {
      throw new CollectionInputError("Field extension options are too complex");
    }
    if (input === null || typeof input === "boolean") {
      return input;
    }
    if (
      typeof input === "string" &&
      input.length <= 8192 &&
      !input.includes("\0")
    ) {
      return input;
    }
    if (typeof input === "number" && Number.isFinite(input)) {
      return input;
    }
    if (Array.isArray(input)) {
      return input.map((item) => parseJson(item, depth + 1));
    }
    if (
      input &&
      typeof input === "object" &&
      Object.getPrototypeOf(input) === Object.prototype
    ) {
      const entries = Object.entries(input);
      if (
        entries.some(
          ([key]) =>
            ["__proto__", "constructor", "prototype"].includes(key) ||
            key.includes("\0"),
        )
      ) {
        throw new CollectionInputError("Invalid field extension option key");
      }
      return Object.fromEntries(
        entries.map(([key, item]) => [key, parseJson(item, depth + 1)]),
      );
    }
    throw new CollectionInputError(
      "Field extension options must contain JSON values",
    );
  }

  const parsed = parseJson(options, 0) as JsonRecord;
  if (Buffer.byteLength(JSON.stringify(parsed), "utf8") > 8192) {
    throw new CollectionInputError("Field extension options exceed 8 KiB");
  }

  return { id: entry.id, options: parsed };
}
