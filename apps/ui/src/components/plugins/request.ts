import type { PluginRequest } from "@asmblyr-collaborative/kit/ui";
import { originalCopy, type UiCopy } from "@/lib/ui-copy-types";

export function pluginRequest(
  namespace: string,
  copy: UiCopy = originalCopy,
): PluginRequest {
  const base = `/api/${namespace}`;
  return async <T>(path: string, init?: RequestInit): Promise<T> => {
    if (!path.startsWith("/") || path.startsWith("//"))
      throw new Error("Invalid plugin request path");
    const url = new URL(`${base}${path}`, window.location.origin);
    if (
      url.origin !== window.location.origin ||
      !url.pathname.startsWith(`${base}/`)
    )
      throw new Error("Plugin request must stay inside its namespace");
    const response = await fetch(url, {
      ...init,
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
    });
    if (response.status === 204) return undefined as T;
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      if (response.status === 401)
        throw new Error(copy("Сессия истекла. Войдите снова."));
      if (response.status === 403)
        throw new Error(copy("Нет доступа к этому действию или записи."));
      if (response.status === 404)
        throw new Error(copy("Запись или расширение больше недоступны."));
      throw new Error(
        result?.message ?? copy("Не удалось выполнить запрос расширения"),
      );
    }
    return result as T;
  };
}
