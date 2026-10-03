"use client";

import { useRelationEditor, type Kind, type Section } from "./use-relation-editor";
import { NameInput } from "./relation-name-input";
import { RelationBehaviorSettings } from "./relation-behavior-settings";

import { ArrowLeft } from "lucide-react";
import { Button } from "@asmblyr/kit/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@asmblyr/kit/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@asmblyr/kit/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@asmblyr/kit/ui/tabs";
import type { Collection } from "@/components/items/types";

export function RelationCreateForm({
  collection,
  collections,
  kind,
  portalContainer,
  onSaved,
  onCancel,
  onBack,
}: {
  collection: string;
  collections: Collection[];
  portalContainer?: HTMLElement | null;
  kind: Kind;
  onSaved: () => void;
  onCancel: () => void;
  onBack: () => void;
}) {
  const editor = useRelationEditor(collection, collections, kind, onSaved);
  const {
    section,
    setSection,
    name,
    setName,
    targetCollection,
    setTargetCollection,
    reverseField,
    setReverseField,
    foreignKey,
    setForeignKey,
    reuseExisting,
    setReuseExisting,
    setJunctionCollection,
    setSourceKey,
    setTargetKey,
    allowDuplicates,
    setAllowDuplicates,
    pending,
    message,
    setMessage,
    formRef,
    existingKeys,
    junctionName,
    sourceKeyName,
    targetKeyName,
    submit,
  } = editor;

  return (
    <form
      ref={formRef}
      onSubmit={submit}
      onChangeCapture={() => setMessage("")}
      noValidate
      className="space-y-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-ml-2"
          disabled={pending}
          onClick={onBack}
        >
          <ArrowLeft aria-hidden="true" /> К выбору типа
        </Button>
        <Badge variant="secondary">
          {kind === "m2o"
            ? "Многие к одному"
            : kind === "o2m"
              ? "Один ко многим"
              : "Многие ко многим"}
        </Badge>
      </div>
      {message && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {message}
        </p>
      )}
      <Tabs
        value={section}
        onValueChange={(value) => {
          setSection(value as Section);
          setMessage("");
        }}
      >
        <TabsList className={`grid w-full ${kind === "m2o" ? "grid-cols-2" : "grid-cols-3"}`}>
          <TabsTrigger value="basic" disabled={pending}>
            Основное
          </TabsTrigger>
          {kind !== "m2o" && (
            <TabsTrigger value="structure" disabled={pending}>
              Структура
            </TabsTrigger>
          )}
          <TabsTrigger value="behavior" disabled={pending}>
            Поведение
          </TabsTrigger>
        </TabsList>
        <TabsContent value="basic" className="space-y-5 pt-5">
          <NameInput
            id="relation-name"
            label={kind === "m2o" ? "Имя внешнего ключа" : "Имя поля связи"}
            value={name}
            onChange={setName}
            required
            hint={
              kind === "m2o"
                ? "Физический столбец в этой коллекции."
                : "Виртуальное поле в этой коллекции."
            }
          />
          <div className="space-y-2">
            <Label htmlFor="relation-target">Связанная коллекция</Label>
            <Select
              value={targetCollection}
              onValueChange={(value) => {
                setTargetCollection(value);
                setForeignKey("");
                setReuseExisting(false);
                setMessage("");
              }}
              disabled={pending}
            >
              <SelectTrigger id="relation-target" className="h-10 w-full">
                <SelectValue placeholder="Выберите коллекцию" />
              </SelectTrigger>
              <SelectContent container={portalContainer}>
                {collections.map((entry) => (
                  <SelectItem key={entry.name} value={entry.name}>
                    {entry.displayName ? `${entry.displayName} (${entry.name})` : entry.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {kind !== "o2m" && (
            <NameInput
              id="relation-reverse"
              label="Поле на обратной стороне (необязательно)"
              value={reverseField}
              onChange={setReverseField}
              hint="Виртуальное поле для просмотра связанных записей в целевой коллекции."
            />
          )}
        </TabsContent>

        {kind !== "m2o" && (
          <TabsContent value="structure" className="space-y-5 pt-5">
            {!targetCollection && (
              <p className="text-sm text-muted-foreground">
                Сначала выберите связанную коллекцию на вкладке «Основное».
              </p>
            )}
            {kind === "o2m" && targetCollection && (
              <div className="space-y-4 rounded-xl border p-4">
                {existingKeys.length > 0 && (
                  <label className="flex items-center gap-3 text-sm">
                    <Checkbox
                      checked={reuseExisting}
                      onCheckedChange={(checked) => {
                        setReuseExisting(checked === true);
                        setForeignKey("");
                        setMessage("");
                      }}
                    />
                    Использовать существующий внешний ключ
                  </label>
                )}
                {reuseExisting ? (
                  <div className="space-y-2">
                    <Label htmlFor="relation-existing-key">Внешний ключ в {targetCollection}</Label>
                    <Select
                      value={foreignKey}
                      onValueChange={(value) => {
                        setForeignKey(value);
                        setMessage("");
                      }}
                      disabled={pending}
                    >
                      <SelectTrigger id="relation-existing-key" className="h-10 w-full">
                        <SelectValue placeholder="Выберите поле" />
                      </SelectTrigger>
                      <SelectContent container={portalContainer}>
                        {existingKeys.map((field) => (
                          <SelectItem key={field.name} value={field.name}>
                            {field.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <NameInput
                    id="relation-foreign-key"
                    label={`Новый внешний ключ в ${targetCollection || "другой коллекции"}`}
                    value={foreignKey || `${collection}_id`}
                    onChange={setForeignKey}
                    required
                  />
                )}
              </div>
            )}

            {kind === "m2m" && targetCollection && (
              <div className="space-y-4 rounded-xl border p-4">
                <NameInput
                  id="relation-junction"
                  label="Промежуточная коллекция"
                  value={junctionName}
                  onChange={setJunctionCollection}
                  required
                  hint="Будет создана как обычная коллекция. Имя нельзя изменить после создания."
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <NameInput
                    id="relation-source-key"
                    label={`Ключ к ${collection}`}
                    value={sourceKeyName}
                    onChange={setSourceKey}
                    required
                  />
                  <NameInput
                    id="relation-target-key"
                    label={`Ключ к ${targetCollection || "связанной коллекции"}`}
                    value={targetKeyName}
                    onChange={setTargetKey}
                    required
                  />
                </div>
                <label className="flex items-center gap-3 text-sm">
                  <Checkbox
                    checked={allowDuplicates}
                    onCheckedChange={(checked) => setAllowDuplicates(checked === true)}
                  />
                  Разрешить повторные пары записей
                </label>
              </div>
            )}
          </TabsContent>
        )}

        <RelationBehaviorSettings
          editor={editor}
          kind={kind}
          collection={collection}
          portalContainer={portalContainer}
        />
      </Tabs>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Создаём…" : "Создать связь"}
        </Button>
        <Button type="button" variant="ghost" disabled={pending} onClick={onCancel}>
          Отмена
        </Button>
      </div>
    </form>
  );
}
