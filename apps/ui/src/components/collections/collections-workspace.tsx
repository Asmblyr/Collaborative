"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@asmblyr/kit/ui/button";
import type { Collection, CollectionFolder } from "@/components/items/types";
import { CollectionFormDesigner } from "./collection-form-designer";
import { CollectionSettingsForm } from "./collection-settings-form";
import { CollectionsTable } from "./collections-table";
import { CreateCollectionForm } from "./create-collection-form";
import { DeleteStructureForm } from "./delete-structure-form";
import { EditorDialog } from "./editor-dialog";
import { FieldEditorForm } from "./field-editor-form";
import { FieldTypePicker, type FieldChoice } from "./field-type-picker";
import { FolderForm } from "./folder-form";
import { RelationCreateForm } from "./relation-create-form";
import { useWorkspace } from "@/components/workspaces/workspace-provider";
import type { CollectionLocation } from "@/lib/collection-tree";

type Selection =
  | { kind: "form"; collection: string }
  | { kind: "display"; collection: string }
  | { kind: "collection"; folderId?: string }
  | { kind: "folder"; folder?: CollectionFolder }
  | { kind: "field"; collection: string; field?: string; choice?: FieldChoice }
  | { kind: "delete-field"; collection: string; field: string }
  | { kind: "delete-collection"; collection: string };

function isRelationChoice(
  choice: FieldChoice,
): choice is "m2o" | "o2m" | "m2m" {
  return choice === "m2o" || choice === "o2m" || choice === "m2m";
}

