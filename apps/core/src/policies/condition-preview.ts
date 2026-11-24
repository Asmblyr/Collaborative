import type { Knex } from "knex";
import type { PermissionFilter } from "@asmblyr-collaborative/contracts";
import type { Principal } from "../auth/principal.js";
import { applyItemFilters } from "../items/filter-query.js";
import { collectionSchema } from "../items/schema-repository.js";
import {
  compileRowFilter,
  parseRowFilter,
  permissionContext,
} from "../permissions/row-filter.js";
import { objectInput } from "../shared/input.js";
import { PolicyInputError } from "./validation.js";

const collectionNamePattern = /^[a-z][a-z0-9_]{0,62}$/;

export interface ConditionPreviewInput {
  collection: string;
  condition: PermissionFilter | null;
}

export interface ConditionPreviewResult {
  matchingCount: number;
  totalCount: number;
}

export function parseConditionPreviewInput(
  body: unknown,
): ConditionPreviewInput {
  const input = objectInput(body, ["collection", "condition"]);
  if (
    typeof input.collection !== "string" ||
    !collectionNamePattern.test(input.collection) ||
    /^(asmblyr_|plugin_)/i.test(input.collection)
  ) {
    throw new PolicyInputError("Invalid collection name");
  }
  if (!Object.hasOwn(input, "condition")) {
    throw new PolicyInputError("Condition is required");
  }
  const condition = parseRowFilter(input.condition);
  return { collection: input.collection, condition };
}

export async function previewPolicyCondition(
  database: Knex,
  principal: Principal,
  body: unknown,
): Promise<ConditionPreviewResult> {
  const { collection, condition } = parseConditionPreviewInput(body);
  const schema = await collectionSchema(database, collection);
  const compiled = condition
    ? compileRowFilter(condition, collection, schema, {
        "service.id": "00000000-0000-4000-8000-000000000000",
        "user.id": "00000000-0000-4000-8000-000000000000",
        "user.email": "preview@example.test",
        ...permissionContext(principal),
      })
    : null;

  const totalQuery = database(collection)
    .withSchema("public")
    .count<{ count: string }>("* as count")
    .first();

  if (!compiled) {
    const totalRow = await totalQuery;
    const totalCount = Number(totalRow?.count ?? 0);
    return { matchingCount: totalCount, totalCount };
  }

  const matchingQuery = database(collection).withSchema("public");
  applyItemFilters(matchingQuery, compiled, database, collection);
  const [totalRow, matchingRow] = await Promise.all([
    totalQuery,
    matchingQuery.count<{ count: string }>("* as count").first(),
  ]);
  return {
    matchingCount: Number(matchingRow?.count ?? 0),
    totalCount: Number(totalRow?.count ?? 0),
  };
}
