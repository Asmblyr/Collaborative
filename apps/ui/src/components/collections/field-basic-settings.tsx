"use client";
import { Checkbox } from "@asmblyr-collaborative/kit/ui/checkbox";
import { Label } from "@/components/ui/label";
import { FieldDefaultInput } from "./field-default-input";
import type { useFieldEditor } from "./use-field-editor";
import { useUiCopy } from "@/lib/ui-copy";

export function FieldBasicSettings({
  editor,
  system,
  portalContainer,
}: {
  editor: ReturnType<typeof useFieldEditor>;
  system: boolean;
  portalContainer?: HTMLElement | null;
}) {
  const copy = useUiCopy();
  const {
    required,
    setRequired,
    nullable,
    setNullable,
    hasDefault,
    setHasDefault,
    defaultValue,
    setDefaultValue,
    pending,
    selectedType,
  } = editor;
  return (
    <>
      {" "}
      {system ? (
        <p className="text-sm text-muted-foreground">
          {copy(
            "Дополнительные поля необязательны: создание системных записей продолжит работать без них.",
          )}
        </p>
      ) : (
        <div className="space-y-4 rounded-xl border p-4">
          <div className="flex items-start gap-3">
            <Checkbox
              id="field-editor-required"
              checked={required}
              onCheckedChange={(checked) => setRequired(checked === true)}
              disabled={pending}
              className="mt-1"
            />
            <div className="space-y-1">
              <Label htmlFor="field-editor-required">
                {copy("Обязательно в API")}
              </Label>
              <p className="text-xs text-muted-foreground">
                {copy(
                  "Требует значение в API. Default покрывает пропуск поля. ",
                )}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Checkbox
              id="field-editor-nullable"
              checked={nullable}
              onCheckedChange={(checked) => setNullable(checked === true)}
              disabled={pending}
              className="mt-1"
            />
            <div className="space-y-1">
              <Label htmlFor="field-editor-nullable">
                {copy("Разрешить NULL в БД ")}
              </Label>
              <p className="text-xs text-muted-foreground">
                {copy(
                  "При отключении существующие пустые значения помешают сохранению. ",
                )}
              </p>
            </div>
          </div>
        </div>
      )}
      {!["relation", "file", "files"].includes(selectedType) && (
        <div className="space-y-4 rounded-xl border p-4">
          <div className="flex items-start gap-3">
            <Checkbox
              id="field-editor-has-default"
              checked={hasDefault}
              onCheckedChange={(checked) => setHasDefault(checked === true)}
              disabled={pending}
              className="mt-1"
            />
            <div className="space-y-1">
              <Label htmlFor="field-editor-has-default">
                {copy("Значение по умолчанию ")}
              </Label>
              <p className="text-xs text-muted-foreground">
                {copy(
                  "Применяется при создании записи, если поле не передано. ",
                )}
              </p>
            </div>
          </div>
          {hasDefault && (
            <div className="space-y-2">
              <Label htmlFor="field-editor-default-value">
                {copy("Значение")}
                {selectedType === "datetime" ? " (UTC)" : ""}
              </Label>
              <FieldDefaultInput
                type={selectedType}
                value={defaultValue}
                onChange={setDefaultValue}
                disabled={pending}
                portalContainer={portalContainer}
              />
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {copy(
              "При добавлении поля default заполнит существующие строки. Изменение default позже их не меняет. ",
            )}
          </p>
        </div>
      )}
    </>
  );
}
