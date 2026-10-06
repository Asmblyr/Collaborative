"use client";

import type { RelationChoiceFilter } from "@asmblyr-collaborative/contracts";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import type { Collection, CollectionField } from "@/components/items/types";
import { filterScopes } from "@/components/items/item-filter-options";
import { FieldSettingSelect } from "./field-setting-select";
import { RelationChoiceCondition } from "./relation-choice-condition";
import { useUiCopy } from "@/lib/ui-copy";

export function RelationChoiceSettings({
  value,
  field,
  collection,
  catalog,
  disabled,
  container,
  onChange,
}: {
  value?: RelationChoiceFilter;
  field: CollectionField;
  collection: Collection;
  catalog: Collection[];
  disabled: boolean;
  container?: HTMLElement | null;
  onChange(value?: RelationChoiceFilter): void;
}) {
  const copy = useUiCopy();

  const target = catalog.find((c) => c.name === field.relation?.collection);
  if (!target) {
    return null;
  }
  const scopes = filterScopes(target, catalog);
  const dependencies = collection.fields.filter(
    (f) =>
      f.name !== field.name &&
      !["alias", "json", "files", "file"].includes(f.type) &&
      !f.presentation?.rules?.computed,
  );
  const group = (
    g: RelationChoiceFilter,
    update: (g: RelationChoiceFilter) => void,
    depth: number,
  ) => (
    <div className="space-y-2">
      <FieldSettingSelect
        label={copy("Логика ограничений")}
        value={g.logic}
        disabled={disabled}
        container={container}
        options={[
          { value: "and", label: copy("Все условия") },
          { value: "or", label: copy("Любое условие") },
        ]}
        onChange={(logic) => update({ ...g, logic: logic as "and" | "or" })}
      />
      {g.children.map((c, index) =>
        "logic" in c ? (
          <div
            key={index}
            className="space-y-2 border-l pl-3"
          >
            {group(
              c,
              (next) =>
                update({
                  ...g,
                  children: g.children.map((n, i) => (i === index ? next : n)),
                }),
              depth + 1,
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={() =>
                update({
                  ...g,
                  children: g.children.filter((_, i) => i !== index),
                })
              }
            >
              {copy("Убрать группу ")}
            </Button>
          </div>
        ) : (
          <RelationChoiceCondition
            key={index}
            condition={c}
            scopes={scopes}
            dependencies={dependencies}
            container={container}
            onChange={(next) =>
              update({
                ...g,
                children: g.children.map((n, i) => (i === index ? next : n)),
              })
            }
            onRemove={() =>
              update({
                ...g,
                children: g.children.filter((_, i) => i !== index),
              })
            }
          />
        ),
      )}
      <div className="flex gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled || g.children.length >= 12}
          onClick={() =>
            update({
              ...g,
              children: [
                ...g.children,
                {
                  field: target.primaryKey.name,
                  op: "eq",
                  value: { kind: "literal", value: "" },
                },
              ],
            })
          }
        >
          {copy("Добавить условие ")}
        </Button>
        {depth < 2 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled || g.children.length >= 12}
            onClick={() =>
              update({
                ...g,
                children: [
                  ...g.children,
                  {
                    logic: "and",
                    children: [
                      {
                        field: target.primaryKey.name,
                        op: "eq",
                        value: { kind: "literal", value: "" },
                      },
                    ],
                  },
                ],
              })
            }
          >
            {copy("Группа ")}
          </Button>
        )}
      </div>
    </div>
  );
  const clean = (g: RelationChoiceFilter): RelationChoiceFilter => ({
    ...g,
    children: g.children.flatMap<RelationChoiceFilter["children"][number]>(
      (n) => {
        if (!("logic" in n)) {
          return [n];
        }
        const child = clean(n);
        return child.children.length ? [child] : [];
      },
    ),
  });
  const save = (g: RelationChoiceFilter) => {
    const next = clean(g);
    onChange(next.children.length ? next : undefined);
  };
  return (
    <section className="space-y-3 border-t pt-4">
      <h3 className="text-sm font-medium">
        {copy("Ограничить выбор связанной записи")}
      </h3>
      <p className="text-xs text-muted-foreground">
        {copy(
          "Можно сравнить поле кандидата со значением другого поля формы. Смена родителя сбрасывает зависимый выбор; сервер проверяет связь при сохранении. ",
        )}
      </p>
      {value ? (
        <fieldset
          disabled={disabled}
          className="space-y-2"
        >
          {group(value, save, 0)}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange(undefined)}
          >
            {copy("Без ограничений выбора ")}
          </Button>
        </fieldset>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() =>
            onChange({
              logic: "and",
              children: [
                {
                  field: target.primaryKey.name,
                  op: "eq",
                  value: { kind: "literal", value: "" },
                },
              ],
            })
          }
        >
          {copy("Настроить ограничения ")}
        </Button>
      )}
    </section>
  );
}
