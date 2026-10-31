import type { Dispatch, SetStateAction } from "react";
import { asmblyr } from "@/lib/asmblyr";
import type { useUiCopy } from "@/lib/ui-copy";
import { recordLabel } from "./item-label";
import { recordChoiceColumns } from "./record-choice-presentation";
import {
  draftChanges,
  upsertRecord,
  type RecordDraft,
} from "./record-draft-model";
import type { RecordEditorRequest } from "./record-editor-types";
import type { Collection, Item } from "./types";

export async function stageNestedRecordDraft({
  draft,
  values,
  item,
  request,
  collection,
  catalog,
  copy,
}: {
  draft: RecordDraft;
  values: Item;
  item: Item | null;
  request: RecordEditorRequest;
  collection: Collection;
  catalog: Collection[];
  copy: ReturnType<typeof useUiCopy>;
}): Promise<RecordDraft> {
  const staged: RecordDraft = { ...draft };
  staged.key ??= `draft:${crypto.randomUUID()}`;
  staged.preview = {
    ...item,
    ...request.initialValues,
    ...values,
    [collection.primaryKey.name]: request.id ?? staged.key,
  };
  staged.label = recordLabel(collection, {
    ...staged.preview,
    [collection.primaryKey.name]:
      request.id ?? values[collection.primaryKey.name] ?? staged.key,
  });

  const primary = recordChoiceColumns(collection, catalog)[0];
  const displayReadable =
    !collection.displayField ||
    collection.access.read?.includes("*") ||
    collection.access.read?.includes(collection.displayField);
  const shouldResolveRelationLabel =
    Boolean(primary?.relation) &&
    Boolean(displayReadable) &&
    collection.displayField !== collection.primaryKey.name &&
    (staged.label === (request.id ?? staged.key) ||
      (!collection.displayTemplate &&
        primary?.name === collection.displayField));

  if (shouldResolveRelationLabel && primary?.relation) {
    const reference = staged.references?.[primary.name];
    if (reference?.label) {
      staged.label = reference.label;
    } else if (staged.preview[primary.name] != null) {
      const targetId = String(staged.preview[primary.name]);
      const resolvedItem = await asmblyr.items
        .get(primary.relation.collection, targetId, { fields: [] })
        .catch(() => null);
      if (resolvedItem?.label && resolvedItem.label !== targetId) {
        staged.label = resolvedItem.label;
      }
    }
  }

  if (staged.label === staged.key) {
    staged.label = copy("Новая запись");
  }

  return staged;
}

export function buildRelatedChildRequest({
  draft,
  setDraft,
  name,
  id,
  onSaved,
  field,
}: {
  draft: RecordDraft;
  setDraft: Dispatch<SetStateAction<RecordDraft>>;
  name: string;
  id?: string;
  onSaved?: (id: string) => void;
  field?: string;
}): RecordEditorRequest {
  const staged = field
    ? draft.references?.[field]
    : draft.records?.find(
        (entry) => entry.collection === name && entry.record.id === id,
      )?.record;

  return {
    collection: name,
    id: staged?.id ?? (id?.startsWith("draft:") ? undefined : id),
    draft: staged,
    onDraft: (record) => {
      setDraft((current) => {
        if (!field) {
          return upsertRecord(current, name, record);
        }
        const references = { ...current.references, [field]: record };
        if (record.id && !draftChanges(record)) {
          delete references[field];
        }
        return { ...current, references };
      });
      onSaved?.(record.id ?? record.key!);
    },
  };
}

export function buildRelationEditRequest({
  draft,
  setDraft,
  next,
}: {
  draft: RecordDraft;
  setDraft: Dispatch<SetStateAction<RecordDraft>>;
  next: RecordEditorRequest;
}): RecordEditorRequest {
  if (next.onDraft) {
    return next;
  }

  const staged = draft.records?.find(
    (entry) =>
      entry.collection === next.collection && entry.record.id === next.id,
  )?.record;

  return {
    ...next,
    draft: staged,
    onDraft: (record) =>
      setDraft((current) => upsertRecord(current, next.collection, record)),
  };
}

export function pruneStaleReferenceDraft(
  current: RecordDraft,
  field: string,
  value: string,
): RecordDraft {
  const ref = current.references?.[field];
  if (!ref || (ref.id ?? ref.key) === value) {
    return current;
  }

  const references = { ...current.references };
  delete references[field];
  return { ...current, references };
}
