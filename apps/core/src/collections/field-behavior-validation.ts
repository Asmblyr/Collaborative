import type { FieldPresentation } from "@asmblyr-collaborative/contracts";
import {
  relationFilterDependencies,
  resolveRelationChoiceFilter,
} from "@asmblyr-collaborative/contracts";
import type { Knex } from "knex";
import { collectionSchema } from "../items/schema-repository.js";
import { parseItemFilters } from "../items/filter-input.js";
import { listCollections } from "./catalog-repository.js";
import { CollectionInputError } from "./validation.js";

export async function validateFieldBehavior(
  db: Knex,
  collection: string,
  field: string,
  presentation: FieldPresentation | Record<string, never>,
): Promise<void> {
  const catalog = await listCollections(db);
  const source = catalog.find((c) => c.name === collection)!;
  const current = source.fields.find((f) => f.name === field)!;
  const rules = presentation.rules;
  if (
    current.relation?.collection === "@users" &&
    (presentation.relationFilter || rules?.computed)
  ) {
    throw new CollectionInputError(
      "System user references do not support choice filters or computed values",
    );
  }
  for (const rule of rules?.requiredWhen?.rules ?? []) {
    const dependency = source.fields.find((f) => f.name === rule.field);
    if (
      !dependency ||
      ["alias", "json", "files", "file"].includes(dependency.type) ||
      rule.field === field
    ) {
      throw new CollectionInputError(
        "Required conditions use another scalar field of this collection",
      );
    }
  }
  if (
    rules?.computed &&
    source.fields.some(
      (f) =>
        f.presentation?.rules?.computed?.relation === field ||
        (f.presentation?.relationFilter &&
          relationFilterDependencies(f.presentation.relationFilter).includes(
            field,
          )),
    )
  ) {
    throw new CollectionInputError(
      "A computed field cannot drive another computation or choice filter",
    );
  }
  if (
    rules?.computed &&
    catalog.some((c) =>
      c.fields.some((f) => {
        const computed = f.presentation?.rules?.computed;
        return (
          computed &&
          computed.field === field &&
          c.fields.find((r) => r.name === computed.relation)?.relation
            ?.collection === collection
        );
      }),
    )
  ) {
    throw new CollectionInputError(
      "A field used as a computation source cannot itself become computed",
    );
  }
  if (rules?.computed) {
    const driver = source.fields.find(
      (f) => f.name === rules.computed!.relation,
    );
    const relation = driver?.relation;
    const target = catalog.find((c) => c.name === relation?.collection);
    const targetField = target?.fields.find(
      (f) => f.name === rules.computed!.field,
    );
    if (
      relation?.kind !== "m2o" ||
      driver?.presentation?.rules?.computed ||
      relation.collection === collection ||
      !targetField ||
      ![
        "text",
        "email",
        "integer",
        "bigint",
        "decimal",
        "date",
        "datetime",
        "boolean",
        "uuid",
        "relation",
      ].includes(targetField.type) ||
      targetField.presentation?.rules?.computed ||
      (targetField.presentation?.sensitive && !presentation.sensitive) ||
      current.name === rules.computed.relation ||
      targetField.type !== current.type ||
      current.relation?.collection !== targetField.relation?.collection
    ) {
      throw new CollectionInputError(
        "Computed fields copy a matching field from a direct M2O; chains and cycles are not supported",
      );
    }
  }
  if (
    presentation.sensitive &&
    catalog.some((c) =>
      c.fields.some((f) => {
        const computed = f.presentation?.rules?.computed;
        return (
          computed?.field === field &&
          c.fields.find((r) => r.name === computed.relation)?.relation
            ?.collection === collection &&
          !f.presentation?.sensitive
        );
      }),
    )
  ) {
    throw new CollectionInputError(
      "Mark derived fields sensitive before protecting their source",
    );
  }
  if (presentation.relationFilter) {
    const relation = current.relation;
    if (relation?.kind !== "m2o") {
      throw new CollectionInputError("Choice filters require an M2O field");
    }
    const sample = (f: string): string => {
      const d = source.fields.find((x) => x.name === f);
      if (
        !d ||
        ["alias", "json", "files", "file"].includes(d.type) ||
        f === field ||
        d.presentation?.rules?.computed
      ) {
        throw new CollectionInputError("Invalid choice dependency");
      }
      if (d.type === "boolean") {
        return "true";
      }
      if (d.type === "date") {
        return "2026-01-01";
      }
      if (d.type === "datetime") {
        return "2026-01-01T00:00:00Z";
      }
      if (
        d.type === "uuid" ||
        (d.relation?.kind === "m2o" && d.relation.primaryKey.type === "uuid")
      ) {
        return "00000000-0000-4000-8000-000000000001";
      }
      return "1";
    };
    const samples = Object.fromEntries(
      relationFilterDependencies(presentation.relationFilter).map((f) => [
        f,
        sample(f),
      ]),
    );
    const resolved = resolveRelationChoiceFilter(
      presentation.relationFilter,
      samples,
    );
    const schema = await collectionSchema(db, relation.collection);
    try {
      parseItemFilters(
        JSON.stringify(resolved),
        relation.collection,
        schema,
        ["*"],
        catalog,
        {
          principal: {
            kind: "user",
            id: "schema-validation",
            email: "",
            sessionId: "",
            superuser: true,
          },
          grants: new Map(),
        },
      );
    } catch {
      throw new CollectionInputError(
        "Relation filter is incompatible with the target schema",
      );
    }
  }
}
