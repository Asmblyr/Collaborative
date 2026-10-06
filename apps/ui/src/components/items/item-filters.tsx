"use client";

import { useState, type FormEvent } from "react";
import { Bookmark, ListFilter, X } from "lucide-react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@asmblyr-collaborative/kit/ui/tabs";
import { ItemFilterGroup } from "./item-filter-group";
import { ItemFilterPresets } from "./item-filter-presets";
import {
  addFilterNode,
  normalizeFilter,
  removeFilterNode,
  replaceFilterNode,
} from "./item-filter-model";
import {
  filterCount,
  filterScopes,
  readFilter,
  type FilterGroup,
} from "./item-filter-options";
import type { Collection } from "./types";
import { useUiCopy } from "@/lib/ui-copy";

export function itemFilterCount(raw: string): number {
  return filterCount(readFilter(raw));
}

export function ItemFilters({
  collection,
  catalog,
  userId,
  filter,
  onApply,
}: {
  collection: Collection;
  catalog: Collection[];
  userId: string;
  filter: string;
  onApply: (group: FilterGroup | null) => void;
}) {
  const copy = useUiCopy();

  const scopes = filterScopes(collection, catalog);
  const [group, setGroup] = useState<FilterGroup>(() => readFilter(filter));
  const [message, setMessage] = useState("");
  const [open, setOpen] = useState(false);
  const [focusPath, setFocusPath] = useState<string | null>(null);
  const total = filterCount(group);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const next = normalizeFilter(group, scopes, copy);
      setMessage("");
      setOpen(false);
      onApply(next.children.length > 0 ? next : null);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : copy("Проверьте фильтр"),
      );
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setGroup(readFilter(filter));
          setMessage("");
          setFocusPath(null);
        }
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant={filter ? "secondary" : "outline"}
          size="sm"
        >
          <ListFilter aria-hidden="true" /> {copy(" Фильтры ")}
          {filter && (
            <span className="ml-0.5 rounded bg-foreground/10 px-1.5 text-xs">
              {itemFilterCount(filter)}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        aria-label={copy("Настройка фильтров")}
        className="flex max-h-[min(85vh,var(--radix-popover-content-available-height))] w-[min(36rem,calc(100vw-2rem))] flex-col overflow-hidden p-0"
      >
        <Tabs
          defaultValue="conditions"
          className="flex min-h-0 flex-col"
        >
          <div className="flex items-center justify-between border-b px-3 py-2">
            <TabsList className="h-8 bg-transparent p-0">
              <TabsTrigger
                value="conditions"
                className="gap-1.5 text-xs data-[state=active]:bg-muted data-[state=active]:shadow-none"
              >
                <ListFilter
                  aria-hidden="true"
                  className="size-3.5"
                />{" "}
                {copy("Фильтры ")}
                {total > 0 && (
                  <span className="text-muted-foreground">{total}</span>
                )}
              </TabsTrigger>
              <TabsTrigger
                value="presets"
                className="gap-1.5 text-xs data-[state=active]:bg-muted data-[state=active]:shadow-none"
              >
                <Bookmark
                  aria-hidden="true"
                  className="size-3.5"
                />{" "}
                {copy("Сохранённые ")}
              </TabsTrigger>
            </TabsList>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={copy("Закрыть фильтры")}
              className="h-7 w-7 text-muted-foreground"
              onClick={() => setOpen(false)}
            >
              <X
                aria-hidden="true"
                className="size-3.5"
              />
            </Button>
          </div>
          <TabsContent
            value="conditions"
            className="min-h-0"
          >
            <form
              onSubmit={submit}
              className="flex max-h-[65vh] flex-col"
              aria-label={copy("Фильтры записей")}
            >
              <div className="min-h-0 overflow-y-auto p-3">
                <ItemFilterGroup
                  group={group}
                  path={[]}
                  depth={1}
                  total={total}
                  scopes={scopes}
                  focusPath={focusPath}
                  onEdit={(path, node) => {
                    setGroup((current) =>
                      replaceFilterNode(current, path, node),
                    );
                    if (!("logic" in node)) setFocusPath(path.join("."));
                    setMessage("");
                  }}
                  onAdd={(path, node) => {
                    const parent = path.reduce<FilterGroup>(
                      (current, index) =>
                        current.children[index] as FilterGroup,
                      group,
                    );
                    setGroup((current) => addFilterNode(current, path, node));
                    setFocusPath(
                      "logic" in node
                        ? null
                        : [...path, parent.children.length].join("."),
                    );
                    setMessage("");
                  }}
                  onRemove={(path) => {
                    setGroup((current) => removeFilterNode(current, path));
                    setFocusPath(null);
                    setMessage("");
                  }}
                />
              </div>
              {message && (
                <p
                  role="alert"
                  className="px-4 pb-3 text-xs text-destructive"
                >
                  {copy(message)}
                </p>
              )}
              <div className="flex shrink-0 items-center justify-between gap-2 border-t bg-muted/20 px-3 py-2.5">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground"
                  disabled={!filter && group.children.length === 0}
                  onClick={() => {
                    setGroup({ logic: "and", children: [] });
                    setMessage("");
                    setFocusPath(null);
                    if (filter) {
                      setOpen(false);
                      onApply(null);
                    }
                  }}
                >
                  {copy("Сбросить ")}
                </Button>
                <Button
                  type="submit"
                  size="sm"
                >
                  {copy("Применить ")}
                </Button>
              </div>
            </form>
          </TabsContent>
          <TabsContent
            value="presets"
            className="min-h-0 overflow-y-auto px-4 pb-4"
          >
            <ItemFilterPresets
              collection={collection.name}
              legacyKey={
                "asmblyr.items.filters." + userId + "." + collection.name
              }
              current={() => normalizeFilter(group, scopes, copy)}
              onLoad={(saved) => {
                const next = normalizeFilter(saved, scopes, copy);
                setGroup(next);
                setOpen(false);
                onApply(next.children.length ? next : null);
              }}
            />
          </TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>
  );
}
