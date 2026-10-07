import type { Collection } from "@/components/items/types";
import type { NavCollection } from "@/components/layout/admin-navigation";

export function collectionNavigationEntries(
  catalog: Collection[],
): NavCollection[] {
  return catalog
    .filter(({ access }) => access.read || access.create || access.update)
    .map(
      ({
        name,
        displayName,
        translations,
        hidden,
        folderId,
        parentCollection,
        access,
      }) => ({
        name,
        displayName,
        translations,
        hidden,
        folderId,
        parentCollection,
        readable: Boolean(access.read),
      }),
    );
}
