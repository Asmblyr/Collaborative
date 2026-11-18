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
import { readEditorItem } from "@/lib/item-read";
import { useUiCopy } from "@/lib/ui-copy";
import {
  draftChanges,
  withRecordSnapshot,
  type RecordDraft,
} from "./record-draft-model";
import type {
  PreloadedRecordSnapshot,
  RecordEditorRequest,
} from "./record-editor-types";
import type { Collection, Item } from "./types";
import type { ConflictChoices } from "./draft-conflicts";
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
} from "./stage-record-draft";
import {
  applyResolvedRecordConflicts,
  commitRecordEditorSave,
} from "./record-editor-save";

export function matchingPreloadedRecord(
  request: Pick<RecordEditorRequest, "id" | "itemEndpoint" | "initialRecord">,
): PreloadedRecordSnapshot | null {
  if (
    !request.id ||
    request.itemEndpoint ||
    request.initialRecord?.id !== request.id
  ) {
    return null;
  }
  return request.initialRecord;
}

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
  const preloaded = matchingPreloadedRecord(request);
  const initialLoadedKey =
    preloaded && request.id
      ? serializeRecordKey(request.collection, request.id, undefined)
      : null;

  const [item, setItem] = useState<Item | null>(() => preloaded?.data ?? null);
  const [label, setLabel] = useState(
    () => preloaded?.label ?? request.title ?? "",
  );
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [revision, setRevision] = useState(0);
  const [formRevision, setFormRevision] = useState(0);
  const conflicts = useDraftConflicts(request.collection);
  const [child, setChild] = useState<RecordEditorRequest | null>(null);
  const [draft, setDraft] = useState<RecordDraft>(() => {
    const base = request.draft ?? { id: request.id, values: {} };
    if (!preloaded) {
      return base;
    }
    return {
      ...withRecordSnapshot(base, preloaded.data, true),
      collection: request.collection,
    };
  });

  const dirtyRef = useRef(
    Boolean(
      request.extraDirty || (request.draft && draftChanges(request.draft)),
    ),
  );
  const extraDirtyRef = useRef(Boolean(request.extraDirty));
  const titleRef = useRef(request.title ?? "");
  const copyRef = useRef(copy);
  const preloadedKeyRef = useRef<string | null>(initialLoadedKey);
  const coordinatorRef = useRef<RecordLoadCoordinator | null>(null);

  function getCoordinator(): RecordLoadCoordinator {
    if (!coordinatorRef.current) {
      coordinatorRef.current = createRecordLoadCoordinator(initialLoadedKey);
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

    if (revision === 0 && preloadedKeyRef.current === recordKey) {
      preloadedKeyRef.current = null;
      return;
    }

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

  function save(values: Item, close: () => void, keepOpen = false) {
    return commitRecordEditorSave({
      values,
      close,
      keepOpen,
      coordinator: getCoordinator(),
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
    });
  }

  function resolveConflicts(choices: ConflictChoices) {
    applyResolvedRecordConflicts({
      choices,
      conflicts,
      collectionName: request.collection,
      catalog,
      copy,
      setDraft,
      setItem,
      setFormRevision,
      setError,
    });
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
