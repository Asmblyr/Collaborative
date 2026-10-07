import type { Item } from "./types";
import type { ItemCommitDraft } from "@asmblyr-collaborative/contracts";

export interface RecordDraft {
  id?: string;
  values: Item;
  baseValues?: Item;
  itemEndpoint?: string;
  collection?: string;
  references?: Record<string, RecordDraft>;
  relations?: Record<string, RelationDraft>;
  records?: { collection: string; record: RecordDraft }[];
  key?: string;
  preview?: Item;
  label?: string;
}
export interface RelationDraft {
  attach?: {
    id: string;
    record?: RecordDraft;
    preview?: Item;
    label?: string;
  }[];
  detach?: string[];
  create?: { key: string; record: RecordDraft; link?: RecordDraft }[];
  links?: { id: string; record: RecordDraft }[];
  removedLabels?: Record<string, string>;
}

function changedReferences(draft: RecordDraft) {
  return Object.entries(draft.references ?? {}).filter(([field, record]) => {
    const sameReference =
      record.id && String(draft.baseValues?.[field]) === record.id;
    return !sameReference || draftChanges(record) > 0;
  });
}

export function draftChanges(draft: RecordDraft): number {
  return (
    Object.keys(draft.values).length +
    changedReferences(draft).length +
    (draft.records?.filter((entry) => draftChanges(entry.record) > 0).length ??
      0) +
    Object.values(draft.relations ?? {}).reduce(
      (sum, relation) =>
        sum +
        (relation.attach?.length ?? 0) +
        (relation.detach?.length ?? 0) +
        (relation.create?.length ?? 0) +
        (relation.links?.filter((entry) => draftChanges(entry.record) > 0)
          .length ?? 0),
      0,
    )
  );
}

export function serializeDraft(draft: RecordDraft): ItemCommitDraft {
  const references = changedReferences(draft);
  return {
    ...(draft.id ? { id: draft.id } : {}),
    values: draft.values,
    ...(draft.baseValues
      ? {
          expectedValues: Object.fromEntries(
            [
              ...new Set([
                ...Object.keys(draft.values),
                ...references.map(([field]) => field),
              ]),
            ]
              .filter((field) => Object.hasOwn(draft.baseValues!, field))
              .map((field) => [field, draft.baseValues![field]]),
          ),
        }
      : {}),
    references: Object.fromEntries(
      references.map(([field, value]) => [field, serializeDraft(value)]),
    ),
    relations: Object.fromEntries(
      Object.entries(draft.relations ?? {}).map(([field, relation]) => [
        field,
        {
          attach: relation.attach?.map(({ id, record }) => ({
            id,
            ...(record ? { record: serializeDraft(record) } : {}),
          })),
          detach: relation.detach,
          create: relation.create?.map(({ record, link }) => ({
            record: serializeDraft(record),
            ...(link ? { link: serializeDraft(link) } : {}),
          })),
          links: relation.links
            ?.filter((entry) => draftChanges(entry.record) > 0)
            .map(({ id, record }) => ({
              id,
              record: serializeDraft(record),
            })),
        },
      ]),
    ),
    records: draft.records
      ?.filter((entry) => draftChanges(entry.record) > 0)
      .map(({ collection, record }) => ({
        collection,
        record: serializeDraft(record),
      })),
  };
}

export function withFormValues(draft: RecordDraft, values: Item): RecordDraft {
  return {
    ...draft,
    values,
    references: Object.fromEntries(
      Object.entries(draft.references ?? {}).filter(
        ([field, ref]) =>
          !Object.hasOwn(values, field) ||
          String(values[field]) === (ref.id ?? ref.key),
      ),
    ),
  };
}

export function withRecordSnapshot(
  draft: RecordDraft,
  item: Item,
  initialLoad: boolean,
): RecordDraft {
  return {
    ...draft,
    baseValues: initialLoad ? (draft.baseValues ?? item) : item,
  };
}

export function upsertRecord(
  draft: RecordDraft,
  collection: string,
  record: RecordDraft,
): RecordDraft {
  const records = (draft.records ?? []).filter(
    (entry) => entry.collection !== collection || entry.record.id !== record.id,
  );
  return {
    ...draft,
    records: draftChanges(record)
      ? [...records, { collection, record }]
      : records,
  };
}
