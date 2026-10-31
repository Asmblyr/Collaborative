"use client";

import { useMemo } from "react";
import { EditorDialog } from "@/components/ui/editor-dialog";
import { ItemCreateDialog } from "./item-create-dialog";
import { ItemRecordDialog } from "./item-record-dialog";
import { draftChanges } from "./record-draft-model";
import {
  draftPreviews,
  RecordDraftContext,
  useDraftPreviews,
} from "./record-draft-context";
import type { RecordEditorRequest } from "./record-editor-types";
import type { Collection } from "./types";
import { DraftConflictReview } from "./draft-conflict-review";
import { useItemRecordEditor } from "./use-item-record-editor";
import { useUiCopy } from "@/lib/ui-copy";

export function ItemEditorDialog({
  request,
  catalog,
  onClose,
  onChanged,
  trail,
}: {
  request: RecordEditorRequest;
  catalog: Collection[];
  onClose: (reason?: "navigation") => void;
  onChanged?: () => void;
  trail?: readonly string[];
}) {
  const copy = useUiCopy();

  const inheritedPreviews = useDraftPreviews();
  const collection = catalog.find((entry) => entry.name === request.collection);

  const {
    item,
    label,
    error,
    pending,
    formRevision,
    conflicts,
    child,
    setChild,
    draft,
    setDraft,
    onDirtyChange,
    save,
    resolveConflicts,
    openRelated,
    editRelation,
    referenceChanged,
    retryLoad,
  } = useItemRecordEditor({
    request,
    collection,
    catalog,
    onChanged,
  });

  const previews = useMemo(
    () => draftPreviews(request.collection, draft, catalog, inheritedPreviews),
    [request.collection, draft, catalog, inheritedPreviews],
  );
  const extraDirty =
    request.extraDirty || draftChanges({ ...draft, values: {} }) > 0;
  const currentStep =
    draft.label ||
    label ||
    request.title ||
    collection?.displayName ||
    request.collection;
  const nextTrail = [...(trail ?? []), currentStep];

  const conflictReview = conflicts.review ? (
    <DraftConflictReview
      conflicts={conflicts.review.conflicts}
      catalog={catalog}
      onApply={resolveConflicts}
    />
  ) : undefined;

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
          trail={trail}
          conflictReview={conflictReview}
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
          onDirtyChange={onDirtyChange}
          draftMode={Boolean(request.onDraft)}
          onRetry={retryLoad}
          onOpenRelated={openRelated}
          onEditRelation={editRelation}
          onReferenceChange={referenceChanged}
          formRevision={formRevision}
          trail={trail}
          conflictReview={conflictReview}
        />
      ) : (
        <EditorDialog
          open
          busy={pending}
          nested={Boolean(trail?.length)}
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
          trail={nextTrail}
          onClose={() => setChild(null)}
        />
      )}
    </RecordDraftContext>
  );
}
