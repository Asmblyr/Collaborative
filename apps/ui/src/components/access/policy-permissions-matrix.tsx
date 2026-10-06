"use client";

import { useState } from "react";
import { Settings2, X } from "lucide-react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { Input } from "@asmblyr-collaborative/kit/ui/input";
import { PolicyActionDialog } from "./policy-action-dialog";
import type { DraftGrant } from "./policy-draft";
import { actionName, type Action, type PolicyCollection } from "./types";
import { useUiCopy } from "@/lib/ui-copy";

const actions: Action[] = ["create", "read", "update", "delete"];

export function PolicyPermissionsMatrix({
  readOnly = false,
  collections,
  grants,
  onChange,
  policyName,
}: {
  readOnly?: boolean;
  collections: PolicyCollection[];
  grants: DraftGrant[];
  onChange: (grants: DraftGrant[]) => void;
  policyName?: string;
}) {
  const copy = useUiCopy();

  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<{
    collection: PolicyCollection;
    action: Action;
    index: number;
  } | null>(null);
  const visible = collections.filter((collection) =>
    [collection.name, collection.displayName ?? ""].some((name) =>
      name.toLowerCase().includes(query.toLowerCase().trim()),
    ),
  );
  function open(
    collection: PolicyCollection,
    action: Action,
    index = grants.findIndex(
      (grant) =>
        grant.collection === collection.name && grant.action === action,
    ),
  ) {
    if (collection.sourceKind === "materialized-view" && action !== "read") {
      return;
    }
    setEditing({ collection, action, index });
  }
  function save(grant: DraftGrant | null) {
    if (!editing || readOnly) {
      return;
    }
    const next = grants.filter((_entry, index) => index !== editing.index);
    onChange(grant ? [...next, grant] : next);
  }
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="font-semibold">{copy("Доступ к коллекциям")}</h3>
          <p className="text-xs text-muted-foreground">
            {copy("Выберите действие, чтобы настроить записи и поля. ")}
          </p>
        </div>
        <Input
          aria-label={copy("Найти коллекцию")}
          placeholder={copy("Поиск коллекции")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="w-full sm:w-56"
        />
      </div>
      <div className="overflow-hidden rounded-xl border">
        <div className="hidden grid-cols-[minmax(12rem,1fr)_minmax(0,2fr)] border-b bg-muted/40 px-4 py-3 text-xs font-medium text-muted-foreground sm:grid">
          <span>{copy("Коллекция")}</span>
          <span>{copy("Действия")}</span>
        </div>
        {visible.map((collection) => {
          const active = grants.filter(
            (grant) => grant.collection === collection.name,
          );
          return (
            <div
              key={collection.name}
              className="border-b last:border-b-0"
            >
              <div className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(12rem,1fr)_minmax(0,2fr)] sm:items-center">
                <span
                  className="min-w-0 truncate font-medium"
                  title={collection.name}
                >
                  {collection.displayName || collection.name}
                </span>
                <div className="flex flex-wrap items-center gap-1.5">
                  {actions
                    .filter(
                      (action) =>
                        collection.sourceKind !== "materialized-view" ||
                        action === "read",
                    )
                    .map((action) => {
                      const rules = active.filter(
                        (entry) => entry.action === action,
                      );
                      return (
                        <Button
                          key={action}
                          type="button"
                          size="sm"
                          variant={rules.length ? "default" : "outline"}
                          className="h-8 rounded-full px-3 text-xs"
                          aria-pressed={Boolean(rules.length)}
                          aria-label={copy("{{value0}}: {{value1}}{{value2}}", {
                            value0: collection.name,
                            value1: copy(actionName[action]),
                            value2: rules.length
                              ? copy(" включено")
                              : copy(" выключено"),
                          })}
                          title={
                            rules.some((rule) => rule.rowFilter)
                              ? copy("Доступ по условию")
                              : copy("Настроить доступ")
                          }
                          onClick={() => open(collection, action)}
                        >
                          {copy(actionName[action])}
                          {rules.some((rule) => rule.rowFilter) && (
                            <span className="size-1.5 rounded-full bg-current opacity-70" />
                          )}
                        </Button>
                      );
                    })}
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label={copy("Настроить доступ коллекции {{value0}}", {
                      value0: collection.name,
                    })}
                    title={copy("Настроить доступ")}
                    onClick={() => open(collection, "read")}
                  >
                    <Settings2 className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    disabled={readOnly || !active.length}
                    aria-label={copy(
                      "Убрать все действия коллекции {{value0}}",
                      { value0: collection.name },
                    )}
                    title={copy("Убрать коллекцию из политики")}
                    onClick={() =>
                      onChange(
                        grants.filter(
                          (grant) => grant.collection !== collection.name,
                        ),
                      )
                    }
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              </div>
              {actions
                .filter(
                  (action) =>
                    active.filter((rule) => rule.action === action).length > 1,
                )
                .map((action) => (
                  <div
                    key={action}
                    className="flex flex-wrap items-center gap-1 px-4 pb-3 text-xs text-muted-foreground"
                  >
                    <span>{copy(actionName[action])}:</span>
                    {grants
                      .flatMap((grant, index) =>
                        grant.collection === collection.name &&
                        grant.action === action
                          ? [{ grant, index }]
                          : [],
                      )
                      .map(({ grant, index }, number) => (
                        <Button
                          key={index}
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => open(collection, action, index)}
                        >
                          {copy("Правило ")}
                          {number + 1} ·{" "}
                          {grant.rowFilter
                            ? copy("По условию")
                            : copy("Все записи")}
                        </Button>
                      ))}
                  </div>
                ))}
            </div>
          );
        })}
        {!visible.length && (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            {collections.length
              ? copy("Коллекции не найдены.")
              : copy("Коллекций пока нет.")}
          </p>
        )}
      </div>
      {editing && (
        <PolicyActionDialog
          readOnly={readOnly}
          key={`${editing.collection.name}:${editing.action}:${editing.index}`}
          collection={editing.collection}
          action={editing.action}
          initial={grants[editing.index]}
          policyName={policyName}
          onSave={save}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}
