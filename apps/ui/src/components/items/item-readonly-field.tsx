import { FileField } from "@/components/files/file-field";
import { ContentValue } from "./content-value";
import { RelationValue } from "./relation-value";
import { inputValue } from "./item-input-values";
import type { OpenRelated } from "./relation-picker";
import type { Collection, CollectionField, Item } from "./types";

export function ItemReadonlyField({ field, item, catalog, onOpenRelated }: {
  field: CollectionField; item: Item; catalog: Collection[]; onOpenRelated?: OpenRelated;
}) {
  const target = field.relation?.kind === "m2o" ? catalog.find((c) => c.name === field.relation?.collection && c.access.read) : undefined;
  const id = item[field.name] == null ? "" : String(item[field.name]);
  return field.type === "file" || field.type === "files" ? <FileField value={inputValue(field, item)} multiple={field.type === "files"} />
    : target ? <RelationValue collection={target} id={id} onOpen={() => onOpenRelated?.(target.name, id, undefined, field.name)} />
      : <ContentValue field={field} value={item[field.name]} />;
}
