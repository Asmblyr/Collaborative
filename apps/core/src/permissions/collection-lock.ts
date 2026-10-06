import type { Knex } from "knex";
import { PermissionInputError } from "./validation.js";

export async function lockPermissionCollection(
  transaction: Knex.Transaction,
  name: string,
): Promise<void> {
  const source = await transaction("asmblyr_collections")
    .withSchema("public")
    .where({ name })
    .first("source_kind");
  if (source?.source_kind !== "materialized-view") {
    await transaction.raw("LOCK TABLE ?? IN ACCESS SHARE MODE", [
      `public.${name}`,
    ]);
  }
}

export async function validateSourcePermission(
  transaction: Knex.Transaction,
  name: string,
  action: string,
): Promise<void> {
  if (action === "read") {
    return;
  }
  const source = await transaction("asmblyr_collections")
    .withSchema("public")
    .where({ name })
    .first("source_kind");
  if (source?.source_kind === "materialized-view") {
    throw new PermissionInputError(
      "Materialized views permit read grants only",
    );
  }
}
