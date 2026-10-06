import { useStorage, type HookContext } from "@asmblyr-collaborative/kit";
import entries from "../collections/entries.js";

export async function deleteComments(
  context: HookContext,
  collection: string,
  item?: string,
): Promise<void> {
  const storage = useStorage(context, entries);
  // Always read page one: each batch is removed in the parent mutation's transaction.
  for (;;) {
    const result = await storage.list({
      limit: 100,
      filter: {
        logic: "and",
        children: [
          { field: "collection", op: "eq", value: collection },
          ...(item === undefined
            ? []
            : [{ field: "item", op: "eq" as const, value: item }]),
        ],
      },
    });
    if (!result.data.length) {
      return;
    }
    for (const row of result.data) {
      await storage.delete(row.id);
    }
  }
}
