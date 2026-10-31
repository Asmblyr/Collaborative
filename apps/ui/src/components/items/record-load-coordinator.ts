export function serializeRecordKey(
  collection: string,
  id: string,
  itemEndpoint?: string,
): string {
  return JSON.stringify([collection, id, itemEndpoint ?? null]);
}

export type RecordLoadOutcome<T> =
  | { kind: "ignored" }
  | { kind: "conflict" }
  | { kind: "loaded"; initialLoad: boolean; result: T };

export type KeepOpenSaveOutcome<T> =
  | { kind: "aborted"; id: string }
  | { kind: "reloaded"; id: string; result: T }
  | { kind: "reload-failed"; id: string; error: unknown };

export interface RecordLoadCoordinator {
  isSaving: () => boolean;
  abortActiveLoad: () => void;
  reset: () => void;
  loadRecord: <T>(options: {
    recordKey: string;
    isDirty: () => boolean;
    read: (signal: AbortSignal) => Promise<T>;
  }) => Promise<RecordLoadOutcome<T>>;
  runKeepOpenSave: <T>(options: {
    recordKey: (id: string) => string;
    commit: () => Promise<string>;
    read: (id: string, signal: AbortSignal) => Promise<T>;
  }) => Promise<KeepOpenSaveOutcome<T>>;
}

export function createRecordLoadCoordinator(): RecordLoadCoordinator {
  let loadedRecordKey: string | null = null;
  let loadController: AbortController | null = null;
  let requestSeq = 0;
  let saving = false;

  function abortActiveLoad() {
    requestSeq += 1;
    if (loadController) {
      loadController.abort();
      loadController = null;
    }
  }

  function reset() {
    abortActiveLoad();
    loadedRecordKey = null;
    saving = false;
  }

  async function loadRecord<T>({
    recordKey,
    isDirty,
    read,
  }: {
    recordKey: string;
    isDirty: () => boolean;
    read: (signal: AbortSignal) => Promise<T>;
  }): Promise<RecordLoadOutcome<T>> {
    if (saving) {
      return { kind: "ignored" };
    }

    if (loadController) {
      loadController.abort();
    }
    const controller = new AbortController();
    loadController = controller;
    const seq = ++requestSeq;

    try {
      const result = await read(controller.signal);
      if (controller.signal.aborted || seq !== requestSeq || saving) {
        return { kind: "ignored" };
      }

      const initialLoad = loadedRecordKey !== recordKey;
      if (!initialLoad && isDirty()) {
        return { kind: "conflict" };
      }

      loadedRecordKey = recordKey;
      return { kind: "loaded", initialLoad, result };
    } catch (error) {
      if (controller.signal.aborted || seq !== requestSeq || saving) {
        return { kind: "ignored" };
      }
      throw error;
    } finally {
      if (loadController === controller) {
        loadController = null;
      }
    }
  }

  async function runKeepOpenSave<T>({
    recordKey,
    commit,
    read,
  }: {
    recordKey: (id: string) => string;
    commit: () => Promise<string>;
    read: (id: string, signal: AbortSignal) => Promise<T>;
  }): Promise<KeepOpenSaveOutcome<T>> {
    saving = true;
    abortActiveLoad();

    let reloadController: AbortController | null = null;
    try {
      const id = await commit();
      const resolvedKey = recordKey(id);
      reloadController = new AbortController();
      loadController = reloadController;
      const seq = ++requestSeq;

      try {
        const result = await read(id, reloadController.signal);
        if (reloadController.signal.aborted || seq !== requestSeq) {
          return { kind: "aborted", id };
        }

        loadedRecordKey = resolvedKey;
        return { kind: "reloaded", id, result };
      } catch (error) {
        if (reloadController.signal.aborted || seq !== requestSeq) {
          return { kind: "aborted", id };
        }

        loadedRecordKey = null;
        return { kind: "reload-failed", id, error };
      }
    } finally {
      if (reloadController && loadController === reloadController) {
        loadController = null;
      }
      saving = false;
    }
  }

  return {
    isSaving: () => saving,
    abortActiveLoad,
    reset,
    loadRecord,
    runKeepOpenSave,
  };
}
