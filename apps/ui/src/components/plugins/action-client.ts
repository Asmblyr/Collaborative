import type { PluginPreparedAction } from "@asmblyr-collaborative/contracts";
import { originalCopy, type UiCopy } from "@/lib/ui-copy-types";

async function request<T>(
  path: string,
  init?: RequestInit,
  copy: UiCopy = originalCopy,
): Promise<T> {
  const response = await fetch(path, {
    ...init,
    cache: "no-store",
    credentials: "same-origin",
  });
  const body = await response.json();
  if (!response.ok)
    throw new Error(
      body.message ?? copy("Не удалось выполнить действие расширения."),
    );
  return body.data as T;
}

export function loadPreparedAction(
  namespace: string,
  id: string,
  signal?: AbortSignal,
  copy: UiCopy = originalCopy,
): Promise<PluginPreparedAction> {
  return request(
    `/api/extensions/${encodeURIComponent(namespace)}/drafts/${encodeURIComponent(id)}`,
    { signal },
    copy,
  );
}

/** No model-supplied URL is accepted by the UI navigation path. */
export function preparedActionHref(draft: PluginPreparedAction): string {
  return `/extensions/${encodeURIComponent(draft.namespace)}/${encodeURIComponent(draft.pageId)}?draft=${encodeURIComponent(draft.draftId)}`;
}
