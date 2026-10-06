"use client";

import { CollectionEditorContent } from "./collection-editor-content";
import {
  collectionEditorTitle,
  isRelationChoice,
  type CollectionEditorSelection,
} from "./collection-editor-selection";
import { DatabaseZap } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import type { Collection, CollectionFolder } from "@/components/items/types";
import { CollectionsTable } from "./collections-table";
import { SystemCollections } from "./system-collections";
import { EditorDialog } from "./editor-dialog";
import { useWorkspace } from "@/components/workspaces/workspace-provider";
import type { CollectionLocation } from "@/lib/collection-tree";
import { useLocalizedCatalog } from "@/components/items/use-localized-catalog";
import { useUiCopy } from "@/lib/ui-copy";
import { requestErrorMessage, requestJson } from "@/lib/http-request";

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
  const copy = useUiCopy();

  const router = useRouter();
  const workspace = useWorkspace();
  const localized = useLocalizedCatalog(collections);
  const visible = localized.filter(
    (c) =>
      !/^plugin_/i.test(c.name) &&
      (superuser || !c.hidden) &&
      (!workspace || workspace.includes(c.name)),
  );
  const visibleFolders =
    workspace?.active || !superuser
      ? folders.filter((f) => visible.some((c) => c.folderId === f.id))
      : folders;
  const [selection, setSelection] = useState<CollectionEditorSelection | null>(
    null,
  );
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
  const title = collectionEditorTitle(selection, collections, copy);
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
      await requestJson(
        `/api/collections/${encodeURIComponent(name)}/navigation`,
        "PATCH",
        { ...location, before },
      );
      router.refresh();
    } catch (cause) {
      setMoveError(copy(requestErrorMessage(cause)));
    }
  }

  async function reorderFolder(id: string, before: string | null) {
    setMoveError("");
    try {
      await requestJson(
        `/api/folders/${encodeURIComponent(id)}/order`,
        "PATCH",
        { before },
      );
      router.refresh();
    } catch (cause) {
      setMoveError(copy(requestErrorMessage(cause)));
    }
  }

  return (
    <section
      className="space-y-4"
      aria-label={copy("Редактор коллекций")}
    >
      <PageHeader
        title={copy("Коллекции")}
        description={copy("Коллекций: {{value0}} · {{value1}}", {
          value0: visible.length,
          value1:
            workspace?.active?.name ||
            (superuser
              ? copy("Структура и поля ваших данных")
              : copy("Доступные вам данные")),
        })}
      >
        {superuser && (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={!online}
              onClick={() => setSelection({ kind: "folder" })}
            >
              {copy("Создать папку ")}
            </Button>
            <Button
              type="button"
              disabled={!online}
              onClick={() => setSelection({ kind: "collection" })}
            >
              {copy("Создать коллекцию ")}
            </Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={copy("Подключить представление")}
                  disabled={!online}
                  onClick={() => setSelection({ kind: "materialized" })}
                >
                  <DatabaseZap aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {copy("Подключить представление")}
              </TooltipContent>
            </Tooltip>
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
              ? copy("Пока нет коллекций. Создайте первую.")
              : copy("Нет доступных коллекций.")
            : copy("Подключите Core, чтобы увидеть коллекции.")}
        </div>
      ) : (
        <CollectionsTable
          collections={visible}
          catalog={localized}
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

      {superuser && (
        <SystemCollections
          catalog={localized}
          online={online}
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
            : copy("Структура данных")
        }
        onClose={close}
      >
        {(portalContainer, closeDialog, requestClose, requestLeave) => (
          <CollectionEditorContent
            selection={selection}
            collections={collections}
            folders={folders}
            container={portalContainer}
            onSaved={closeDialog}
            onCancel={requestClose}
            onLeave={requestLeave}
            onSelect={setSelection}
            onSettingsState={(dirty, busy) => setSettingsState({ dirty, busy })}
          />
        )}
      </EditorDialog>
    </section>
  );
}
