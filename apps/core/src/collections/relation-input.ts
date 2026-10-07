import {
  CollectionInputError,
  parseMutableCollectionName,
  parseMutableFieldName,
} from "./validation.js";

export type DeleteAction = "restrict" | "setNull" | "setDefault" | "cascade";

interface ForeignKeyOptions {
  required: boolean;
  nullable: boolean;
  onDelete: DeleteAction;
  defaultValue?: string | number;
}

export type CreateRelationInput =
  | ({
      kind: "m2o";
      name: string;
      targetCollection: string;
      reverseField?: string;
    } & ForeignKeyOptions)
  | ({
      kind: "o2m";
      name: string;
      targetCollection: string;
      foreignKey: string;
      reuseExisting: boolean;
    } & ForeignKeyOptions)
  | {
      kind: "m2m";
      name: string;
      targetCollection: string;
      junctionCollection: string;
      sourceKey: string;
      targetKey: string;
      reverseField?: string;
      allowDuplicates: boolean;
      sourceOnDelete: "restrict" | "cascade";
      targetOnDelete: "restrict" | "cascade";
    };

function optionalName(value: unknown): string | undefined {
  return value === undefined || value === ""
    ? undefined
    : parseMutableFieldName(value);
}

function foreignKeyOptions(input: Record<string, unknown>): ForeignKeyOptions {
  if (
    (input.required !== undefined && typeof input.required !== "boolean") ||
    (input.nullable !== undefined && typeof input.nullable !== "boolean")
  ) {
    throw new CollectionInputError("Invalid required or nullable setting");
  }
  const required = input.required === true;
  const nullable =
    input.nullable === undefined ? !required : input.nullable === true;
  const onDelete = input.onDelete === undefined ? "restrict" : input.onDelete;
  if (
    onDelete !== "restrict" &&
    onDelete !== "setNull" &&
    onDelete !== "setDefault" &&
    onDelete !== "cascade"
  ) {
    throw new CollectionInputError("Invalid delete action");
  }
  if (onDelete === "setNull" && !nullable) {
    throw new CollectionInputError("SET NULL requires a nullable foreign key");
  }
  if (
    onDelete === "setDefault" &&
    ((typeof input.defaultValue !== "string" &&
      typeof input.defaultValue !== "number") ||
      (typeof input.defaultValue === "number" &&
        !Number.isSafeInteger(input.defaultValue)))
  ) {
    throw new CollectionInputError("SET DEFAULT requires a target item ID");
  }
  if (onDelete !== "setDefault" && input.defaultValue !== undefined) {
    throw new CollectionInputError(
      "Default target is only valid with SET DEFAULT",
    );
  }
  return {
    required,
    nullable,
    onDelete,
    ...(onDelete === "setDefault"
      ? { defaultValue: input.defaultValue as string | number }
      : {}),
  };
}

export function parseCreateRelation(value: unknown): CreateRelationInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CollectionInputError("Expected relation settings");
  }
  const input = value as Record<string, unknown>;
  const kind = input.kind ?? "m2o";
  const systemUser = input.targetCollection === "@users";
  if (systemUser && (kind !== "m2o" || input.reverseField)) {
    throw new CollectionInputError(
      "System users support M2O without a reverse field",
    );
  }
  if (
    systemUser &&
    (input.defaultValue !== undefined ||
      ![undefined, "restrict", "setNull"].includes(
        input.onDelete as string | undefined,
      ))
  ) {
    throw new CollectionInputError(
      "System user relations support RESTRICT or SET NULL without defaults",
    );
  }
  const common = {
    name: parseMutableFieldName(input.name),
    targetCollection: systemUser
      ? "@users"
      : parseMutableCollectionName(input.targetCollection),
  };
  const keys =
    kind === "m2o"
      ? [
          "kind",
          "name",
          "targetCollection",
          "reverseField",
          "required",
          "nullable",
          "onDelete",
          "defaultValue",
        ]
      : kind === "o2m"
        ? [
            "kind",
            "name",
            "targetCollection",
            "foreignKey",
            "reuseExisting",
            "required",
            "nullable",
            "onDelete",
            "defaultValue",
          ]
        : kind === "m2m"
          ? [
              "kind",
              "name",
              "targetCollection",
              "junctionCollection",
              "sourceKey",
              "targetKey",
              "reverseField",
              "allowDuplicates",
              "sourceOnDelete",
              "targetOnDelete",
            ]
          : null;
  if (!keys || Object.keys(input).some((key) => !keys.includes(key))) {
    throw new CollectionInputError("Invalid relation settings");
  }
  if (kind === "m2o") {
    return {
      kind,
      ...common,
      reverseField: optionalName(input.reverseField),
      ...foreignKeyOptions(input),
    };
  }
  if (kind === "o2m") {
    if (
      input.reuseExisting !== undefined &&
      typeof input.reuseExisting !== "boolean"
    ) {
      throw new CollectionInputError("Invalid reuseExisting setting");
    }
    if (
      input.reuseExisting === true &&
      ["required", "nullable", "onDelete", "defaultValue"].some(
        (key) => key in input,
      )
    ) {
      throw new CollectionInputError(
        "Existing foreign key settings cannot be changed here",
      );
    }
    return {
      kind,
      ...common,
      foreignKey: parseMutableFieldName(input.foreignKey),
      reuseExisting: input.reuseExisting === true,
      ...foreignKeyOptions(input),
    };
  }
  if (
    input.allowDuplicates !== undefined &&
    typeof input.allowDuplicates !== "boolean"
  ) {
    throw new CollectionInputError("Invalid allowDuplicates setting");
  }
  for (const action of [input.sourceOnDelete, input.targetOnDelete]) {
    if (action !== undefined && action !== "restrict" && action !== "cascade") {
      throw new CollectionInputError("Invalid junction delete action");
    }
  }
  return {
    kind: "m2m",
    ...common,
    junctionCollection: parseMutableCollectionName(input.junctionCollection),
    sourceKey: parseMutableFieldName(input.sourceKey),
    targetKey: parseMutableFieldName(input.targetKey),
    reverseField: optionalName(input.reverseField),
    allowDuplicates: input.allowDuplicates === true,
    sourceOnDelete: (input.sourceOnDelete ?? "cascade") as
      | "restrict"
      | "cascade",
    targetOnDelete: (input.targetOnDelete ?? "cascade") as
      | "restrict"
      | "cascade",
  };
}
