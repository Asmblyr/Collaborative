import type { PluginPreparedAction } from "@asmblyr/contracts";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    cache: "no-store",
    credentials: "same-origin",
  });
  const body = await response.json();
  if (!response.ok)
    throw new Error(
      body.message ?? "Не удалось выполнить действие расширения.",
    );
  return body.data as T;
}

export function loadPreparedAction(
  namespace: string,
  id: string,
  signal?: AbortSignal,
): Promise<PluginPreparedAction> {
  return request(
    `/api/extensions/${encodeURIComponent(namespace)}/drafts/${encodeURIComponent(id)}`,
    { signal },
  );
}

/** No model-supplied URL is accepted by the UI navigation path. */
export function preparedActionHref(draft: PluginPreparedAction): string {
  return `/extensions/${encodeURIComponent(draft.namespace)}/${encodeURIComponent(draft.pageId)}?draft=${encodeURIComponent(draft.draftId)}`;
}
