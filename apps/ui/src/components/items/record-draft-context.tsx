"use client";

import { createContext, useContext } from "react";
import type { RecordDraft } from "./record-draft-model";
import type { Collection, Item } from "./types";

export const RecordDraftContext = createContext<
  Map<string, { item: Item; label: string }>
>(new Map());
export const useDraftPreviews = () => useContext(RecordDraftContext);
export function draftPreviews(
  collection: string,
  draft: RecordDraft,
  catalog: Collection[],
  inherited: Map<string, { item: Item; label: string }>,
) {
  const result = new Map(inherited);
  function visit(name: string, record: RecordDraft) {
    const schema = catalog.find((entry) => entry.name === name);
    if (!schema) return;
    const id = record.id ?? record.key;
    if (id && record.preview)
      result.set(JSON.stringify([name, id]), {
        item: record.preview,
        label: record.label ?? id,
      });
    for (const [field, reference] of Object.entries(record.references ?? {})) {
      const target = schema.fields.find((entry) => entry.name === field)
        ?.relation?.collection;
      if (target) visit(target, reference);
    }
    for (const [field, changes] of Object.entries(record.relations ?? {})) {
      const relation = schema.fields.find(
        (entry) => entry.name === field,
      )?.relation;
      const target = relation?.collection;
      if (target)
        for (const entry of changes.create ?? []) visit(target, entry.record);
      if (relation?.kind === "m2m") {
        for (const entry of changes.attach ?? [])
          if (entry.record) visit(relation.throughCollection, entry.record);
        for (const entry of changes.create ?? [])
          if (entry.link) visit(relation.throughCollection, entry.link);
        for (const entry of changes.links ?? [])
          visit(relation.throughCollection, entry.record);
      }
    }
    for (const entry of record.records ?? [])
      visit(entry.collection, entry.record);
  }
  visit(collection, draft);
  return result;
}
