import { ArrowDown, ArrowUp, Folder, TextCursorInput } from "lucide-react";
import { Button } from "@asmblyr/kit/ui/button";
import type { FormLayout, FormNode } from "@/components/items/presentation-types";
import type { CollectionField } from "@/components/items/types";

export function FormDesignerTree({
  layout,
  fields,
  selected,
  disabled,
  onSelect,
  onMove,
}: {
  layout: FormLayout;
  fields: CollectionField[];
  selected: string;
  disabled: boolean;
  onSelect: (id: string) => void;
  onMove: (id: string, offset: number) => void;
}) {
  function row(id: string, label: string, index: number, count: number, icon: React.ReactNode) {
    return (
      <div
        className={`group flex min-w-0 items-center gap-0.5 rounded-lg p-1 ${selected === id ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-muted/60"}`}
      >
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="min-w-0 flex-1 justify-start gap-2 px-2 font-normal"
          aria-pressed={selected === id}
          disabled={disabled}
          onClick={() => onSelect(id)}
        >
          {icon}
          <span className="truncate">{label}</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Поднять ${label}`}
          disabled={disabled || index === 0}
          onClick={() => onMove(id, -1)}
        >
          <ArrowUp className="size-3" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Опустить ${label}`}
          disabled={disabled || index === count - 1}
          onClick={() => onMove(id, 1)}
        >
          <ArrowDown className="size-3" />
        </Button>
      </div>
    );
  }
  const nodes = (entries: FormNode[]): React.ReactNode => (
    <div className="ml-3 space-y-1 border-l pl-2">
      {entries.map((node, index) => (
        <div key={node.id}>
          {row(
            node.id,
            node.kind === "field"
              ? fields.find((f) => f.name === node.field)?.presentation?.label || node.field
              : node.label,
            index,
            entries.length,
            node.kind === "group" ? (
              <Folder className="size-3.5 text-muted-foreground" />
            ) : (
              <TextCursorInput className="size-3.5 text-muted-foreground" />
            ),
          )}
          {node.kind === "group" && nodes(node.children)}
        </div>
      ))}
    </div>
  );
  return (
    <nav aria-label="Структура формы" className="space-y-3">
      {layout.tabs.map((tab, index) => (
        <div key={tab.id} className="space-y-1">
          {row(
            tab.id,
            tab.label,
            index,
            layout.tabs.length,
            <span className="rounded border px-1 text-[10px] text-muted-foreground">TAB</span>,
          )}
          {nodes(tab.children)}
        </div>
      ))}
    </nav>
  );
}