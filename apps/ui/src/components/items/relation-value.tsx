import { ArrowUpRight } from "lucide-react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { itemLabelField } from "./item-label";
import { useRelationItems } from "./use-relation-items";
import type { Collection } from "./types";

export function RelationValue({
  collection,
  id,
  onOpen,
}: {
  collection: Collection;
  id: string;
  onOpen: () => void;
}) {
  const items = useRelationItems(
    collection.name,
    collection.primaryKey.name,
    itemLabelField(collection),
    id ? [id] : [],
    false,
    collection.displayTemplate,
  );
  if (!id) return <p className="text-sm text-muted-foreground">—</p>;
  if (collection.system) {
    return <p className="break-words text-sm">{items.labels.get(id) ?? id}</p>;
  }
  return (
    <Button
      type="button"
      variant="ghost"
      className="h-auto max-w-full justify-start px-0 text-left font-normal"
      onClick={onOpen}
    >
      <span className="truncate">{items.labels.get(id) ?? id}</span>
      <ArrowUpRight className="size-4 shrink-0" />
    </Button>
  );
}
