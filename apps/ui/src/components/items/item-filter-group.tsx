"use client";

import { X } from "lucide-react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@asmblyr-collaborative/kit/ui/select";
import { ItemFilterCondition } from "./item-filter-condition";
import { ItemFilterFieldPicker } from "./item-filter-field-picker";
import type { FilterPath } from "./item-filter-model";
import type {
  FilterGroup,
  FilterNode,
  FilterScope,
} from "./item-filter-options";
import { useUiCopy } from "@/lib/ui-copy";

interface Props {
  group: FilterGroup;
  path: FilterPath;
  depth: number;
  total: number;
  scopes: FilterScope[];
  focusPath: string | null;
  onEdit: (path: FilterPath, node: FilterNode) => void;
  onAdd: (path: FilterPath, node: FilterNode) => void;
  onRemove: (path: FilterPath) => void;
}

export function ItemFilterGroup({
  group,
  path,
  depth,
  total,
  scopes,
  focusPath,
  onEdit,
  onAdd,
  onRemove,
}: Props) {
  const copy = useUiCopy();

  const root = depth === 1;
  return (
    <section
      className={
        root
          ? "space-y-2"
          : "space-y-2 rounded-r-md border-l-2 border-primary/30 py-1 pl-3"
      }
      aria-label={root ? copy("Фильтр записей") : copy("Группа условий")}
    >
      {(!root || group.children.length > 1) && (
        <div className="flex items-center gap-1">
          <span className="pl-1 text-xs text-muted-foreground">
            {copy("Совпадает")}
          </span>
          <Select
            value={group.logic}
            onValueChange={(logic) =>
              onEdit(path, { ...group, logic: logic as "and" | "or" })
            }
          >
            <SelectTrigger
              aria-label={copy("Логика группы")}
              size="sm"
              className="h-7 border-0 bg-transparent px-1.5 text-xs shadow-none dark:bg-transparent"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="and">
                {copy("всё перечисленное · И")}
              </SelectItem>
              <SelectItem value="or">{copy("хотя бы одно · ИЛИ")}</SelectItem>
            </SelectContent>
          </Select>
          {!root && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="ml-auto h-7 w-7 text-muted-foreground/60"
              aria-label={copy("Удалить группу")}
              onClick={() => onRemove(path)}
            >
              <X
                aria-hidden="true"
                className="size-3.5"
              />
            </Button>
          )}
        </div>
      )}
      {root && group.children.length === 0 && (
        <p className="px-2 pb-2 pt-1 text-sm text-muted-foreground">
          {copy("Выберите поле и задайте условие отбора. ")}
        </p>
      )}
      <div className="space-y-2">
        {group.children.map((child, index) => {
          const childPath = [...path, index];
          const key = childPath.join(".");
          return "logic" in child ? (
            <ItemFilterGroup
              key={key}
              group={child}
              path={childPath}
              depth={depth + 1}
              total={total}
              scopes={scopes}
              focusPath={focusPath}
              onEdit={onEdit}
              onAdd={onAdd}
              onRemove={onRemove}
            />
          ) : (
            <ItemFilterCondition
              key={key}
              condition={child}
              scopes={scopes}
              autoFocus={focusPath === key}
              onChange={(next) => onEdit(childPath, next)}
              onRemove={() => onRemove(childPath)}
            />
          );
        })}
      </div>
      <ItemFilterFieldPicker
        scopes={scopes}
        disabled={
          total >= 20 || scopes.every((scope) => scope.fields.length === 0)
        }
        onSelect={(condition) => onAdd(path, condition)}
        onAddGroup={
          depth < 3
            ? () =>
                onAdd(path, {
                  logic: group.logic === "and" ? "or" : "and",
                  children: [],
                })
            : undefined
        }
      />
      {root && total >= 20 && (
        <p className="px-2 text-xs text-muted-foreground">
          {copy("Можно добавить до 20 условий. ")}
        </p>
      )}
    </section>
  );
}
