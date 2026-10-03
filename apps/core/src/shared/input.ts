export class InputError extends Error {
  readonly statusCode = 400;
}

export function objectInput(
  value: unknown,
  allowedKeys: string[],
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new InputError("Invalid input");
  }
  if (Object.keys(value).some((key) => !allowedKeys.includes(key))) {
    throw new InputError("Invalid input");
  }
  return value as Record<string, unknown>;
}

export function textInput(
  value: unknown,
  maxLength: number,
  allowEmpty = false,
): string {
  if (typeof value !== "string") {
    throw new InputError(`Expected text up to ${maxLength} characters`);
  }

  const text = value.trim();
  const hasInvalidLength = (!allowEmpty && !text) || text.length > maxLength;
  const hasControlCharacters = /[\u0000-\u001f\u007f]/.test(value);
  if (hasInvalidLength || hasControlCharacters) {
    throw new InputError(`Expected text up to ${maxLength} characters`);
  }
  return text;
}
