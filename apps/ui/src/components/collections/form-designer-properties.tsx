"use client";

import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { Input } from "@asmblyr-collaborative/kit/ui/input";
import { Textarea } from "@asmblyr-collaborative/kit/ui/textarea";
import { Checkbox } from "@asmblyr-collaborative/kit/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@asmblyr-collaborative/kit/ui/select";
import type { FormLayout } from "@/components/items/presentation-types";
import type { CollectionField } from "@/components/items/types";
import { fieldsInNodes } from "@/components/items/form-layout-model";
import {
  appendFormNode,
  changeFormNode,
  findFormNode,
  formNodeDepth,
  formParentOf,
  formParents,
  removeFormNode,
} from "./form-designer-model";
import { FormConditionSettings } from "./form-condition-settings";
import { useUiCopy } from "@/lib/ui-copy";

export function FormDesignerProperties({
  layout,
  selected,
  fields,
  disabled,
  container,
  onChange,
  onSelect,
}: {
  layout: FormLayout;
  selected: string;
  fields: CollectionField[];
  disabled: boolean;
  container: HTMLElement | null;
  onChange: (layout: FormLayout) => void;
  onSelect: (id: string) => void;
}) {
  const copy = useUiCopy();

  const tab = layout.tabs.find((t) => t.id === selected);
  const node = findFormNode(layout, selected);
  if (tab)
    return (
      <div className="space-y-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {copy("Вкладка ")}
        </p>
        <label className="block space-y-2 text-sm">
          {copy("Название вкладки ")}
          <Input
            value={tab.label}
            maxLength={120}
            disabled={disabled}
            onChange={(e) =>
              onChange({
                ...layout,
                tabs: layout.tabs.map((t) =>
                  t.id === tab.id ? { ...t, label: e.target.value } : t,
                ),
              })
            }
          />
        </label>
        <p className="text-xs text-muted-foreground">
          {copy(
            "Вкладка появится в форме, если содержит доступные поля. При одной вкладке переключатель не показывается. ",
          )}
        </p>
        {layout.tabs.length > 1 && (
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            onClick={() => {
              const tabs = layout.tabs.filter((t) => t.id !== tab.id);
              tabs[0] = {
                ...tabs[0],
                children: [...tabs[0].children, ...tab.children],
              };
              onChange({ ...layout, tabs });
              onSelect(tabs[0].id);
            }}
          >
            {copy("Удалить вкладку, перенести содержимое ")}
          </Button>
        )}
      </div>
    );
  if (!node)
    return (
      <p className="text-sm text-muted-foreground">
        {copy("Выберите элемент слева.")}
      </p>
    );
  const update = (patch: Partial<typeof node>) =>
    onChange(
      changeFormNode(
        layout,
        node.id,
        (n) => ({ ...n, ...patch }) as typeof node,
      ),
    );
  const parent = formParentOf(layout, node.id)!;
  const childFields = new Set(fieldsInNodes([node]));
  return (
    <div className="space-y-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {node.kind === "field"
          ? copy("Поле · {{value0}}", { value0: node.field })
          : copy("Секция")}
      </p>
      {node.kind === "group" && (
        <>
          <label className="block space-y-2 text-sm">
            {copy("Название секции ")}
            <Input
              value={node.label}
              maxLength={120}
              disabled={disabled}
              onChange={(e) => update({ label: e.target.value })}
            />
          </label>
          <label className="block space-y-2 text-sm">
            {copy("Описание ")}
            <Textarea
              value={node.description}
              maxLength={1000}
              disabled={disabled}
              onChange={(e) => update({ description: e.target.value })}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={node.collapsible}
              disabled={disabled}
              onCheckedChange={(v) => update({ collapsible: v === true })}
            />
            {copy("Можно свернуть ")}
          </label>
          {node.collapsible && (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={node.collapsed}
                disabled={disabled}
                onCheckedChange={(v) => update({ collapsed: v === true })}
              />
              {copy("Свёрнута при открытии ")}
            </label>
          )}
        </>
      )}
      {node.kind === "field" && (
        <Select
          value={node.width}
          disabled={disabled}
          onValueChange={(width) => update({ width: width as "full" | "half" })}
        >
          <SelectTrigger
            aria-label={copy("Ширина поля в форме")}
            className="w-full"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent container={container}>
            <SelectItem value="full">{copy("Вся строка")}</SelectItem>
            <SelectItem value="half">{copy("Половина строки")}</SelectItem>
          </SelectContent>
        </Select>
      )}
      <div className="space-y-2">
        <p className="text-sm">{copy("Расположение")}</p>
        <Select
          value={parent}
          disabled={disabled}
          onValueChange={(id) =>
            onChange(appendFormNode(removeFormNode(layout, node.id), id, node))
          }
        >
          <SelectTrigger
            aria-label={copy("Перенести в")}
            className="w-full"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent container={container}>
            {formParents(layout, node.id)
              .filter((p) => p.depth + formNodeDepth(node) <= 3)
              .map((p) => (
                <SelectItem
                  key={p.id}
                  value={p.id}
                >
                  {p.label}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>
      <FormConditionSettings
        value={node.when}
        fields={fields.filter((f) => !childFields.has(f.name))}
        disabled={disabled}
        container={container}
        onChange={(when) =>
          onChange(
            changeFormNode(layout, node.id, (current) => {
              const rest = { ...current };
              delete rest.when;
              return when ? { ...rest, when } : rest;
            }),
          )
        }
      />
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        onClick={() => {
          onChange(removeFormNode(layout, node.id, true));
          onSelect(parent);
        }}
      >
        {node.kind === "group"
          ? copy("Убрать секцию, оставить поля")
          : copy("Убрать из раскладки")}
      </Button>
      {node.kind === "field" && (
        <p className="text-xs text-muted-foreground">
          {copy(
            "Поле останется в коллекции и будет показано в разделе «Другие поля». ",
          )}
        </p>
      )}
    </div>
  );
}
