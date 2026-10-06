"use client";

import { ArrowLeft } from "lucide-react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { Checkbox } from "@asmblyr-collaborative/kit/ui/checkbox";
import { Input } from "@asmblyr-collaborative/kit/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@asmblyr-collaborative/kit/ui/tabs";
import type { Collection, CollectionField } from "@/components/items/types";
import { AliasFieldEditor } from "./alias-field-editor";
import { FieldDefaultInput } from "./field-default-input";
import { FieldSearchSettings } from "./field-search-settings";
import { RelationSearchSettings } from "./relation-search-settings";
import type { DataFieldType } from "./field-type-picker";

import { useFieldEditor } from "./use-field-editor";
import { FieldRulesSettings } from "./field-rules-settings";
import { FieldPresentationSettings } from "./field-presentation-settings";
import { useUiCopy } from "@/lib/ui-copy";

interface FieldEditorFormProps {
  collection: string;
  collections: Collection[];
  field?: CollectionField;
  type?: DataFieldType;
  portalContainer?: HTMLElement | null;
  onSaved: () => void;
  onCancel: () => void;
  onBack?: () => void;
}

export function FieldEditorForm({
  collection,
  collections,
  field,
  type,
  portalContainer,
  onSaved,
  onCancel,
  onBack,
}: FieldEditorFormProps) {
  const copy = useUiCopy();

  const editor = useFieldEditor({ collection, field, type, onSaved });
  const {
    name,
    setName,
    required,
    setRequired,
    nullable,
    setNullable,
    hasDefault,
    setHasDefault,
    defaultValue,
    setDefaultValue,
    searchable,
    setSearchable,
    indexed,
    setIndexed,
    relationSearchable,
    searchPriority,
    setSearchPriority,
    setRelationSearchable,
    presentation,
    setPresentation,
    created,
    pending,
    message,
    selectedType,
    textField,
    relationField,
    changed,
    submit,
  } = editor;

  if (field?.type === "alias") {
    return (
      <AliasFieldEditor
        editor={editor}
        field={field}
        collections={collections}
        portalContainer={portalContainer}
        onCancel={onCancel}
      />
    );
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-6"
    >
      {!field && onBack && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-ml-2"
          disabled={pending || created}
          onClick={onBack}
        >
          <ArrowLeft aria-hidden="true" /> {copy(" К выбору типа ")}
        </Button>
      )}
      <div className="space-y-2">
        {field ? (
          <>
            <span className="text-sm font-medium">{copy("Имя поля")}</span>
            <div className="rounded-lg border bg-muted/50 px-3 py-2 font-mono">
              {field.name}
            </div>
            <p className="text-xs text-muted-foreground">
              {copy("Имя поля нельзя изменить после создания. ")}
            </p>
          </>
        ) : (
          <>
            <Label htmlFor="field-editor-name">{copy("Имя поля")}</Label>
            <Input
              id="field-editor-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              maxLength={63}
              pattern="[a-z][a-z0-9_]*"
              disabled={pending || created}
              placeholder="field_name"
              className="h-10 font-mono"
            />
            <p className="text-xs text-muted-foreground">
              {copy("Строчные латинские буквы, цифры и подчёркивание. ")}
            </p>
          </>
        )}
      </div>

      {field ? (
        <div className="space-y-2 text-sm">
          <span className="font-medium">{copy("Тип данных")}</span>
          <div className="rounded-lg border bg-muted/50 px-3 py-2 font-mono">
            {field.type}
          </div>
          <p className="text-xs text-muted-foreground">
            {copy("Тип поля нельзя изменить после создания. ")}
          </p>
        </div>
      ) : (
        <div className="space-y-2 text-sm">
          <span className="font-medium">{copy("Тип данных")}</span>
          <div className="rounded-lg border bg-muted/50 px-3 py-2 font-mono">
            {selectedType}
          </div>
        </div>
      )}

      {selectedType === "relation" && (
        <div className="space-y-2">
          <Label htmlFor="field-editor-target">
            {copy("Целевая коллекция")}
          </Label>
          <div className="rounded-lg border bg-muted/50 px-3 py-2 font-mono text-sm">
            {field?.relation?.collection}
          </div>
          <p className="text-xs text-muted-foreground">
            {copy(
              "В этой коллекции появится внешний ключ. Обратные записи будут видны в карточке целевой записи. ",
            )}
          </p>
          {field?.relation?.kind === "m2o" && (
            <p className="text-xs text-muted-foreground">
              {copy("При удалении связанной записи:")}{" "}
              <code>{field.relation.onDelete}</code>
            </p>
          )}
        </div>
      )}

      <Tabs
        defaultValue="basic"
        className="space-y-4"
      >
        <TabsList className="w-full justify-start">
          <TabsTrigger value="basic">{copy("Основное")}</TabsTrigger>
          <TabsTrigger value="presentation">{copy("Отображение")}</TabsTrigger>
          <TabsTrigger value="rules">{copy("Правила")}</TabsTrigger>
          {textField && (
            <TabsTrigger value="search">{copy("Поиск")}</TabsTrigger>
          )}
          {relationField && (
            <TabsTrigger value="search">{copy("Поиск")}</TabsTrigger>
          )}
        </TabsList>
        <TabsContent
          value="basic"
          className="space-y-6"
        >
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
        </TabsContent>
        <TabsContent value="rules">
          <FieldRulesSettings
            value={presentation}
            fieldName={name}
            type={selectedType}
            collection={collections.find((c) => c.name === collection)}
            catalog={collections}
            disabled={pending}
            container={portalContainer}
            onChange={setPresentation}
          />
        </TabsContent>
        {textField && (
          <TabsContent value="search">
            <FieldSearchSettings
              searchable={searchable}
              indexed={indexed}
              priority={searchPriority}
              onPriorityChange={setSearchPriority}
              container={portalContainer}
              disabled={pending}
              onSearchableChange={setSearchable}
              onIndexedChange={setIndexed}
            />
          </TabsContent>
        )}
        {relationField && (
          <TabsContent value="search">
            <RelationSearchSettings
              searchable={relationSearchable}
              priority={searchPriority}
              onPriorityChange={setSearchPriority}
              container={portalContainer}
              disabled={pending}
              onChange={setRelationSearchable}
            />
          </TabsContent>
        )}
        <TabsContent value="presentation">
          <FieldPresentationSettings
            value={presentation}
            type={selectedType}
            disabled={pending}
            onChange={setPresentation}
            portalContainer={portalContainer}
          />
        </TabsContent>
      </Tabs>

      {message && (
        <p
          role="status"
          className="text-sm text-destructive"
        >
          {copy(message)}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          disabled={pending || !changed}
        >
          {pending
            ? copy("Сохраняем…")
            : field
              ? copy("Сохранить изменения")
              : copy("Добавить поле")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={onCancel}
        >
          {copy("Отмена ")}
        </Button>
      </div>
    </form>
  );
}