export function CollectionsWorkspace({
  collections,
  folders,
  online,
  superuser,
}: {
  collections: Collection[];
  folders: CollectionFolder[];
  online: boolean;
  superuser: boolean;
}) {
  const router = useRouter();
  const workspace = useWorkspace();
  const visible = collections.filter(
    (c) =>
      (superuser || !c.hidden) && (!workspace || workspace.includes(c.name)),
  );
  const visibleFolders =
    workspace?.active || !superuser
      ? folders.filter((f) => visible.some((c) => c.folderId === f.id))
      : folders;
  const [selection, setSelection] = useState<Selection | null>(null);
  const [settingsState, setSettingsState] = useState({
    dirty: false,
    busy: false,
  });
  const [moveError, setMoveError] = useState("");
  const collection =
    selection?.kind === "field" ||
    selection?.kind === "display" ||
    selection?.kind === "form"
      ? collections.find((entry) => entry.name === selection.collection)
      : undefined;
  const field =
    selection?.kind === "field"
      ? collection?.fields.find((entry) => entry.name === selection.field)
      : undefined;
  const title =
    selection?.kind === "form"
      ? "Организация формы"
      : selection?.kind === "display"
        ? "Настройки коллекции"
        : selection?.kind === "delete-field"
          ? `Удалить поле ${selection.field}`
          : selection?.kind === "delete-collection"
            ? `Удалить коллекцию ${selection.collection}`
            : selection?.kind === "collection"
              ? "Новая коллекция"
              : selection?.kind === "folder"
                ? selection.folder
                  ? `Папка ${selection.folder.name}`
                  : "Новая папка"
                : field
                  ? `Настройка поля ${field.name}`
                  : "Добавить поле";

  function close() {
    setSelection(null);
    setSettingsState({ dirty: false, busy: false });
  }

  async function moveCollection(
    name: string,
    location: CollectionLocation,
    before?: string | null,
  ) {
    setMoveError("");
    try {
      const response = await fetch(
        `/api/collections/${encodeURIComponent(name)}/navigation`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...location, before }),
        },
      );
      if (!response.ok) {
        const result = (await response.json()) as { message?: string };
        setMoveError(result.message ?? "Не удалось переместить коллекцию");
        return;
      }
      router.refresh();
    } catch {
      setMoveError("Не удалось связаться с сервером");
    }
  }

  async function reorderFolder(id: string, before: string | null) {
    setMoveError("");
    try {
      const response = await fetch(
        `/api/folders/${encodeURIComponent(id)}/order`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ before }),
        },
      );
      if (!response.ok) {
        const result = (await response.json()) as { message?: string };
        setMoveError(result.message ?? "Не удалось переместить папку");
        return;
      }
      router.refresh();
    } catch {
      setMoveError("Не удалось связаться с сервером");
    }
  }

  return (
    <section
      className="space-y-4"
      aria-label="Редактор коллекций"
    >
      <PageHeader
        title="Коллекции"
        description={`Коллекций: ${visible.length} · ${workspace?.active?.name || (superuser ? "Структура и поля ваших данных" : "Доступные вам данные")}`}
      >
        {superuser && (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={!online}
              onClick={() => setSelection({ kind: "folder" })}
            >
              Создать папку
            </Button>
            <Button
              type="button"
              disabled={!online}
              onClick={() => setSelection({ kind: "collection" })}
            >
              Создать коллекцию
            </Button>
          </div>
        )}
      </PageHeader>
      {moveError && (
        <p
          role="status"
          className="text-sm text-destructive"
        >
          {moveError}
        </p>
      )}
      {visible.length === 0 && visibleFolders.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          {online
            ? superuser
              ? "Пока нет коллекций. Создайте первую."
              : "Нет доступных коллекций."
            : "Подключите Core, чтобы увидеть коллекции."}
        </div>
      ) : (
        <CollectionsTable
          collections={visible}
          catalog={collections}
          folders={visibleFolders}
          superuser={superuser}
          onEditFolder={(folder) => setSelection({ kind: "folder", folder })}
          onCreateInFolder={(folderId) =>
            setSelection({ kind: "collection", folderId })
          }
          onMoveCollection={moveCollection}
          onReorderFolder={reorderFolder}
          onForm={(collection) => setSelection({ kind: "form", collection })}
          onDisplay={(collection) =>
            setSelection({ kind: "display", collection })
          }
          onAddField={(collection) =>
            setSelection({ kind: "field", collection })
          }
          onEditField={(collection, field) =>
            setSelection({ kind: "field", collection, field })
          }
          onDeleteField={(collection, field) =>
            setSelection({ kind: "delete-field", collection, field })
          }
          onDeleteCollection={(collection) =>
            setSelection({ kind: "delete-collection", collection })
          }
        />
      )}

      <EditorDialog
        open={selection !== null}
        title={title}
        hasUnsavedChanges={settingsState.dirty}
        busy={settingsState.busy}
        size={
          selection?.kind === "form"
            ? "wide"
            : selection?.kind === "field" &&
                selection.choice &&
                isRelationChoice(selection.choice)
              ? selection.choice === "m2m"
                ? "junction"
                : "relation"
              : selection?.kind === "field" &&
                  (field?.type === "text" ||
                    field?.type === "email" ||
                    field?.type === "json" ||
                    selection.choice === "text" ||
                    selection.choice === "email" ||
                    selection.choice === "json")
                ? "relation"
                : "default"
        }
        contentKey={
          selection?.kind === "field"
            ? `${selection.collection}:${selection.field ?? selection.choice ?? "picker"}`
            : selection?.kind
        }
        eyebrow={
          selection && "collection" in selection
            ? selection.collection
            : "Структура данных"
        }
        onClose={close}
      >
        {(portalContainer, closeDialog, requestClose, requestLeave) =>
          selection?.kind === "form" && collection ? (
            <CollectionFormDesigner
              collection={collection}
              catalog={collections}
              container={portalContainer}
              onSaved={closeDialog}
            />
          ) : selection?.kind === "display" && collection ? (
            <CollectionSettingsForm
              catalog={collections}
              key={collection.name}
              collection={collection}
              portalContainer={portalContainer}
              onSaved={closeDialog}
              onStateChange={(dirty, busy) => setSettingsState({ dirty, busy })}
            />
          ) : selection?.kind === "collection" ? (
            <CreateCollectionForm
              folders={folders}
              collections={collections}
              initialFolderId={selection.folderId}
              portalContainer={portalContainer}
              onSaved={closeDialog}
              onCancel={requestClose}
            />
          ) : selection?.kind === "folder" ? (
            <FolderForm
              key={selection.folder?.id ?? "new"}
              folder={selection.folder}
              onSaved={closeDialog}
              onCancel={requestClose}
            />
          ) : selection?.kind === "field" && collection && field ? (
            <FieldEditorForm
              collections={collections}
              key={`${selection.collection}:${field.name}`}
              collection={collection.name}
              field={field}
              portalContainer={portalContainer}
              onSaved={closeDialog}
              onCancel={requestClose}
            />
          ) : selection?.kind === "field" &&
            collection &&
            !selection.field &&
            !selection.choice ? (
            <FieldTypePicker
              onSelect={(choice) =>
                setSelection({
                  kind: "field",
                  collection: collection.name,
                  choice,
                })
              }
            />
          ) : selection?.kind === "field" && collection && selection.choice ? (
            isRelationChoice(selection.choice) ? (
              <RelationCreateForm
                key={`${collection.name}:${selection.choice}`}
                collection={collection.name}
                collections={collections}
                kind={selection.choice}
                portalContainer={portalContainer}
                onSaved={closeDialog}
                onCancel={requestClose}
                onBack={() =>
                  requestLeave(() =>
                    setSelection({
                      kind: "field",
                      collection: collection.name,
                    }),
                  )
                }
              />
            ) : (
              <FieldEditorForm
                collections={collections}
                key={`${collection.name}:${selection.choice}`}
                collection={collection.name}
                type={selection.choice}
                portalContainer={portalContainer}
                onSaved={closeDialog}
                onCancel={requestClose}
                onBack={() =>
                  requestLeave(() =>
                    setSelection({
                      kind: "field",
                      collection: collection.name,
                    }),
                  )
                }
              />
            )
          ) : selection?.kind === "delete-field" ||
            selection?.kind === "delete-collection" ? (
            <DeleteStructureForm
              key={`${selection.kind}:${selection.collection}:${
                selection.kind === "delete-field" ? selection.field : ""
              }`}
              collection={selection.collection}
              field={
                selection.kind === "delete-field" ? selection.field : undefined
              }
              onDeleted={closeDialog}
              onCancel={requestClose}
            />
          ) : null
        }
      </EditorDialog>
    </section>
  );
}
