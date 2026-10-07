"use client";

import { Checkbox } from "@asmblyr-collaborative/kit/ui/checkbox";
import { Label } from "@/components/ui/label";
import type {
  FieldRules,
  FieldPresentation,
} from "@asmblyr-collaborative/contracts";
import type { Collection, CollectionField } from "@/components/items/types";
import { FormConditionSettings } from "./form-condition-settings";
import { FieldSettingSelect } from "./field-setting-select";
import { RelationChoiceSettings } from "./relation-choice-settings";
import { useUiCopy } from "@/lib/ui-copy";

export function FieldRulesSettings({
  value,
  fieldName,
  type,
  collection,
  catalog,
  disabled,
  container,
  onChange,
}: {
  value: FieldPresentation;
  fieldName: string;
  type: string;
  collection?: Collection;
  catalog: Collection[];
  disabled: boolean;
  container?: HTMLElement | null;
  onChange(value: FieldPresentation): void;
}) {
  const copy = useUiCopy();

  const rules = value.rules ?? {};
  const set = (patch: Partial<FieldRules>) =>
    onChange({ ...value, rules: { ...rules, ...patch } });
  const fields =
    collection?.fields.filter(
      (f) => f.name !== fieldName && f.type !== "alias",
    ) ?? [];
  const relations = fields.filter(
    (f) =>
      f.relation?.kind === "m2o" &&
      f.relation.collection !== "@users" &&
      f.relation.collection !== collection?.name,
  );
  const selected = relations.find((f) => f.name === rules.computed?.relation);
  const target = catalog.find((c) => c.name === selected?.relation?.collection);
  const current = collection?.fields.find((f) => f.name === fieldName);
  const compatible = (f: CollectionField) =>
    f.type === type &&
    (!f.presentation?.sensitive || value.sensitive === true) &&
    !f.presentation?.rules?.computed &&
    f.relation?.collection === current?.relation?.collection;
  return (
    <div className="space-y-5">
      <div className="space-y-3">
        {(["hidden", "readonly"] as const).map((key) => (
          <div
            key={key}
            className="flex items-center gap-2"
          >
            <Checkbox
              id={`rule-${key}`}
              checked={rules[key] ?? false}
              disabled={disabled}
              onCheckedChange={(checked) => set({ [key]: checked === true })}
            />
            <Label htmlFor={`rule-${key}`}>
              {key === "hidden"
                ? copy("Скрывать в форме")
                : copy("Только чтение")}
            </Label>
          </div>
        ))}
        <p className="text-xs text-muted-foreground">
          {copy(
            "Скрытие относится к форме. Права на значение задаются в политике; режим чтения проверяется также в API. ",
          )}
        </p>
      </div>
      <FormConditionSettings
        title={copy("Когда обязательно")}
        description={copy(
          "Проверяется сервером на итоговой записи, включая частичное сохранение.",
        )}
        value={rules.requiredWhen}
        fields={fields}
        disabled={disabled}
        container={container ?? null}
        onChange={(requiredWhen) => set({ requiredWhen })}
      />
      {current?.relation?.collection !== "@users" && (
        <section className="space-y-2 border-t pt-4">
          <h3 className="text-sm font-medium">
            {copy("Взять значение из связи")}
          </h3>
          <FieldSettingSelect
            label={copy("Источник вычисления")}
            value={rules.computed?.relation ?? "$none"}
            disabled={disabled}
            container={container}
            options={[
              { value: "$none", label: copy("Не вычислять") },
              ...relations.map((f) => ({
                value: f.name,
                label: f.presentation?.label || f.name,
              })),
            ]}
            onChange={(relation) => {
              const source = relations.find((f) => f.name === relation);
              const target = catalog.find(
                (c) => c.name === source?.relation?.collection,
              );
              set({
                computed:
                  relation === "$none"
                    ? undefined
                    : {
                        relation,
                        field: target?.fields.find(compatible)?.name ?? "",
                      },
              });
            }}
          />
          {rules.computed && (
            <FieldSettingSelect
              label={copy("Поле связанной записи")}
              value={rules.computed.field || "$empty"}
              disabled={disabled}
              container={container}
              options={[
                { value: "$empty", label: copy("Выберите поле") },
                ...(target?.fields.filter(compatible).map((f) => ({
                  value: f.name,
                  label: f.presentation?.label || f.name,
                })) ?? []),
              ]}
              onChange={(field) =>
                set({
                  computed: {
                    ...rules.computed!,
                    field: field === "$empty" ? "" : field,
                  },
                })
              }
            />
          )}
          <p className="text-xs text-muted-foreground">
            {copy(
              "Сервер копирует значение при сохранении. Пользователю нужны права на источник и изменяемое поле. ",
            )}
          </p>
        </section>
      )}
      {type === "relation" &&
        current &&
        current.relation?.collection !== "@users" && (
          <RelationChoiceSettings
            value={value.relationFilter}
            field={current}
            collection={collection!}
            catalog={catalog}
            disabled={disabled}
            container={container}
            onChange={(relationFilter) =>
              onChange({ ...value, relationFilter })
            }
          />
        )}
      {["text", "email"].includes(type) && (
        <section className="space-y-2 border-t pt-4">
          <div className="flex items-center gap-2">
            <Checkbox
              id="field-sensitive"
              checked={value.sensitive ?? false}
              disabled={disabled}
              onCheckedChange={(checked) =>
                onChange({ ...value, sensitive: checked === true })
              }
            />
            <Label htmlFor="field-sensitive">
              {copy("Чувствительное значение")}
            </Label>
          </div>
          <p className="text-xs text-muted-foreground">
            {copy(
              "Маскируется в интерфейсе и не записывается в историю. Старые значения в истории удаляются без восстановления. Сначала уберите default. Это не шифрование; доступ к самому значению задаётся политикой. ",
            )}
          </p>
        </section>
      )}
    </div>
  );
}
