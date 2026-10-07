import {
  fieldConditionMatches,
  relationFilterDependencies,
  resolveRelationChoiceFilter,
} from "@asmblyr-collaborative/contracts";
import type { Knex } from "knex";
import type { MutationContext } from "./events-repository.js";
import { changedFields } from "./events-repository.js";
import type { ItemField } from "./types.js";
import { ItemError, parseItem } from "./validation.js";
import { getItem } from "./service.js";
import { requireGrant, AccessDeniedError } from "../permissions/access.js";
import { collectionSchema } from "./schema-repository.js";
import { listCollections } from "../collections/catalog-repository.js";
import { itemReadQuery } from "./read-query.js";
import { validateUserReferenceWrites } from "./user-reference-writes.js";

/** Evaluate invariants on the final row inside the ordinary mutation transaction. */
export async function applyFieldRules(
  db: Knex.Transaction,
  name: string,
  fields: Map<string, ItemField>,
  input: Record<string, unknown>,
  before: Record<string, unknown> | null,
  context: MutationContext,
  submittedFields = Object.keys(input),
): Promise<Record<string, unknown>> {
  const configured = [...fields.values()].filter(
    (f) => f.presentation?.rules || f.presentation?.relationFilter,
  );
  if (!configured.length) {
    await validateUserReferenceWrites(
      db,
      fields,
      input,
      before,
      context.access,
    );
    return input;
  }
  const values = { ...input };
  const row = {
    ...Object.fromEntries(
      [...fields.values()].map((f) => [f.name, f.defaultValue ?? null]),
    ),
    ...before,
    ...values,
  };
  const dependencies = [
    ...new Set(
      configured.flatMap((field) => [
        ...(field.presentation?.rules?.requiredWhen?.rules.map(
          (rule) => rule.field,
        ) ?? []),
        ...(field.presentation?.rules?.computed
          ? [field.presentation.rules.computed.relation]
          : []),
        ...(field.presentation?.relationFilter
          ? relationFilterDependencies(field.presentation.relationFilter)
          : []),
      ]),
    ),
  ];
  if (dependencies.length) {
    if (!context.access) {
      throw new AccessDeniedError();
    }
    const allowed = requireGrant(context.access, name, "read");
    if (
      dependencies.some(
        (field) => !allowed.includes("*") && !allowed.includes(field),
      )
    ) {
      throw new AccessDeniedError();
    }
    if (before) {
      const source = await collectionSchema(db, name);
      const visible = await getItem(
        db,
        name,
        String(before[source.settings.primaryKey.name]),
        allowed,
        dependencies.join(","),
        context.access,
      );
      if (dependencies.some((field) => !Object.hasOwn(visible, field))) {
        throw new AccessDeniedError();
      }
    }
  }
  for (const field of configured) {
    const rules = field.presentation?.rules;
    if (
      submittedFields.includes(field.name) &&
      (rules?.readonly || rules?.computed)
    ) {
      throw new ItemError(`Field is read-only: ${field.name}`, 400);
    }
    const computed = rules?.computed;
    if (computed) {
      const relation = fields.get(computed.relation)?.relation;
      if (!relation) {
        throw new ItemError(
          "Computed field configuration is no longer valid",
          409,
        );
      }
      let value: unknown = null;
      if (row[computed.relation] != null) {
        if (!context.access) {
          throw new AccessDeniedError();
        }
        const allowed = requireGrant(
          context.access,
          relation.collection,
          "read",
        );
        const schema = await collectionSchema(db, relation.collection);
        const targetField = schema.fields.get(computed.field);
        if (
          !targetField ||
          targetField.presentation?.rules?.computed ||
          (targetField.presentation?.sensitive &&
            !field.presentation?.sensitive)
        ) {
          throw new ItemError("Computed chains are not supported", 409);
        }
        await db(relation.collection)
          .withSchema("public")
          .where(
            schema.settings.primaryKey.name,
            String(row[computed.relation]),
          )
          .select(schema.settings.primaryKey.name)
          .forShare()
          .first();
        const target = await getItem(
          db,
          relation.collection,
          String(row[computed.relation]),
          allowed,
          computed.field,
          context.access,
        );
        if (!Object.hasOwn(target, computed.field)) {
          throw new AccessDeniedError();
        }
        value = target[computed.field];
      }
      const normalized = parseItem({ [field.name]: value }, fields, false);
      Object.assign(row, normalized);
      const previous =
        field.type === "relation" && before?.[field.name] != null
          ? String(before[field.name])
          : before?.[field.name];
      if (
        !before ||
        Object.hasOwn(
          changedFields({ [field.name]: previous }, normalized).after,
          field.name,
        )
      ) {
        Object.assign(values, normalized);
      }
    }
  }
  for (const field of configured) {
    const when = field.presentation?.rules?.requiredWhen;
    if (
      when &&
      fieldConditionMatches(when, row) &&
      (row[field.name] == null ||
        (typeof row[field.name] === "string" &&
          !String(row[field.name]).trim()))
    ) {
      throw new ItemError(`Field is required by condition: ${field.name}`, 400);
    }
    const filter = field.presentation?.relationFilter;
    if (!filter || row[field.name] == null) {
      continue;
    }
    const dependencies = relationFilterDependencies(filter);
    if (
      before &&
      !Object.hasOwn(input, field.name) &&
      !dependencies.some((f) => Object.hasOwn(input, f))
    ) {
      continue;
    }
    if (!context.access || !field.relation) {
      throw new AccessDeniedError();
    }
    const resolved = resolveRelationChoiceFilter(filter, row);
    if (!resolved) {
      throw new ItemError(
        `Set the parent field before selecting: ${field.name}`,
        400,
      );
    }
    const schema = await collectionSchema(db, field.relation.collection);
    const allowed = requireGrant(
      context.access,
      field.relation.collection,
      "read",
    );
    const query = itemReadQuery(
      db,
      field.relation.collection,
      schema,
      allowed,
      { filter: JSON.stringify(resolved) },
      await listCollections(db),
      context.access,
    ).query;
    const match = await query
      .where(schema.settings.primaryKey.name, String(row[field.name]))
      .select(schema.settings.primaryKey.name)
      .forShare()
      .first();
    if (!match) {
      throw new ItemError(
        `Related selection does not match the field conditions: ${field.name}`,
        400,
      );
    }
  }
  await validateUserReferenceWrites(db, fields, values, before, context.access);
  return values;
}
