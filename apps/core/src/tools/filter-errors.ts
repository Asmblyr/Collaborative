import { ItemError } from "../items/validation.js";

const groupHint =
  'filter must be JSON text for a group: {"logic":"and","children":[{"field":"<path from filterPaths>","op":"eq","value":"<text>"}]}. Do not use a single condition, a Directus-style object or the text "null". For search without a filter pass filter=""; actual JSON null inherits the caller defaults.';

/** Fixed reasons only: never echo a rejected field, operand or database error. */
export function filterToolError(error: ItemError): object | null {
  const message = error.message;
  let reason: string;
  let hint: string;

  if (/^Invalid filter JSON$/.test(message)) {
    reason = "INVALID_JSON";
    hint = groupHint;
  } else if (
    /^(Invalid filter( node| group| list)?|Filter must be a group)$/.test(
      message,
    )
  ) {
    reason = "INVALID_GROUP";
    hint = groupHint;
  } else if (/^Invalid filter condition$/.test(message)) {
    reason = "INVALID_CONDITION";
    hint =
      'A condition has only field, op, value and optional quantifier. Use technical paths from filterPaths, op="eq" or another documented operator, and scalar values as strings. Wrap conditions in a logic/children group.';
  } else if (/^Invalid filter value(?::|$)/.test(message)) {
    reason = "INVALID_VALUE";
    hint =
      'Every scalar operand must be a string of at most 255 characters matching the field type in filterPaths: "true"/"false" for booleans, a numeric string for numbers, a valid ID for keys. in/notIn require 1-20 strings; between/notBetween exactly two. Text patterns must not be empty.';
  } else if (/^Unexpected filter value$/.test(message)) {
    reason = "UNEXPECTED_VALUE";
    hint =
      "Omit value entirely for isNull/notNull/isEmpty/notEmpty/exists/notExists; do not pass value=null.";
  } else if (
    /^(Invalid|Unknown|Unsupported) filter field(?::|$)/.test(message) ||
    /^Unknown relat(?:ion|ed collection):/.test(message)
  ) {
    reason = "INVALID_PATH";
    hint =
      "Choose the exact technical path from this collection's filterPaths. Only one relation level is supported; an alias itself is not a scalar field. Do not guess display labels or hidden fields.";
  } else if (
    /^(Invalid filter operator|Primary key cannot be null)$/.test(message)
  ) {
    reason = "INVALID_OPERATOR";
    hint =
      "Choose an operator matching the filterPaths type: contains/startsWith/endsWith for text or email, ranges for numeric/date fields, eq/in for keys and booleans. A primary key cannot be null.";
  } else if (/^Invalid relation quantifier$/.test(message)) {
    reason = "INVALID_QUANTIFIER";
    hint =
      "Use quantifier=some or none only for a to-many relation path; omit it for direct fields, M2O and exists/notExists.";
  } else if (/^Relation existence requires a related field$/.test(message)) {
    reason = "INVALID_EXISTENCE";
    hint =
      "exists/notExists require a relation.primaryKey path from filterPaths, without value or quantifier.";
  } else if (/^Too many filter (nodes|conditions)$/.test(message)) {
    reason = "FILTER_LIMIT";
    hint = "Use at most 20 conditions, 30 nodes and three group levels.";
  } else {
    return null;
  }

  return {
    code: "INVALID_FILTER",
    error: "Invalid filter.",
    reason,
    hint: `${hint} Correct the arguments before retrying; a validation error does not establish whether a record exists.`,
  };
}
