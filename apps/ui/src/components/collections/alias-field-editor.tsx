import { Button } from "@asmblyr/kit/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@asmblyr/kit/ui/tabs";
import type { Collection, CollectionField } from "@/components/items/types";
import { FieldPresentationSettings } from "./field-presentation-settings";
import { RelationDisplaySettings } from "./relation-display-settings";
import { RelationSearchSettings } from "./relation-search-settings";
import type { useFieldEditor } from "./use-field-editor";
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
  const {
    submit,
    relationSearchable,
    pending,
    setRelationSearchable,
    presentation,
    selectedType,
    setPresentation,
    message,
    changed,
  } = editor;
  const target = collections.find((entry) => entry.name === field.relation?.collection);
  return (
    <form onSubmit={submit} className="space-y-6 text-sm">
      <Tabs defaultValue="basic" className="space-y-4">
        <TabsList className="h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="basic">Основное</TabsTrigger>
          <TabsTrigger value="presentation">Отображение</TabsTrigger>
          <TabsTrigger value="relation">Связанные записи</TabsTrigger>
          <TabsTrigger value="search">Поиск</TabsTrigger>
        </TabsList>
        <TabsContent value="basic" className="space-y-4">
          <p>
            <span className="font-medium">Поле:</span> <code>{field.name}</code>
          </p>
          <p>
            <span className="font-medium">Вид:</span>{" "}
            {field.relation?.kind === "m2m" ? "Многие ко многим" : "Один ко многим"}
          </p>
          <p>
            <span className="font-medium">Связанная коллекция:</span>{" "}
            <code>{field.relation?.collection}</code>
          </p>
          {field.relation && field.relation.kind !== "m2o" && (
            <>
              <p>
                <span className="font-medium">Через коллекцию:</span>{" "}
                <code>{field.relation.throughCollection}</code>
              </p>
              <p>
                <span className="font-medium">Внешний ключ:</span>{" "}
                <code>{field.relation.throughField}</code>
              </p>
            </>
          )}
          <p className="text-muted-foreground">
            Физические имена связи после создания не меняются.
          </p>
        </TabsContent>
        <TabsContent value="search">
          <RelationSearchSettings
            searchable={relationSearchable}
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
        <p role="status" className="text-sm text-destructive">
          {message}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending || !changed}>
          {pending ? "Сохраняем…" : "Сохранить изменения"}
        </Button>
        <Button type="button" variant="ghost" disabled={pending} onClick={onCancel}>
          Отмена
        </Button>
      </div>
    </form>
  );
}