import type { FieldType } from "../collections/types.js";
import type { JsonValue } from "../collections/structured-values.js";
import type { FieldPresentation } from "../collections/field-presentation-validation.js";

export interface ItemField {
  name: string;
  type: FieldType | "relation" | null;
  relation?: { collection: string; primaryKeyType: "uuid" | "serial" | "bigserial" | "text" };
  required: boolean;
  nullable: boolean;
  defaultValue?: JsonValue;
  presentation?: FieldPresentation;
  searchable?: boolean;
}
