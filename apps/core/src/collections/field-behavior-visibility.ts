import type { Collection } from "./types.js";
import { grantFor, type Access } from "../permissions/access.js";
import {
  relationFilterDependencies,
  type RelationChoiceFilter,
} from "@asmblyr-collaborative/contracts";
import { canReadLabelPath } from "./label-paths.js";

/** Do not expose private field names or condition operands through catalog metadata. */
export function visibleFieldBehavior(
  field: Collection["fields"][number],
  source: Collection,
  catalog: Collection[],
  access: Access,
): Collection["fields"][number] {
  if (access.principal.superuser || !field.presentation) {
    return field;
  }
  const presentation = { ...field.presentation };
  const readable = grantFor(access, source.name, "read") ?? [];
  const reads = (name: string) =>
    readable.includes("*") || readable.includes(name);
  const rules = { ...presentation.rules };
  if (rules.requiredWhen?.rules.some((rule) => !reads(rule.field))) {
    delete rules.requiredWhen;
    rules.readonly = true;
  }
  if (rules.computed) {
    const { relation, field: name } = rules.computed;
    if (!canReadLabelPath(`${relation}.${name}`, source, catalog, access)) {
      delete rules.computed;
      rules.readonly = true;
    }
  }
  if (presentation.relationFilter) {
    const target = catalog.find((c) => c.name === field.relation?.collection);
    const visible = (group: RelationChoiceFilter): boolean =>
      group.children.every((node) => {
        if ("logic" in node) {
          return visible(node);
        }
        return Boolean(
          target && canReadChoicePath(node.field, target, catalog, access),
        );
      });
    if (
      relationFilterDependencies(presentation.relationFilter).some(
        (name) => !reads(name),
      ) ||
      !visible(presentation.relationFilter)
    ) {
      delete presentation.relationFilter;
      rules.readonly = true;
    }
  }
  if (Object.keys(rules).length) {
    presentation.rules = rules;
  }
  return { ...field, presentation };
}

function canReadChoicePath(
  path: string,
  source: Collection,
  catalog: Collection[],
  access: Access,
): boolean {
  if (canReadLabelPath(path, source, catalog, access)) {
    return true;
  }
  const [root, leaf, extra] = path.split(".");
  const relation = source.fields.find((f) => f.name === root)?.relation;
  const allowed = grantFor(access, source.name, "read");
  const target = catalog.find((c) => c.name === relation?.collection);
  if (
    !leaf ||
    extra ||
    !relation ||
    relation.kind === "m2o" ||
    !allowed ||
    !target ||
    (!allowed.includes("*") && !allowed.includes(root))
  ) {
    return false;
  }
  const targetAllowed = grantFor(access, target.name, "read") ?? [];
  const missingLink =
    relation.kind === "o2m" &&
    !targetAllowed.includes("*") &&
    !targetAllowed.includes(relation.throughField);
  const conditionalTraversal = [
    source.name,
    target.name,
    relation.throughCollection,
  ].some((name) => access.rowRules?.has(`${name}:read`));
  return (
    !missingLink &&
    !conditionalTraversal &&
    canReadLabelPath(leaf, target, catalog, access)
  );
}
