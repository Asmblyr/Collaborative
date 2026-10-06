import { RelationPanel } from "./relation-panel";
import type { Collection, CollectionField } from "./types";
import type { RecordDraft } from "./record-draft-model";
import type { RecordEditorRequest } from "./record-editor-types";

export function ItemAliasField({
  field,
  collection,
  catalog,
  itemId,
  draft,
  onDraftChange,
  onEdit,
  busy,
  container,
}: {
  field: CollectionField;
  collection: Collection;
  catalog: Collection[];
  itemId: string;
  draft: RecordDraft;
  onDraftChange(draft: RecordDraft): void;
  onEdit(request: RecordEditorRequest): void;
  busy: boolean;
  container: HTMLElement | null;
}) {
  const readable = collection.access.read;
  const target = catalog.find((c) => c.name === field.relation?.collection);
  if (
    !target?.access.read ||
    !readable ||
    (!readable.includes("*") && !readable.includes(field.name))
  ) {
    return null;
  }
  if (
    field.relation?.kind === "o2m" &&
    !target.access.read.includes("*") &&
    !target.access.read.includes(field.relation.throughField)
  ) {
    return null;
  }
  return (
    <RelationPanel
      collection={collection.name}
      itemId={itemId}
      field={field}
      target={target}
      catalog={catalog}
      portalContainer={container}
      onEdit={onEdit}
      busy={busy}
      draft={draft.relations?.[field.name] ?? {}}
      onDraftChange={(changes) =>
        onDraftChange({
          ...draft,
          relations: { ...draft.relations, [field.name]: changes },
        })
      }
    />
  );
}
