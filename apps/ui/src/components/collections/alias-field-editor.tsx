"use client";

import { Button } from "@asmblyr-collaborative/kit/ui/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@asmblyr-collaborative/kit/ui/tabs";
import type { Collection, CollectionField } from "@/components/items/types";
import { FieldPresentationSettings } from "./field-presentation-settings";
import { RelationDisplaySettings } from "./relation-display-settings";
import { RelationSearchSettings } from "./relation-search-settings";
import type { useFieldEditor } from "./use-field-editor";
import { useUiCopy } from "@/lib/ui-copy";

export function AliasFieldEditor({
  editor,
  field,
  collections,
  portalContainer,
  onCancel,
}: {
  editor: ReturnType<typeof useFieldEditor>;
  field: CollectionField;
  collections: Collection[];
  portalContainer?: HTMLElement | null;
  onCancel: () => void;
}) {
  const copy = useUiCopy();

  const {
    submit,
    relationSearchable,
    searchPriority,
    setSearchPriority,
    pending,
    setRelationSearchable,
    presentation,
    selectedType,
    setPresentation,
    message,
    changed,
  } = editor;
  const target = collections.find(
    (entry) => entry.name === field.relation?.collection,
  );
  return (
    <form
      onSubmit={submit}
      className="space-y-6 text-sm"
    >
      <Tabs
        defaultValue="basic"
        className="space-y-4"
      >
        <TabsList className="h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="basic">{copy("Основное")}</TabsTrigger>
          <TabsTrigger value="presentation">{copy("Отображение")}</TabsTrigger>
          <TabsTrigger value="relation">{copy("Связанные записи")}</TabsTrigger>
          <TabsTrigger value="search">{copy("Поиск")}</TabsTrigger>
        </TabsList>
        <TabsContent
          value="basic"
          className="space-y-4"
        >
          <p>
            <span className="font-medium">{copy("Поле:")}</span>{" "}
            <code>{field.name}</code>
          </p>
          <p>
            <span className="font-medium">{copy("Вид:")}</span>{" "}
            {field.relation?.kind === "m2m"
              ? copy("Многие ко многим")
              : copy("Один ко многим")}
          </p>
          <p>
            <span className="font-medium">{copy("Связанная коллекция:")}</span>{" "}
            <code>{field.relation?.collection}</code>
          </p>
          {field.relation && field.relation.kind !== "m2o" && (
            <>
              <p>
                <span className="font-medium">{copy("Через коллекцию:")}</span>{" "}
                <code>{field.relation.throughCollection}</code>
              </p>
              <p>
                <span className="font-medium">{copy("Внешний ключ:")}</span>{" "}
                <code>{field.relation.throughField}</code>
              </p>
            </>
          )}
          <p className="text-muted-foreground">
            {copy("Физические имена связи после создания не меняются. ")}
          </p>
        </TabsContent>
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
        <TabsContent value="presentation">
          <FieldPresentationSettings
            value={presentation}
            type={selectedType}
            disabled={pending}
            onChange={setPresentation}
            portalContainer={portalContainer}
          />
        </TabsContent>
        <TabsContent value="relation">
          {target && (
            <RelationDisplaySettings
              value={presentation}
              target={target}
              disabled={pending}
              onChange={setPresentation}
              portalContainer={portalContainer}
            />
          )}
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
      <div className="flex gap-2">
        <Button
          type="submit"
          disabled={pending || !changed}
        >
          {pending ? copy("Сохраняем…") : copy("Сохранить изменения")}
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
