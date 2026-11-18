export interface CollectionLiveController {
  notifyChanged: () => void;
  resume: () => void;
  dispose: () => void;
}

export function createCollectionLiveController({
  debounceMs = 200,
  isHidden,
  isDeferred,
  onRefresh,
  schedule = (fn, ms) => setTimeout(fn, ms),
  cancel = (handle) => clearTimeout(handle),
}: {
  debounceMs?: number;
  isHidden: () => boolean;
  isDeferred: () => boolean;
  onRefresh: () => void;
  schedule?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  cancel?: (handle: ReturnType<typeof setTimeout>) => void;
}): CollectionLiveController {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending = false;

  function canRefreshNow(): boolean {
    return !isHidden() && !isDeferred();
  }

  function notifyChanged() {
    if (!canRefreshNow()) {
      pending = true;
      return;
    }
    if (timer !== null) {
      return;
    }
    timer = schedule(() => {
      timer = null;
      if (!canRefreshNow()) {
        pending = true;
        return;
      }
      pending = false;
      onRefresh();
    }, debounceMs);
  }

  function resume() {
    if (!pending || !canRefreshNow()) {
      return;
    }
    if (timer !== null) {
      cancel(timer);
      timer = null;
    }
    pending = false;
    onRefresh();
  }

  function dispose() {
    if (timer !== null) {
      cancel(timer);
      timer = null;
    }
    pending = false;
  }

  return { notifyChanged, resume, dispose };
}
