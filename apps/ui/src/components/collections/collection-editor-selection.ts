import type { MaterializedViewCandidate } from "@asmblyr-collaborative/contracts";
import type { Collection, CollectionFolder } from "@/components/items/types";
import type { UiCopy } from "@/lib/ui-copy-types";
import type { FieldChoice } from "./field-type-picker";

export type CollectionEditorSelection =
  | { kind: "materialized"; view?: MaterializedViewCandidate }
  | { kind: "form"; collection: string }
  | { kind: "display"; collection: string }
  | { kind: "collection"; folderId?: string }
  | { kind: "folder"; folder?: CollectionFolder }
  | { kind: "field"; collection: string; field?: string; choice?: FieldChoice }
  | { kind: "delete-field"; collection: string; field: string }
  | { kind: "delete-collection"; collection: string };

export function isRelationChoice(
  choice: FieldChoice,
): choice is "m2o" | "o2m" | "m2m" {
  return choice === "m2o" || choice === "o2m" || choice === "m2m";
}

export function collectionEditorTitle(
  selection: CollectionEditorSelection | null,
  collections: Collection[],
  copy: UiCopy,
): string {
  switch (selection?.kind) {
    case "materialized":
      return copy("Подключить представление");
    case "form":
      return copy("Организация формы");
    case "display":
      return copy("Настройки коллекции");
    case "collection":
      return copy("Новая коллекция");
    case "folder":
      return selection.folder
        ? copy("Папка {{value0}}", { value0: selection.folder.name })
        : copy("Новая папка");
    case "delete-field":
      return copy("Удалить поле {{value0}}", { value0: selection.field });
    case "delete-collection": {
      const view =
        collections.find(
          (collection) => collection.name === selection.collection,
        )?.sourceKind === "materialized-view";
      return view
        ? copy("Отключить представление {{value0}}", {
            value0: selection.collection,
          })
        : copy("Удалить коллекцию {{value0}}", {
            value0: selection.collection,
          });
    }
    case "field":
      return selection.field
        ? copy("Настройка поля {{value0}}", { value0: selection.field })
        : copy("Добавить поле");
    default:
      return copy("Добавить поле");
  }
}
