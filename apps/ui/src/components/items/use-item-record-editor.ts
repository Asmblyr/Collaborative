"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import { ApiError } from "@asmblyr-collaborative/sdk";
import { readEditorItem } from "@/lib/item-read";
import { saveEditorDraft } from "@/lib/item-write";
import { showToast } from "@/components/ui/toast";
import { useUiCopy } from "@/lib/ui-copy";
import { recordLabel } from "./item-label";
import {
  draftChanges,
  serializeDraft,
  withFormValues,
  withRecordSnapshot,
  type RecordDraft,
} from "./record-draft-model";
import type { RecordEditorRequest } from "./record-editor-types";
import type { Collection, Item } from "./types";
import { rebaseDraft, type ConflictChoices } from "./draft-conflicts";
import { useDraftConflicts } from "./use-draft-conflicts";
import {
  createRecordLoadCoordinator,
  serializeRecordKey,
  type RecordLoadCoordinator,
} from "./record-load-coordinator";
import {
  buildRelatedChildRequest,
  buildRelationEditRequest,
  pruneStaleReferenceDraft,
  stageNestedRecordDraft,
} from "./stage-record-draft";

export function useItemRecordEditor({
  request,
  collection,
  catalog,
  onChanged,
}: {
  request: RecordEditorRequest;
  collection: Collection | undefined;
  catalog: Collection[];
  onChanged?: () => void;
}) {
  const copy = useUiCopy();
  const router = useRouter();

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

  const dirtyRef = useRef(
    Boolean(
      request.extraDirty || (request.draft && draftChanges(request.draft)),
    ),
  );
  const extraDirtyRef = useRef(Boolean(request.extraDirty));
  const titleRef = useRef(request.title ?? "");
  const copyRef = useRef(copy);
  const coordinatorRef = useRef<RecordLoadCoordinator | null>(null);

  function getCoordinator(): RecordLoadCoordinator {
    if (!coordinatorRef.current) {
      coordinatorRef.current = createRecordLoadCoordinator();
    }
    return coordinatorRef.current;
  }

  useLayoutEffect(() => {
    extraDirtyRef.current = Boolean(request.extraDirty);
    titleRef.current = request.title ?? "";
    copyRef.current = copy;
  }, [copy, request.extraDirty, request.title]);

  useEffect(() => {
    return () => {
      coordinatorRef.current?.abortActiveLoad();
    };
  }, []);

  const onDirtyChange = useCallback((dirty: boolean) => {
    dirtyRef.current = dirty;
  }, []);

  useEffect(() => {
    const recordId = request.id;
    if (!recordId) {
      return;
    }

    const coordinator = getCoordinator();
    const recordKey = serializeRecordKey(
      request.collection,
      recordId,
      request.itemEndpoint,
    );

    void coordinator
      .loadRecord({
        recordKey,
        isDirty: () => dirtyRef.current || extraDirtyRef.current,
        read: (signal) =>
          readEditorItem(
            request.collection,
            recordId,
            signal,
            request.itemEndpoint,
          ),
      })
      .then((outcome) => {
        if (outcome.kind === "ignored") {
          return;
        }
        if (outcome.kind === "conflict") {
          setError(
            copyRef.current(
              "Запись изменена другим участником. При сохранении проверьте конфликт.",
            ),
          );
          return;
        }

        // Commit the snapshot and its conflict baseline before another input event.
        flushSync(() => {
          setItem(outcome.result.data);
          setFormRevision((value) => value + 1);
          setDraft((current) => ({
            ...withRecordSnapshot(
              current,
              outcome.result.data,
              outcome.initialLoad,
            ),
            collection: request.collection,
            itemEndpoint: request.itemEndpoint,
          }));
          setLabel(outcome.result.label ?? titleRef.current);
          setError("");
        });
      })
      .catch((cause: unknown) => {
        setError(
          cause instanceof Error
            ? cause.message
            : copyRef.current("Ошибка соединения"),
        );
      });

    return () => {
      coordinator.abortActiveLoad();
    };
  }, [request.collection, request.id, request.itemEndpoint, revision]);

  function notifyChanged() {
    if (onChanged) {
      onChanged();
    } else {
      router.refresh();
    }
  }

  async function save(values: Item, close: () => void, keepOpen = false) {
    const coordinator = getCoordinator();
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
          commit: () =>
            saveEditorDraft(request.collection, serializeDraft(next)),
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
      const id = await saveEditorDraft(
        request.collection,
        serializeDraft(next),
      );
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

  function resolveConflicts(choices: ConflictChoices) {
    const review = conflicts.review;
    if (!review) {
      return;
    }

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
    setChild(
      buildRelatedChildRequest({ draft, setDraft, name, id, onSaved, field }),
    );
  }

  function editRelation(next: RecordEditorRequest) {
    setChild(buildRelationEditRequest({ draft, setDraft, next }));
  }

  function referenceChanged(field: string, value: string) {
    setDraft((current) => pruneStaleReferenceDraft(current, field, value));
  }

  function retryLoad() {
    if (getCoordinator().isSaving()) {
      return;
    }
    setError("");
    setRevision((value) => value + 1);
  }

  return {
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
  };
}
