"use client";

import { flushSync } from "react-dom";
import { ApiError } from "@asmblyr-collaborative/sdk";
import { readEditorItem } from "@/lib/item-read";
import { saveEditorDraft } from "@/lib/item-write";
import { showToast } from "@/components/ui/toast";
import type { useUiCopy } from "@/lib/ui-copy";
import { recordLabel } from "./item-label";
import {
  serializeDraft,
  withFormValues,
  withRecordSnapshot,
  type RecordDraft,
} from "./record-draft-model";
import type { RecordEditorRequest } from "./record-editor-types";
import type { Collection, Item } from "./types";
import { rebaseDraft, type ConflictChoices } from "./draft-conflicts";
import type { useDraftConflicts } from "./use-draft-conflicts";
import {
  serializeRecordKey,
  type RecordLoadCoordinator,
} from "./record-load-coordinator";
import { stageNestedRecordDraft } from "./stage-record-draft";

export async function commitRecordEditorSave({
  values,
  close,
  keepOpen = false,
  coordinator,
  collection,
  catalog,
  request,
  draft,
  item,
  copy,
  conflicts,
  dirtyRef,
  setPending,
  setError,
  setDraft,
  setItem,
  setLabel,
  setFormRevision,
  notifyChanged,
}: {
  values: Item;
  close: () => void;
  keepOpen?: boolean;
  coordinator: RecordLoadCoordinator;
  collection: Collection | undefined;
  catalog: Collection[];
  request: RecordEditorRequest;
  draft: RecordDraft;
  item: Item | null;
  copy: ReturnType<typeof useUiCopy>;
  conflicts: ReturnType<typeof useDraftConflicts>;
  dirtyRef: { current: boolean };
  setPending: (pending: boolean) => void;
  setError: (error: string) => void;
  setDraft: (draft: RecordDraft) => void;
  setItem: (item: Item | null) => void;
  setLabel: (label: string) => void;
  setFormRevision: (updater: (value: number) => number) => void;
  notifyChanged: () => void;
}): Promise<void> {
  if (!collection || coordinator.isSaving()) {
    return;
  }

  setPending(true);
  setError("");
  const next = withFormValues(draft, values);
  setDraft(next);

  try {
    if (request.onDraft) {
      const staged = await stageNestedRecordDraft({
        draft: next,
        values,
        item,
        request,
        collection,
        catalog,
        copy,
      });
      request.onDraft(staged);
      close();
      return;
    }

    if (keepOpen) {
      const outcome = await coordinator.runKeepOpenSave({
        recordKey: (savedId) =>
          serializeRecordKey(
            request.collection,
            request.id ?? savedId,
            request.itemEndpoint,
          ),
        commit: () => saveEditorDraft(request.collection, serializeDraft(next)),
        read: (savedId, signal) =>
          readEditorItem(
            request.collection,
            request.id ?? savedId,
            signal,
            request.itemEndpoint,
          ),
      });

      if (outcome.kind === "aborted") {
        return;
      }

      const targetId = request.id ?? outcome.id;
      dirtyRef.current = false;

      if (outcome.kind === "reload-failed") {
        const reloadMessage =
          outcome.error instanceof Error
            ? outcome.error.message
            : copy("Ошибка соединения");
        flushSync(() => {
          setItem(null);
          setDraft({
            id: targetId,
            values: {},
            collection: request.collection,
            itemEndpoint: request.itemEndpoint,
          });
          setFormRevision((value) => value + 1);
          setError(reloadMessage);
          setPending(false);
        });
        showToast(copy("Запись обновлена"), "success");
        notifyChanged();
        return;
      }

      flushSync(() => {
        setItem(outcome.result.data);
        setDraft({
          ...withRecordSnapshot(
            { id: targetId, values: {} },
            outcome.result.data,
            false,
          ),
          collection: request.collection,
          itemEndpoint: request.itemEndpoint,
        });
        setLabel(outcome.result.label ?? request.title ?? "");
        setFormRevision((value) => value + 1);
        setError("");
        setPending(false);
      });
      showToast(copy("Запись обновлена"), "success");
      notifyChanged();
      return;
    }

    coordinator.abortActiveLoad();
    const id = await saveEditorDraft(request.collection, serializeDraft(next));
    request.onSaved?.(id);
    notifyChanged();
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

export function applyResolvedRecordConflicts({
  choices,
  conflicts,
  collectionName,
  catalog,
  copy,
  setDraft,
  setItem,
  setFormRevision,
  setError,
}: {
  choices: ConflictChoices;
  conflicts: ReturnType<typeof useDraftConflicts>;
  collectionName: string;
  catalog: Collection[];
  copy: ReturnType<typeof useUiCopy>;
  setDraft: (draft: RecordDraft) => void;
  setItem: (item: Item | null) => void;
  setFormRevision: (updater: (value: number) => number) => void;
  setError: (error: string) => void;
}): void {
  const review = conflicts.review;
  if (!review) {
    return;
  }

  const next = rebaseDraft(
    collectionName,
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
