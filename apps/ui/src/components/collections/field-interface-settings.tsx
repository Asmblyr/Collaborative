"use client";

import type { FieldPresentation } from "@asmblyr-collaborative/contracts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@asmblyr-collaborative/kit/ui/select";
import { Label } from "@/components/ui/label";
import { useFieldInterfaces } from "@/components/plugins/field-registry";
import { PluginUiHost as FieldBoundary } from "@/components/plugins/ui-host";
import {
  PortalContainerContext,
  usePortalContainer,
} from "@asmblyr-collaborative/kit/ui/portal-container";
import { defaultRepeater } from "./repeater-settings";
import { useUiCopy } from "@/lib/ui-copy";

export function FieldInterfaceSettings({
  value,
  type,
  disabled,
  container,
  onChange,
}: {
  value: FieldPresentation;
  type: string;
  disabled: boolean;
  container?: HTMLElement | null;
  onChange(value: FieldPresentation): void;
}) {
  const copy = useUiCopy();

  const interfaces = useFieldInterfaces(type);
  const inheritedContainer = usePortalContainer();
  const extension = value.extension;
  const selected = interfaces.find((entry) => entry.id === extension?.id);
  const Settings = selected?.settings;
  const unavailable = extension && !selected;

  function select(id: string) {
    const next = { ...value };
    delete next.extension;
    delete next.options;
    delete next.repeater;

    const plugin = interfaces.find((entry) => entry.id === id);
    if (plugin) {
      delete next.display;
      onChange({ ...next, interface: "auto", extension: { id, options: {} } });
      return;
    }

    onChange({
      ...next,
      interface: id as FieldPresentation["interface"],
      ...(id === "repeater"
        ? {
            repeater: value.repeater ?? {
              ...defaultRepeater,
              fields: defaultRepeater.fields.map((field) => ({
                ...field,
                label: copy(field.label),
              })),
            },
          }
        : {}),
      ...(id === "select" || id === "multiselect"
        ? { options: value.options ?? [{ value: "", label: "" }] }
        : {}),
    });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="presentation-interface">{copy("Редактор")}</Label>
        <Select
          value={extension?.id ?? value.interface}
          disabled={disabled}
          onValueChange={select}
        >
          <SelectTrigger
            id="presentation-interface"
            className="w-full"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent container={container}>
            <SelectItem value="auto">{copy("Автоматически")}</SelectItem>
            {type !== "json" && (
              <SelectItem value="input">{copy("Однострочное поле")}</SelectItem>
            )}
            {type === "integer" && (
              <SelectItem value="select">{copy("Список вариантов")}</SelectItem>
            )}
            {type === "text" && (
              <>
                <SelectItem value="textarea">
                  {copy("Многострочный текст")}
                </SelectItem>
                <SelectItem value="markdown">Markdown</SelectItem>
                <SelectItem value="richtext">
                  {copy("Форматированный текст")}
                </SelectItem>
                <SelectItem value="url">{copy("Ссылка")}</SelectItem>
                <SelectItem value="select">
                  {copy("Список вариантов")}
                </SelectItem>
              </>
            )}
            {type === "json" && (
              <>
                <SelectItem value="tags">{copy("Теги")}</SelectItem>
                <SelectItem value="multiselect">
                  {copy("Множественный выбор")}
                </SelectItem>
                <SelectItem value="repeater">
                  {copy("Повторяемая форма")}
                </SelectItem>
              </>
            )}
            {interfaces.map((entry) => (
              <SelectItem
                key={entry.id}
                value={entry.id}
              >
                {entry.title} {copy(" · расширение ")}
              </SelectItem>
            ))}
            {unavailable && (
              <SelectItem
                value={extension.id}
                disabled
              >
                {extension.id} {copy(" · недоступен ")}
              </SelectItem>
            )}
          </SelectContent>
        </Select>
      </div>
      {unavailable && (
        <p className="text-xs text-muted-foreground">
          {copy(
            "Расширение отключено или не поддерживает это поле. Настройки сохранены; используется обычный ввод. ",
          )}
        </p>
      )}
      {Settings && extension && (
        <FieldBoundary
          key={extension.id}
          fallback={
            <p
              role="alert"
              className="text-sm text-destructive"
            >
              {copy(
                "Не удалось открыть настройки расширения. Сохранённые параметры не изменены. ",
              )}
            </p>
          }
        >
          <section className="space-y-3 rounded-xl border p-4">
            <h3 className="text-sm font-medium">{selected.title}</h3>
            <PortalContainerContext.Provider
              value={container ?? inheritedContainer}
            >
              <Settings
                options={extension.options}
                disabled={disabled}
                onChange={(options) => {
                  if (!disabled) {
                    onChange({
                      ...value,
                      extension: { ...extension, options },
                    });
                  }
                }}
              />
            </PortalContainerContext.Provider>
          </section>
        </FieldBoundary>
      )}
    </div>
  );
}
