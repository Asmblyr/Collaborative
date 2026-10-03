"use client";

import { useState } from "react";
import { ArrowLeft, Braces, Check, ChevronDown, ChevronRight, Link2, Plus } from "lucide-react";
import { Button } from "@asmblyr/kit/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ItemFilterMenu } from "./item-filter-menu";
import { presenceCondition, scopeForCondition } from "./item-filter-presence";
import { relationSelectionCondition, relationSelectionScope } from "./item-filter-relation";
import type { FilterCondition, FilterField, FilterScope } from "./item-filter-options";

export function ItemFilterFieldPicker({ scopes, condition, disabled = false, onSelect, onAddGroup }: {
  scopes: FilterScope[];
  condition?: FilterCondition;
  disabled?: boolean;
  onSelect: (condition: FilterCondition) => void;
  onAddGroup?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [scopeId, setScopeId] = useState("$root");
  const [query, setQuery] = useState("");
  const [selectedNewField, setSelectedNewField] = useState(false);
  const scope = scopes.find((entry) => entry.id === scopeId) ?? scopes[0];
  const search = query.trim().toLocaleLowerCase();
  const root = scope.id === "$root";
  const relationIds = new Set(scopes.slice(1).map((entry) => entry.id));
  const fields = scope.fields.filter((field) => !(root && relationIds.has(field.name)) &&
    (field.name.split(".").at(-1) ?? "").toLocaleLowerCase().includes(search));
  const relations = root ? scopes.slice(1).filter((entry) =>
    (entry.id + " " + entry.collection).toLocaleLowerCase().includes(search)) : [];
  const relatedMatches = root && search ? scopes.slice(1).flatMap((entry) => entry.fields)
    .filter((field) => field.label.toLocaleLowerCase().includes(search)) : [];
  const directKey = !root ? scopes[0].fields.find((field) => field.name === scope.id) : undefined;
  const showKey = directKey && (directKey.name + " значение ключа").toLocaleLowerCase().includes(search);
  const showPresence = scope.presenceField && "наличие связи есть нет связанных записей".includes(search);
  const selectedPresence = !!condition && ["exists", "notExists"].includes(condition.op);
  const selectedRelation = condition ? relationSelectionScope(scopes, condition) : undefined;
  const triggerLabel = condition ? selectedRelation?.id ?? (selectedPresence ? scopeForCondition(scopes, condition).id :
    condition.field.replace(".", " › ")) : "Добавить условие";

  function select(next: FilterCondition) {
    const same = condition?.field === next.field && selectedPresence === ["exists", "notExists"].includes(next.op);
    if (!same) {
      setSelectedNewField(true);
      onSelect(next);
    }
    setOpen(false);
  }

  function fieldChoice(field: FilterField, fullPath = false, label?: string) {
    return <Button key={field.name} type="button" variant="ghost" size="sm"
      className="h-9 w-full justify-start gap-2 px-2 font-normal" onClick={() => select({
        field: field.name, op: field.type === "text" ? "contains" : "eq", value: "",
        ...(field.relationKind === "o2m" || field.relationKind === "m2m" ? { quantifier: "some" as const } : {}),
      })}>
      <span className="min-w-0 flex-1 truncate text-left">{label ?? (fullPath ?
        field.name.replace(".", " › ") : field.name.split(".").at(-1))}</span>
      {condition?.field === field.name && !selectedPresence && <Check aria-hidden="true" className="size-4 text-primary" />}
    </Button>;
  }

  return <Popover open={open} onOpenChange={(next) => {
    setOpen(next);
    if (next) {
      setSelectedNewField(false);
      setScopeId(condition ? (scopes.find((entry) => entry.id === condition.field)?.id ??
        scopeForCondition(scopes, condition).id) : "$root");
      setQuery("");
    }
  }}>
    <PopoverTrigger asChild>
      <Button type="button" variant="ghost" size="sm" disabled={disabled}
        aria-label={condition ? "Поле условия: " + triggerLabel : "Добавить условие"}
        className={condition ? "h-8 min-w-0 max-w-full gap-1 rounded-md px-2 font-medium" :
          "h-8 gap-1.5 px-2 text-muted-foreground hover:text-foreground"}>
        {!condition && <Plus aria-hidden="true" className="size-3.5" />}
        <span className="truncate">{triggerLabel}</span>
        <ChevronDown aria-hidden="true" className="size-3 opacity-50" />
      </Button>
    </PopoverTrigger>
    <PopoverContent align="start" sideOffset={5} className="w-[min(21rem,calc(100vw-2rem))] p-0"
      onCloseAutoFocus={(event) => { if (selectedNewField) event.preventDefault(); }}>
      {!root && <div className="flex items-center gap-1 border-b p-1.5">
        <Button type="button" size="icon-sm" variant="ghost" aria-label="Назад к полям коллекции"
          onClick={() => { setScopeId("$root"); setQuery(""); }}><ArrowLeft aria-hidden="true" /></Button>
        <div className="min-w-0 text-xs">
          <p className="truncate font-medium">{scope.id}</p>
          <p className="truncate text-muted-foreground">{scope.collection}</p>
        </div>
      </div>}
      <ItemFilterMenu query={query} onQueryChange={setQuery} placeholder="Найти поле или связь…">
        {showPresence && <Button type="button" variant="ghost" size="sm"
          className="h-9 w-full justify-start font-normal" onClick={() => select(presenceCondition(scope, true))}>
          <Link2 aria-hidden="true" className="size-3.5 text-muted-foreground" /> Наличие связанных записей
        </Button>}
        {showKey && fieldChoice(directKey, false, "Значение ключа связи")}
        {fields.map((field) => fieldChoice(field))}
        {relations.length > 0 && <>
          <p className="px-2 pb-1 pt-3 text-[11px] font-medium text-muted-foreground">Связи</p>
          {relations.map((entry) => <div key={entry.id} className="flex items-center rounded-md hover:bg-muted/50">
            <Button type="button" variant="ghost" size="sm"
              aria-label={"Выбрать записи связи " + entry.id}
              className="h-9 min-w-0 flex-1 justify-start gap-2 rounded-r-none px-2 font-normal"
              onClick={() => select(relationSelectionCondition(entry))}>
              <Link2 aria-hidden="true" className="size-3.5 text-muted-foreground/70" />
              <span className="min-w-0 flex-1 truncate text-left">{entry.id}</span>
              {selectedRelation?.id === entry.id && <Check aria-hidden="true" className="size-4 text-primary" />}
            </Button>
            <Button type="button" variant="ghost" size="icon-sm"
              aria-label={"Поля связи " + entry.id + ", коллекция " + entry.collection}
              className="h-9 w-9 shrink-0 rounded-l-none border-l border-border/60"
              onClick={() => { setScopeId(entry.id); setQuery(""); }}>
              <ChevronRight aria-hidden="true" className="size-3.5 text-muted-foreground" />
            </Button>
          </div>)}
        </>}
        {relatedMatches.length > 0 && <>
          <p className="px-2 pb-1 pt-3 text-[11px] font-medium text-muted-foreground">Поля в связях</p>
          {relatedMatches.map((field) => fieldChoice(field, true))}
        </>}
        {!fields.length && !relations.length && !relatedMatches.length && !showPresence && !showKey &&
          <p className="p-3 text-center text-xs text-muted-foreground">Ничего не найдено</p>}
      </ItemFilterMenu>
      {root && onAddGroup && !search && <div className="border-t p-1.5">
        <Button type="button" variant="ghost" size="sm" className="w-full justify-start font-normal"
          onClick={() => { onAddGroup(); setOpen(false); }}>
          <Braces aria-hidden="true" className="size-3.5" /> Группа условий И / ИЛИ
        </Button>
      </div>}
    </PopoverContent>
  </Popover>;
}
