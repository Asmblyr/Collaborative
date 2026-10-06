import { ItemError, parseCollectionName } from "./validation.js";
import type {
  ItemCommitDraft,
  ItemCommitRelation,
  ItemRecord,
} from "@asmblyr-collaborative/contracts";

export type RecordDraft = ItemCommitDraft<ItemRecord>;
export type RelationDraft = ItemCommitRelation<ItemRecord>;

const invalid = (): never => {
  throw new ItemError("Invalid record draft", 400);
};
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return invalid();
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some((key) => !allowed.includes(key))) invalid();
}
function id(value: unknown): string {
  if (typeof value !== "string" || !value || value.length > 255)
    return invalid();
  return value;
}

export function parseRecordDraft(body: unknown): RecordDraft {
  let operations = 0;
  const count = () => {
    if (++operations > 100)
      throw new ItemError("A draft supports up to 100 changes", 400);
  };
  function list(value: unknown): unknown[] {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.length > 100) return invalid();
    return value;
  }
  function record(value: unknown, depth: number): RecordDraft {
    if (depth > 0) count();
    if (depth > 5) throw new ItemError("Record draft nesting is too deep", 400);
    const input = object(value);
    keys(input, [
      "id",
      "values",
      "expectedValues",
      "references",
      "relations",
      "records",
    ]);
    const references = Object.fromEntries(
      Object.entries(object(input.references ?? {})).map(([field, draft]) => {
        parseCollectionName(field);
        return [field, record(draft, depth + 1)];
      }),
    );
    const relations = Object.fromEntries(
      Object.entries(object(input.relations ?? {})).map(([field, value]) => {
        parseCollectionName(field);
        const relation = object(value);
        keys(relation, ["attach", "detach", "create", "links"]);
        const attach = list(relation.attach).map((entry) => {
          count();
          const row = object(entry);
          keys(row, ["id", "record"]);
          const draft =
            row.record === undefined
              ? undefined
              : record(row.record, depth + 1);
          if (draft?.id) invalid();
          return { id: id(row.id), ...(draft ? { record: draft } : {}) };
        });
        const detach = list(relation.detach).map((entry) => {
          count();
          return id(entry);
        });
        const create = list(relation.create).map((entry) => {
          const row = object(entry);
          keys(row, ["record", "link"]);
          return {
            record: record(row.record, depth + 1),
            ...(row.link === undefined
              ? {}
              : { link: record(row.link, depth + 1) }),
          };
        });
        if (create.some((entry) => entry.record.id || entry.link?.id))
          invalid();
        const links = list(relation.links).map((entry) => {
          count();
          const row = object(entry);
          keys(row, ["id", "record"]);
          const draft = record(row.record, depth + 1),
            linkId = id(row.id);
          if (draft.id && draft.id !== linkId) invalid();
          return { id: linkId, record: draft };
        });
        return [field, { attach, detach, create, links }];
      }),
    );
    const records = list(input.records).map((entry) => {
      const row = object(entry);
      keys(row, ["collection", "record"]);
      const collection = id(row.collection);
      parseCollectionName(collection);
      const draft = record(row.record, depth + 1);
      if (!draft.id) invalid(); // New records must be connected through a named relation.
      return { collection, record: draft };
    });
    return {
      ...(input.id === undefined ? {} : { id: id(input.id) }),
      values: object(input.values ?? {}),
      ...(input.expectedValues === undefined
        ? {}
        : { expectedValues: object(input.expectedValues) }),
      references,
      relations,
      records,
    };
  }
  return record(body, 0);
}
