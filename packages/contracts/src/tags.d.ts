export const tagLimits: Readonly<{ count: 100; length: 120 }>;
export type TagErrorCode =
  | "type"
  | "count"
  | "required"
  | "control"
  | "empty"
  | "length"
  | "duplicate";
export class TagValueError extends Error {
  readonly code: TagErrorCode;
  constructor(code: TagErrorCode, message: string);
}
export function parseTags(value: unknown, required?: boolean): string[];
