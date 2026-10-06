export const tagLimits = Object.freeze({ count: 100, length: 120 });

export class TagValueError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "TagValueError";
    this.code = code;
  }
}

/** Normalize only explicit writes; presentation changes never rewrite records. */
export function parseTags(value, required = false) {
  if (!Array.isArray(value) || value.some((tag) => typeof tag !== "string")) {
    throw new TagValueError("type", "Tags must be an array of strings");
  }
  if (value.length > tagLimits.count) {
    throw new TagValueError("count", `Maximum ${tagLimits.count} tags`);
  }
  if (required && value.length === 0) {
    throw new TagValueError("required", "At least one tag is required");
  }
  const tags = [];
  const seen = new Set();
  for (const entry of value) {
    if (/[\u0000-\u001f\u007f]/u.test(entry)) {
      throw new TagValueError(
        "control",
        "Tags cannot contain control characters",
      );
    }
    const tag = entry.trim();
    if (!tag) {
      throw new TagValueError("empty", "Tags cannot be empty");
    }
    if (tag.length > tagLimits.length) {
      throw new TagValueError(
        "length",
        `Maximum ${tagLimits.length} characters per tag`,
      );
    }
    if (seen.has(tag)) {
      throw new TagValueError(
        "duplicate",
        "Tags must be unique after trimming",
      );
    }
    seen.add(tag);
    tags.push(tag);
  }
  return tags;
}
