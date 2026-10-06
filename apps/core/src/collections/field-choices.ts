import type { FieldPresentation } from "@asmblyr-collaborative/contracts";
import { CollectionInputError } from "./validation.js";

export function parseFieldChoices(
  input: unknown,
  type: string,
): NonNullable<FieldPresentation["options"]> {
  const fail = (): never => {
    throw new CollectionInputError(
      "Supply 1–100 distinct choices with typed value and label",
    );
  };
  if (!Array.isArray(input) || !input.length || input.length > 100) {
    return fail();
  }
  const options = input.map((choice) => {
    if (
      !choice ||
      typeof choice !== "object" ||
      Array.isArray(choice) ||
      Object.keys(choice).some((key) => !["value", "label"].includes(key)) ||
      typeof choice.label !== "string" ||
      !choice.label.trim() ||
      choice.label.length > 120 ||
      choice.label.includes("\0")
    ) {
      return fail();
    }
    const value = choice.value;
    if (type === "integer") {
      if (
        typeof value !== "number" ||
        !Number.isInteger(value) ||
        value < -2147483648 ||
        value > 2147483647
      ) {
        return fail();
      }
    } else if (
      typeof value !== "string" ||
      !value.trim() ||
      value.length > 120 ||
      value.includes("\0")
    ) {
      return fail();
    }
    return { value: value as string | number, label: choice.label.trim() };
  });
  if (new Set(options.map((choice) => choice.value)).size !== options.length) {
    throw new CollectionInputError("Duplicate choice values");
  }
  return options;
}
