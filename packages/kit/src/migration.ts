import type { CollectionFieldDefinition } from "./collection.js";

export type MigrationOperation =
  | {
      readonly type: "addField";
      readonly collection: string;
      readonly name: string;
      readonly field: CollectionFieldDefinition;
    }
  | {
      readonly type: "addIndex";
      readonly collection: string;
      readonly name: string;
      readonly fields: readonly string[];
    };

export interface MigrationDefinition {
  /** Immutable, ordered operations. Names refer only to this plugin's collections. */
  readonly operations: readonly MigrationOperation[];
}

/** Core validates and executes the plan in its installation transaction. */
export function defineMigration(definition: MigrationDefinition): MigrationDefinition {
  return definition;
}
