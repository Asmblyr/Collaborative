import { ApiError, type ItemResult, type JsonRecord } from "@asmblyr/sdk";
import { asmblyr } from "./asmblyr";
import { requestJson } from "./http-request";

/** Link attributes use a dedicated relation endpoint until SDK relation support exists. */
export async function readEditorItem(
  collection: string,
  id: string,
  signal?: AbortSignal,
  linkEndpoint?: string,
): Promise<ItemResult<JsonRecord>> {
  try {
    if (linkEndpoint)
      return await requestJson(linkEndpoint, "GET", undefined, signal);
    return await asmblyr.items.get(collection, id, undefined, { signal });
  } catch (error) {
    const status =
      error instanceof ApiError || (error instanceof Error && "status" in error)
        ? error.status
        : undefined;
    if (status === 404) throw new Error("Запись не найдена или уже удалена.");
    if (status === 403) throw new Error("У вас нет доступа к этой записи.");
    if (status === 400) throw new Error("Некорректный адрес записи.");
    throw error;
  }
}
