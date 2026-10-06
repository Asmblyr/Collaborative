"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError } from "@asmblyr-collaborative/sdk";
import { readEditorItem } from "@/lib/item-read";
import { saveEditorDraft } from "@/lib/item-write";
import { EditorDialog } from "@/components/collections/editor-dialog";
import { ItemCreateDialog } from "./item-create-dialog";
import { ItemRecordDialog } from "./item-record-dialog";
import { recordLabel } from "./item-label";
import { recordChoiceColumns } from "./record-choice-presentation";
import {
  draftChanges,
  serializeDraft,
  upsertRecord,
  withFormValues,
  type RecordDraft,
} from "./record-draft-model";
import {
  draftPreviews,
  RecordDraftContext,
  useDraftPreviews,
} from "./record-draft-context";
import type { RecordEditorRequest } from "./record-editor-types";
import type { Collection, Item } from "./types";
import { DraftConflictReview } from "./draft-conflict-review";
import { rebaseDraft, type ConflictChoices } from "./draft-conflicts";
import { useDraftConflicts } from "./use-draft-conflicts";
import { useUiCopy } from "@/lib/ui-copy";

export function ItemEditorDialog({
  request,
  catalog,
  onClose,
  onChanged,
}: {
  request: RecordEditorRequest;
  catalog: Collection[];
  onClose: (reason?: "navigation") => void;
  onChanged?: () => void;
}) {
  const copy = useUiCopy();

  const router = useRouter();
  const inheritedPreviews = useDraftPreviews();
  const collection = catalog.find((entry) => entry.name === request.collection);
  const [item, setItem] = useState<Item | null>(null);
  const [label, setLabel] = useState(request.title ?? "");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [revision, setRevision] = useState(0);
  const [formRevision, setFormRevision] = useState(0);
  const conflicts = useDraftConflicts(request.collection);
  const [child, setChild] = useState<RecordEditorRequest | null>(null);
  const [draft, setDraft] = useState<RecordDraft>(
    () => request.draft ?? { id: request.id, values: {} },
  );
  useEffect(() => {
    if (!request.id) return;
    const controller = new AbortController();
    readEditorItem(
      request.collection,
      request.id,
      controller.signal,
      request.itemEndpoint,
    )
      .then((result) => {
        if (!controller.signal.aborted) {
          setItem(result.data);
          setDraft((current) => ({
            ...current,
            baseValues: current.baseValues ?? result.data,
            collection: request.collection,
            itemEndpoint: request.itemEndpoint,
          }));
          setLabel(result.label ?? request.title ?? "");
          setError("");
        }
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error ? cause.message : copy("Ошибка соединения"),
          );
      });
    return () => controller.abort();
  }, [
    request.collection,
    request.itemEndpoint,
    request.id,
    request.title,
    revision,
    copy,
  ]);

  async function save(values: Item, close: () => void) {
    if (!collection) return;
    setPending(true);
    setError("");
    const next = withFormValues(draft, values);
    setDraft(next);
    try {
      if (request.onDraft) {
        next.key ??= `draft:${crypto.randomUUID()}`;
        next.preview = {
          ...item,
          ...request.initialValues,
          ...values,
          [collection.primaryKey.name]: request.id ?? next.key,
        };
        next.label = recordLabel(collection, {
          ...next.preview,
          [collection.primaryKey.name]:
            request.id ?? values[collection.primaryKey.name] ?? next.key,
        });
        const primary = recordChoiceColumns(collection, catalog)[0];
        const displayReadable =
          !collection.displayField ||
          collection.access.read?.includes("*") ||
          collection.access.read?.includes(collection.displayField);
        if (
          primary?.relation &&
          displayReadable &&
          collection.displayField !== collection.primaryKey.name &&
          (next.label === (request.id ?? next.key) ||
            (!collection.displayTemplate &&
              primary.name === collection.displayField))
        ) {
          const ref = next.references?.[primary.name];
          if (ref?.label) next.label = ref.label;
          else if (next.preview[primary.name] != null) {
            const response = await fetch(
              `/api/items/${encodeURIComponent(primary.relation.collection)}/${encodeURIComponent(String(next.preview[primary.name]))}`,
            );
            if (response.ok) {
              const resolved = ((await response.json()) as { label?: string })
                .label;
              if (resolved && resolved !== String(next.preview[primary.name]))
                next.label = resolved;
            }
          }
        }
        if (next.label === next.key) next.label = copy("Новая запись");
        request.onDraft(next);
        close();
        return;
      }
      const id = await saveEditorDraft(
        request.collection,
        serializeDraft(next),
      );
      request.onSaved?.(id);
      if (onChanged) onChanged();
      else router.refresh();
      close();
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === "ITEM_CHANGED") {
        try {
          await conflicts.inspect(next);
        } catch (readError) {
          setError(
            readError instanceof Error
              ? readError.message
              : copy(
                  "Не удалось загрузить актуальные значения. Черновик сохранён в этом окне.",
                ),
          );
        }
        return;
      }
      setError(
        cause instanceof Error
          ? cause.message
          : copy("Ошибка соединения. Черновик остаётся в этом окне."),
      );
    } finally {
      setPending(false);
    }
  }

  function resolveConflicts(choices: ConflictChoices) {
    const review = conflicts.review;
    if (!review) return;
    const next = rebaseDraft(
      request.collection,
      review.draft,
      review.snapshots,
      choices,
      (name, preview) => {
        const schema = catalog.find((entry) => entry.name === name);
        return schema
          ? recordLabel(schema, preview)
          : String(preview.id ?? copy("Запись"));
      },
      copy,
    );
    const root = review.snapshots.find((snapshot) => snapshot.path === "root");
    setDraft(next);
    if (root) {
      setItem(root.current);
    }
    setFormRevision((value) => value + 1);
    conflicts.clear();
    setError("");
  }

  function openRelated(
    name: string,
    id?: string,
    onSaved?: (id: string) => void,
    field?: string,
  ) {
    const staged = field
      ? draft.references?.[field]
      : draft.records?.find(
          (entry) => entry.collection === name && entry.record.id === id,
        )?.record;
    setChild({
      collection: name,
      id: staged?.id ?? (id?.startsWith("draft:") ? undefined : id),
      draft: staged,
      onDraft: (record) => {
        setDraft((current) => {
          if (!field) return upsertRecord(current, name, record);
          const references = { ...current.references, [field]: record };
          if (record.id && !draftChanges(record)) delete references[field];
          return { ...current, references };
        });
        onSaved?.(record.id ?? record.key!);
      },
    });
  }
  function editRelation(next: RecordEditorRequest) {
    if (next.onDraft) {
      setChild(next);
      return;
    }
    const staged = draft.records?.find(
      (entry) =>
        entry.collection === next.collection && entry.record.id === next.id,
    )?.record;
    setChild({
      ...next,
      draft: staged,
      onDraft: (record) =>
        setDraft((current) => upsertRecord(current, next.collection, record)),
    });
  }
  function referenceChanged(field: string, value: string) {
    setDraft((current) => {
      const ref = current.references?.[field];
      if (!ref || (ref.id ?? ref.key) === value) return current;
      const references = { ...current.references };
      delete references[field];
      return { ...current, references };
    });
  }
  const previews = useMemo(
    () => draftPreviews(request.collection, draft, catalog, inheritedPreviews),
    [request.collection, draft, catalog, inheritedPreviews],
  );
  const extraDirty =
    request.extraDirty || draftChanges({ ...draft, values: {} }) > 0;
  return (
    <RecordDraftContext value={previews}>
      {!request.id && collection ? (
        <ItemCreateDialog
          collection={collection}
          catalog={catalog}
          pending={pending}
          message={copy(error)}
          omitFields={request.omitFields}
          onSave={save}
          onClose={onClose}
          title={request.title}
          initialValues={{ ...request.initialValues, ...draft.values }}
          leadField={request.leadField}
          draftMode={Boolean(request.onDraft)}
          extraDirty={extraDirty}
          onOpenRelated={openRelated}
          onReferenceChange={referenceChanged}
          formRevision={formRevision}
          conflictReview={
            conflicts.review ? (
              <DraftConflictReview
                conflicts={conflicts.review.conflicts}
                catalog={catalog}
                onApply={resolveConflicts}
              />
            ) : undefined
          }
          description={
            request.description ??
            (request.onDraft
              ? copy(
                  "Запись добавится в черновик. Все изменения сохранятся вместе с основной карточкой.",
                )
              : copy("Запись и её связи сохранятся вместе."))
          }
        />
      ) : request.id && collection ? (
        <ItemRecordDialog
          collection={collection}
          catalog={catalog}
          item={item}
          pending={pending}
          message={copy(error)}
          onClose={onClose}
          onSave={save}
          omitFields={request.omitFields}
          title={(draft.label ?? label) || undefined}
          draft={draft}
          onDraftChange={setDraft}
          draftMode={Boolean(request.onDraft)}
          onRetry={() => {
            setError("");
            setRevision((value) => value + 1);
          }}
          onOpenRelated={openRelated}
          onEditRelation={editRelation}
          onReferenceChange={referenceChanged}
          formRevision={formRevision}
          conflictReview={
            conflicts.review ? (
              <DraftConflictReview
                conflicts={conflicts.review.conflicts}
                catalog={catalog}
                onApply={resolveConflicts}
              />
            ) : undefined
          }
        />
      ) : (
        <EditorDialog
          open
          busy={pending}
          title={copy("Запись")}
          eyebrow={request.collection}
          onClose={onClose}
        >
          {() => <p role="alert">{copy("Коллекция недоступна.")}</p>}
        </EditorDialog>
      )}
      {child && (
        <ItemEditorDialog
          key={`${child.collection}:${child.id ?? child.draft?.key ?? "new"}`}
          request={child}
          catalog={catalog}
          onClose={() => setChild(null)}
        />
      )}
    </RecordDraftContext>
  );
}
