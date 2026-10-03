import { ApiError, type ItemCommitDraft } from "@asmblyr/sdk";
import { asmblyr } from "./asmblyr";

/** Keep the entire editor draft in the existing atomic commit operation. */
export async function saveEditorDraft(
  collection: string,
  draft: ItemCommitDraft,
): Promise<string> {
  try {
    const result = await asmblyr.items.commit(collection, draft, {
      timeoutMs: 0,
    });
    return result.data.id;
  } catch (error) {
    if (
      error instanceof ApiError &&
      error.code === "RELATION_PARENT_CONFLICT"
    ) {
      throw new Error(
        "Одна из записей уже привязана к другой карточке. Изменения не сохранены. Отмените её добавление в черновике.",
        { cause: error },
      );
    }
    throw error;
  }
}
