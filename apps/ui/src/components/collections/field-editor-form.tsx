"use client";

import { ArrowLeft } from "lucide-react";
import { Button } from "@asmblyr/kit/ui/button";
import { Checkbox } from "@asmblyr/kit/ui/checkbox";
import { Input } from "@asmblyr/kit/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@asmblyr/kit/ui/tabs";
import type { Collection, CollectionField } from "@/components/items/types";
import { AliasFieldEditor } from "./alias-field-editor";
import { FieldDefaultInput } from "./field-default-input";
import { FieldSearchSettings } from "./field-search-settings";
import { RelationSearchSettings } from "./relation-search-settings";
import type { DataFieldType } from "./field-type-picker";

import { useFieldEditor } from "./use-field-editor";
import { FieldPresentationSettings } from "./field-presentation-settings";

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
          <ArrowLeft aria-hidden="true" /> К выбору типа
        </Button>
      )}
      <div className="space-y-2">
        {field ? (
          <>
            <span className="text-sm font-medium">Имя поля</span>
            <div className="rounded-lg border bg-muted/50 px-3 py-2 font-mono">
              {field.name}
            </div>
            <p className="text-xs text-muted-foreground">
              Имя поля нельзя изменить после создания.
            </p>
          </>
        ) : (
          <>
            <Label htmlFor="field-editor-name">Имя поля</Label>
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
              Строчные латинские буквы, цифры и подчёркивание.
            </p>
          </>
        )}
      </div>

      {field ? (
        <div className="space-y-2 text-sm">
          <span className="font-medium">Тип данных</span>
          <div className="rounded-lg border bg-muted/50 px-3 py-2 font-mono">
            {field.type}
          </div>
          <p className="text-xs text-muted-foreground">
            Тип поля нельзя изменить после создания.
          </p>
        </div>
      ) : (
        <div className="space-y-2 text-sm">
          <span className="font-medium">Тип данных</span>
          <div className="rounded-lg border bg-muted/50 px-3 py-2 font-mono">
            {selectedType}
          </div>
        </div>
      )}

      {selectedType === "relation" && (
        <div className="space-y-2">
          <Label htmlFor="field-editor-target">Целевая коллекция</Label>
          <div className="rounded-lg border bg-muted/50 px-3 py-2 font-mono text-sm">
            {field?.relation?.collection}
          </div>
          <p className="text-xs text-muted-foreground">
            В этой коллекции появится внешний ключ. Обратные записи будут видны
            в карточке целевой записи.
          </p>
          {field?.relation?.kind === "m2o" && (
            <p className="text-xs text-muted-foreground">
              При удалении связанной записи:{" "}
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
          <TabsTrigger value="basic">Основное</TabsTrigger>
          <TabsTrigger value="presentation">Отображение</TabsTrigger>
          {textField && <TabsTrigger value="search">Поиск</TabsTrigger>}
          {relationField && <TabsTrigger value="search">Поиск</TabsTrigger>}
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
                <Label htmlFor="field-editor-required">Обязательно в API</Label>
                <p className="text-xs text-muted-foreground">
                  Требует значение в API. Default покрывает пропуск поля.
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
                  Разрешить NULL в БД
                </Label>
                <p className="text-xs text-muted-foreground">
                  При отключении существующие пустые значения помешают
                  сохранению.
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
                    Значение по умолчанию
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Применяется при создании записи, если поле не передано.
                  </p>
                </div>
              </div>
              {hasDefault && (
                <div className="space-y-2">
                  <Label htmlFor="field-editor-default-value">
                    Значение{selectedType === "datetime" ? " (UTC)" : ""}
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
                При добавлении поля default заполнит существующие строки.
                Изменение default позже их не меняет.
              </p>
            </div>
          )}
        </TabsContent>
        {textField && (
          <TabsContent value="search">
            <FieldSearchSettings
              searchable={searchable}
              indexed={indexed}
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
          {message}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          disabled={pending || !changed}
        >
          {pending
            ? "Сохраняем…"
            : field
              ? "Сохранить изменения"
              : "Добавить поле"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={onCancel}
        >
          Отмена
        </Button>
      </div>
    </form>
  );
}
