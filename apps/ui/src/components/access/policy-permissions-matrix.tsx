"use client";

import { useState } from "react";
import { Plus, Settings2, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { Input } from "@asmblyr-collaborative/kit/ui/input";
import { PolicyActionDialog } from "./policy-action-dialog";
import { conditionSummary, permissionFields } from "./policy-condition-model";
import {
  isSimpleUnconditionalGrant,
  toggleUnconditionalGrant,
  type DraftGrant,
} from "./policy-draft";
import { accessText, matchesAccessSearch } from "./access-helpers";
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
  const [confirmClear, setConfirmClear] = useState<string | null>(null);
  const [editing, setEditing] = useState<{
    collection: PolicyCollection;
    action: Action;
    index: number;
  } | null>(null);
  const visible = collections.filter((collection) =>
    matchesAccessSearch([collection.name, collection.displayName], query),
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
  function quickToggle(collection: PolicyCollection, action: Action) {
    if (collection.sourceKind === "materialized-view" && action !== "read") {
      return;
    }
    if (readOnly) {
      open(collection, action);
      return;
    }
    const result = toggleUnconditionalGrant(grants, collection.name, action);
    if (result.kind === "toggled") {
      onChange(result.grants);
    } else {
      open(collection, action);
    }
  }
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="font-semibold">{copy("Доступ к коллекциям")}</h3>
          <p className="text-xs text-muted-foreground">
            {readOnly
              ? copy("Выберите действие, чтобы настроить записи и поля.")
              : copy(
                  "Нажмите действие для быстрого переключения «Все записи» или значок настройки для условий и полей.",
                )}
          </p>
          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              aria-hidden="true"
              className="inline-block size-2 rounded-full bg-primary"
            />
            {accessText(
              copy.locale,
              "Точка рядом с действием означает доступ по условию.",
              "A dot next to an action indicates conditional row-level access.",
            )}
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
                      const isEnabled = rules.length > 0;
                      const isConditional = rules.some(
                        (rule) => rule.rowFilter,
                      );
                      const isSimpleToggle =
                        !readOnly &&
                        (rules.length === 0 ||
                          (rules.length === 1 &&
                            isSimpleUnconditionalGrant(rules[0])));
                      return (
                        <div
                          key={action}
                          className={`inline-flex items-center rounded-full border transition-colors ${
                            isEnabled
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-input bg-background text-foreground"
                          }`}
                        >
                          <button
                            type="button"
                            className={`inline-flex h-8 items-center gap-1.5 rounded-l-full pl-3 ${
                              readOnly ? "rounded-r-full pr-3" : "pr-2"
                            } text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                              isEnabled
                                ? "hover:bg-primary/90"
                                : "hover:bg-accent hover:text-accent-foreground"
                            }`}
                            aria-pressed={
                              isSimpleToggle ? isEnabled : undefined
                            }
                            aria-haspopup={
                              isSimpleToggle ? undefined : "dialog"
                            }
                            aria-label={copy(
                              "{{value0}}: {{value1}}{{value2}}",
                              {
                                value0: collection.name,
                                value1: copy(actionName[action]),
                                value2: isEnabled
                                  ? ` ${copy("включено")}`
                                  : ` ${copy("выключено")}`,
                              },
                            )}
                            title={
                              isConditional
                                ? copy("Доступ по условию")
                                : isSimpleToggle
                                  ? isEnabled
                                    ? copy("Выключить «Все записи»")
                                    : copy("Включить «Все записи»")
                                  : copy("Настроить доступ")
                            }
                            onClick={() => quickToggle(collection, action)}
                          >
                            {copy(actionName[action])}
                            {isConditional && (
                              <span className="size-1.5 rounded-full bg-current opacity-70" />
                            )}
                          </button>
                          {!readOnly && (
                            <button
                              type="button"
                              className={`inline-flex h-8 items-center justify-center rounded-r-full border-l px-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                                isEnabled
                                  ? "border-primary-foreground/20 hover:bg-primary/80"
                                  : "border-border hover:bg-accent hover:text-accent-foreground"
                              }`}
                              aria-haspopup="dialog"
                              aria-label={copy(
                                "Настроить условия и поля: {{value0}} — {{value1}}",
                                {
                                  value0: collection.name,
                                  value1: copy(actionName[action]),
                                },
                              )}
                              title={copy("Условия и поля")}
                              onClick={() => open(collection, action)}
                            >
                              <SlidersHorizontal
                                aria-hidden="true"
                                className="size-3"
                              />
                            </button>
                          )}
                        </div>
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
                  {confirmClear === collection.name ? (
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        className="h-7 px-2.5 text-xs"
                        onClick={() => {
                          setConfirmClear(null);
                          onChange(
                            grants.filter(
                              (grant) => grant.collection !== collection.name,
                            ),
                          );
                        }}
                      >
                        {copy("Сбросить")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={() => setConfirmClear(null)}
                      >
                        {copy("Отмена")}
                      </Button>
                    </div>
                  ) : (
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
                      onClick={() => setConfirmClear(collection.name)}
                    >
                      <X className="size-4" />
                    </Button>
                  )}
                </div>
              </div>
              {actions
                .filter((action) => {
                  const rules = active.filter((rule) => rule.action === action);
                  const hasScopedRule = rules.some(
                    (rule) =>
                      Boolean(rule.rowFilter) || !rule.fields.includes("*"),
                  );
                  return rules.length > 1 || hasScopedRule;
                })
                .map((action) => {
                  const collectionFields = permissionFields(collection, copy);
                  return (
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
                        .map(({ grant, index }, number) => {
                          const preview = grant.rowFilter
                            ? conditionSummary(
                                grant.rowFilter,
                                collectionFields,
                                copy,
                              )
                            : copy("Все записи");
                          const fieldsHint =
                            action !== "delete" && !grant.fields.includes("*")
                              ? ` · ${accessText(copy.locale, `полей: ${grant.fields.length}`, `fields: ${grant.fields.length}`)}`
                              : "";
                          const fullSummary = `${copy("Правило")} ${number + 1} · ${preview}${fieldsHint}`;
                          return (
                            <Button
                              key={index}
                              type="button"
                              variant="ghost"
                              size="sm"
                              title={fullSummary}
                              className="h-7 max-w-full text-xs"
                              onClick={() => open(collection, action, index)}
                            >
                              <span className="truncate">{fullSummary}</span>
                            </Button>
                          );
                        })}
                      {!readOnly && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => open(collection, action, -1)}
                        >
                          <Plus className="size-3" />
                          {copy("Правило")}
                        </Button>
                      )}
                    </div>
                  );
                })}
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
