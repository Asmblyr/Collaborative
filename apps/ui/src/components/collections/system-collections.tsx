"use client";
import { useEffect, useId, useState } from "react";
import { ChevronRight, LockKeyhole } from "lucide-react";
import type { SystemCollection } from "@asmblyr-collaborative/contracts";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import type { Collection } from "@/components/items/types";
import { apiRequest } from "@/lib/api-request";
import { useUiCopy } from "@/lib/ui-copy";
import { useLocalizedCatalog } from "@/components/items/use-localized-catalog";
import { SystemCollectionList } from "./system-collection-list";
import { EditorDialog } from "./editor-dialog";
import { FieldTypePicker, type DataFieldType } from "./field-type-picker";
import { FieldEditorForm } from "./field-editor-form";
import {
  systemCollectionLabels,
  systemCollectionModel,
} from "./system-collection-model";
import { SystemFieldDelete } from "./system-field-delete";
import { SystemRecords } from "./system-records";
import { SystemRelationForm } from "./system-relation-form";

export type Selection =
  | {
      collection: string;
      kind: "field";
      field?: string;
      type?: DataFieldType | "m2o";
    }
  | { collection: string; kind: "delete"; field: string }
  | { collection: string; kind: "records" };

export function SystemCollections({
  catalog,
  online,
}: {
  catalog: Collection[];
  online: boolean;
}) {
  const copy = useUiCopy();
  const regionId = useId();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<SystemCollection[]>([]);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selection, setSelection] = useState<Selection | null>(null);
  const models = useLocalizedCatalog(
    data.map((collection) =>
      systemCollectionModel(
        collection,
        copy(systemCollectionLabels[collection.name]),
      ),
    ),
  );
  useEffect(() => {
    if (!open) {
      return;
    }
    let active = true;
    apiRequest<SystemCollection[]>("/api/system-collections")
      .then((collections) => {
        if (active) {
          setData(collections);
          setError("");
          setLoading(false);
        }
      })
      .catch((cause) => {
        if (active) {
          setError((cause as Error).message);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [open, revision]);
  const selected = data.find(
    (collection) => collection.name === selection?.collection,
  );
  const model = models.find(
    (collection) => collection.name === selection?.collection,
  );
  const field =
    selection?.kind === "field"
      ? selected?.fields.find((entry) => entry.name === selection.field)
      : undefined;
  function refresh() {
    setLoading(true);
    setRevision((value) => value + 1);
  }
  let title = copy("Добавить поле");
  if (selection?.kind === "records") {
    title = copy("Дополнительные данные");
  } else if (selection?.kind === "delete") {
    title = copy("Удалить поле");
  } else if (field) {
    title = copy("Настроить поле {{value0}}", { value0: field.name });
  }
  return (
    <section className="space-y-3 border-t pt-4">
      <Button
        size="sm"
        variant="ghost"
        disabled={!online}
        aria-expanded={open}
        aria-controls={regionId}
        onClick={() => {
          setOpen(!open);
          if (!open) {
            setLoading(true);
          }
        }}
      >
        <ChevronRight
          aria-hidden="true"
          className={open ? "rotate-90" : ""}
        />
        <LockKeyhole aria-hidden="true" />
        {open
          ? copy("Скрыть системные коллекции")
          : copy("Показать системные коллекции")}
      </Button>
      {open && (
        <div
          id={regionId}
          className="space-y-3"
        >
          <p className="px-3 text-xs text-muted-foreground">
            {copy(
              "Встроенные поля защищены. Можно добавлять и настраивать свои поля.",
            )}
          </p>
          {loading && (
            <p
              role="status"
              className="px-3 text-sm text-muted-foreground"
            >
              {copy("Загрузка…")}
            </p>
          )}
          {error && (
            <div
              role="alert"
              className="px-3 text-sm text-destructive"
            >
              {error}
              <Button
                variant="ghost"
                size="sm"
                onClick={refresh}
              >
                {copy("Повторить")}
              </Button>
            </div>
          )}
          <SystemCollectionList
            models={models}
            onSelect={setSelection}
          />
        </div>
      )}
      <EditorDialog
        open={Boolean(selection)}
        title={title}
        eyebrow={model?.displayName ?? ""}
        onClose={() => setSelection(null)}
        contentKey={
          selection
            ? `${selection.collection}:${selection.kind}:${selection.kind === "field" ? (selection.field ?? selection.type ?? "picker") : ""}`
            : ""
        }
      >
        {(container, close, requestClose, requestLeave) => {
          if (!selected || !selection) {
            return null;
          }
          const saved = () => {
            close();
            refresh();
          };
          if (selection.kind === "records") {
            return (
              <SystemRecords
                collection={selected}
                catalog={catalog}
                container={container}
                onLeave={requestLeave}
              />
            );
          }
          if (selection.kind === "delete") {
            return (
              <SystemFieldDelete
                collection={selected.name}
                field={selection.field}
                onDeleted={saved}
                onCancel={requestClose}
              />
            );
          }
          if (!field && !selection.type) {
            return (
              <FieldTypePicker
                relationKinds={["m2o"]}
                onSelect={(type) => {
                  if (type !== "o2m" && type !== "m2m") {
                    setSelection({
                      kind: "field",
                      collection: selected.name,
                      type,
                    });
                  }
                }}
              />
            );
          }
          if (selection.type === "m2o") {
            return (
              <SystemRelationForm
                collection={selected.name}
                catalog={catalog}
                container={container}
                onSaved={saved}
                onCancel={requestClose}
                onBack={() =>
                  requestLeave(() =>
                    setSelection({ kind: "field", collection: selected.name }),
                  )
                }
              />
            );
          }
          return (
            <FieldEditorForm
              system
              key={`${selected.name}:${field?.name ?? selection.type}`}
              collection={selected.name}
              collections={[...catalog, ...models]}
              field={field}
              type={selection.type}
              portalContainer={container}
              onSaved={saved}
              onCancel={requestClose}
              onBack={() =>
                requestLeave(() =>
                  setSelection({ kind: "field", collection: selected.name }),
                )
              }
            />
          );
        }}
      </EditorDialog>
    </section>
  );
}
