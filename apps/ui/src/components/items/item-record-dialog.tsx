"use client";

import { useLocalizedCatalog } from "./use-localized-catalog";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { recordIdFromPath } from "@/lib/item-location";
import { LockKeyhole } from "lucide-react";
import { EditorDialog } from "@/components/collections/editor-dialog";
import { Tabs, TabsContent } from "@asmblyr-collaborative/kit/ui/tabs";
import { ItemRecordLoading } from "./item-record-loading";
import { recordLabel } from "./item-label";
import { ItemRecordNavigation } from "./item-record-navigation";
import type { OpenRelated } from "./relation-picker";
import type { RecordEditorRequest } from "./record-editor-types";
import { RecordMetadata } from "./record-metadata";
import { ItemForm } from "./item-form";
import { MaterializedRecordCard } from "./materialized-record-card";
import { ItemFormActions } from "./item-form-actions";
import { ItemHistory } from "./item-history";
import { ItemAliasField } from "./item-alias-field";
import { fieldsInNodes } from "./form-layout-model";
import { ItemRelations } from "./item-relations";
import type { Collection, Item, ItemValue } from "./types";
import { draftChanges, type RecordDraft } from "./record-draft-model";
import { RecordDraftSummary } from "./record-draft-summary";
import {
  useRecordPanels,
  RecordPanelTabs,
  RecordPanelContents,
} from "@/components/plugins/record-panels";
import { useUiCopy } from "@/lib/ui-copy";
import { AssistantRecordHost } from "@/components/assistant/assistant-host";
import { useRecordLive } from "./use-record-live";

export function ItemRecordDialog({
  collection: sourceCollection,
  catalog: sourceCatalog,
  item,
  pending,
  message,
  onClose,
  onRetry,
  onSave,
  onOpenRelated,
  onEditRelation,
  omitFields = [],
  title,
  draft,
  onDraftChange,
  onDirtyChange,
  draftMode,
  onReferenceChange,
  formRevision = 0,
  conflictReview,
}: {
  collection: Collection;
  catalog: Collection[];
  omitFields?: string[];
  title?: string;
  onOpenRelated: OpenRelated;
  onEditRelation: (request: RecordEditorRequest) => void;
  item: Item | null;
  pending: boolean;
  message: string;
  onClose: (reason?: "navigation") => void;
  onRetry: () => void;
  draft: RecordDraft;
  onDraftChange: (draft: RecordDraft) => void;
  onDirtyChange?: (dirty: boolean) => void;
  draftMode?: boolean;
  onReferenceChange: (field: string, value: string) => void;
  onSave: (
    values: Record<string, ItemValue>,
    close: () => void,
  ) => Promise<void>;
  formRevision?: number;
  conflictReview?: ReactNode;
}) {
  const copy = useUiCopy();

  const catalog = useLocalizedCatalog(sourceCatalog);
  const collection =
    catalog.find((entry) => entry.name === sourceCollection.name) ??
    sourceCollection;
  const [section, setSection] = useState<string>("data");
  const relationsRef = useRef<HTMLDivElement>(null);
  const [uploading, setUploading] = useState(false);
  const [changedCount, setChangedCount] = useState(0);
  const id = item ? String(item[collection.primaryKey.name]) : "";
  const panelRecord = {
    collection: collection.name,
    id,
    displayName: collection.displayName || collection.name,
  };
  const extensions = useRecordPanels(panelRecord);
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const targetPanel = searchParams.get("panel");
  const targetId = searchParams.get("target");
  const addressedPanel =
    recordIdFromPath(pathname, collection.name) === id
      ? extensions.panels.find((panel) => panel.key === targetPanel)?.key
      : undefined;
  const visitPanel = extensions.visit;
  const openedTarget = useRef("");
  useEffect(() => {
    if (!id || !addressedPanel) return;
    const key = JSON.stringify([id, addressedPanel, targetId]);
    if (openedTarget.current === key) return;
    openedTarget.current = key;
    visitPanel(addressedPanel);
    setSection(addressedPanel);
  }, [id, addressedPanel, targetId, visitPanel]);
  const busy = pending || uploading || extensions.busy;
  const relationChanges = draftChanges({ ...draft, values: {} });
  const recordDirty = changedCount > 0 || draftChanges(draft) > 0;
  const dirty = recordDirty || extensions.dirty;
  useLayoutEffect(() => {
    onDirtyChange?.(dirty || busy);
  }, [busy, dirty, onDirtyChange]);
  const live = useRecordLive(collection.name, id, dirty, onRetry);
  const formId = useId();
  const readable = (name: string) =>
    collection.access.read?.includes("*") ||
    collection.access.read?.includes(name);
  const editable = (name: string) =>
    collection.access.update?.includes("*") ||
    collection.access.update?.includes(name);
  const fields = collection.fields.filter(
    (field) =>
      field.type !== "alias" &&
      readable(field.name) &&
      !omitFields.includes(field.name),
  );
  const editFields = fields.filter((field) => editable(field.name));
  const readOnly = fields.filter((field) => !editable(field.name));
  const placed = new Set(
    collection.formLayout?.tabs.flatMap((tab) => fieldsInNodes(tab.children)) ??
      [],
  );
  const aliasFields = collection.fields.filter(
    (f) => f.type === "alias" && readable(f.name) && placed.has(f.name),
  );

  // Keep one native dialog mounted through loading, failure and loaded states.
  // Replacing the dialog would restart both its entrance and backdrop animations.
  return (
    <Tabs
      value={section}
      onValueChange={(value) => {
        if (!busy) {
          extensions.visit(value);
          setSection(value);
        }
      }}
      className="contents"
    >
      <EditorDialog
        open
        busy={busy}
        size="record"
        contentKey={section}
        hasUnsavedChanges={dirty}
        title={title ?? (item ? recordLabel(collection, item) : copy("Запись"))}
        eyebrow={`${collection.displayName || collection.name}${item ? ` · ${collection.primaryKey.name}: ${id}` : ""}`}
        onClose={(reason) => {
          if (busy) return;
          setSection("data");
          onClose(reason);
        }}
        navigation={
          item && (
            <ItemRecordNavigation
              collection={collection.name}
              id={id}
              busy={busy}
              section={section}
              panels={
                <RecordPanelTabs
                  panels={extensions.panels}
                  disabled={busy}
                />
              }
              hasRelations={collection.fields.some(
                (field) =>
                  field.type === "alias" &&
                  readable(field.name) &&
                  catalog.some(
                    (entry) =>
                      entry.name === field.relation?.collection &&
                      entry.access.read,
                  ),
              )}
              onOpenRelations={() => {
                relationsRef.current?.scrollIntoView({
                  block: "start",
                  behavior: window.matchMedia(
                    "(prefers-reduced-motion: reduce)",
                  ).matches
                    ? "instant"
                    : "smooth",
                });
                relationsRef.current?.focus({ preventScroll: true });
              }}
            />
          )
        }
        footer={
          item &&
          !section.startsWith("plugin:") && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p
                role="status"
                className="flex items-center gap-2 text-xs text-muted-foreground"
              >
                {extensions.dirty ? (
                  copy("Есть несохранённый текст на другой вкладке")
                ) : !editFields.length && !relationChanges ? (
                  <>
                    <LockKeyhole className="size-3.5" />
                    {copy("Только просмотр ")}
                  </>
                ) : dirty ? (
                  <>
                    <span className="size-1.5 rounded-full bg-amber-500" />
                    {copy("Есть несохранённые изменения ")}
                  </>
                ) : (
                  copy("Нет изменений")
                )}
              </p>
              {(editFields.length > 0 || relationChanges > 0) && (
                <ItemFormActions
                  formId={formId}
                  fields={editFields}
                  pending={busy}
                  disabled={
                    Boolean(conflictReview) ||
                    extensions.dirty ||
                    (!recordDirty && !(draftMode && draftChanges(draft)))
                  }
                  label={
                    draftMode
                      ? copy("Применить к черновику")
                      : copy("Сохранить всё и закрыть")
                  }
                />
              )}
            </div>
          )
        }
      >
        {(portalContainer, close) =>
          !item ? (
            <ItemRecordLoading
              message={copy(message)}
              onRetry={onRetry}
            />
          ) : (
            <>
              <AssistantRecordHost
                container={portalContainer}
                collection={collection.name}
                id={id}
              />
              <TabsContent
                value="data"
                forceMount
                hidden={section !== "data"}
                className="space-y-7"
              >
                {conflictReview}
                <div
                  role="status"
                  className="text-xs text-muted-foreground"
                >
                  {live.state === "connected"
                    ? copy("В сети")
                    : live.state === "reconnecting"
                      ? copy("Переподключение…")
                      : live.state === "offline"
                        ? copy("Нет соединения")
                        : copy("Подключение…")}
                  {live.notice && (
                    <span className="ml-2 text-amber-600">{live.notice}</span>
                  )}
                </div>
                {collection.sourceKind === "materialized-view" ? (
                  <MaterializedRecordCard
                    collection={collection}
                    fields={fields}
                    sourceFields={sourceCollection.fields}
                    item={item}
                    catalog={catalog}
                    onOpenRelated={onOpenRelated}
                  />
                ) : (
                  <ItemForm
                    key={`${id}:${formRevision}`}
                    id={formId}
                    hideActions
                    fields={fields}
                    aliasFields={aliasFields}
                    renderAlias={(field) => (
                      <ItemAliasField
                        field={field}
                        collection={collection}
                        catalog={catalog}
                        itemId={id}
                        draft={draft}
                        onDraftChange={onDraftChange}
                        onEdit={onEditRelation}
                        busy={busy || Boolean(conflictReview)}
                        container={portalContainer}
                      />
                    )}
                    formLayout={collection.formLayout}
                    readOnlyFields={readOnly.map((f) => f.name)}
                    catalog={catalog}
                    onOpenRelated={onOpenRelated}
                    embedded
                    primaryKey={collection.primaryKey}
                    item={item}
                    pending={pending || Boolean(conflictReview)}
                    initialValues={draft.values}
                    allowUnchanged={
                      relationChanges > 0 ||
                      Boolean(draftMode && draftChanges(draft))
                    }
                    onReferenceChange={onReferenceChange}
                    onFieldFocus={live.focus}
                    onFieldBlur={live.blur}
                    fieldHolders={Object.fromEntries(
                      Object.entries(live.holders)
                        .filter(([, holder]) => holder.id !== live.selfId)
                        .map(([field, holder]) => [field, holder.displayName]),
                    )}
                    portalContainer={portalContainer}
                    onBusyChange={setUploading}
                    onDirtyChange={(count) => {
                      setChangedCount(count);
                      onDirtyChange?.(
                        count > 0 ||
                          draftChanges(draft) > 0 ||
                          extensions.dirty ||
                          busy,
                      );
                    }}
                    onSubmitAttempt={() => setSection("data")}
                    onSave={(values) => onSave(values, close)}
                    onCancel={close}
                  />
                )}
                {message && (
                  <p
                    role="alert"
                    className="text-sm text-destructive"
                  >
                    {copy(message)}
                  </p>
                )}
                <RecordDraftSummary
                  draft={draft}
                  busy={busy || Boolean(conflictReview)}
                  onChange={onDraftChange}
                  onEdit={onEditRelation}
                />
                <div
                  ref={relationsRef}
                  tabIndex={-1}
                  className="scroll-mt-2 outline-none"
                >
                  <ItemRelations
                    key={id}
                    collection={collection}
                    excludeAliases={[...placed]}
                    catalog={catalog}
                    itemId={id}
                    portalContainer={portalContainer}
                    onEdit={onEditRelation}
                    draft={draft}
                    onDraftChange={onDraftChange}
                    busy={busy || Boolean(conflictReview)}
                  />
                </div>
                <RecordMetadata
                  collection={collection}
                  item={item}
                />
              </TabsContent>
              <TabsContent value="history">
                <ItemHistory
                  key={id}
                  collection={collection.name}
                  schema={collection}
                  itemId={id}
                />
              </TabsContent>
              <RecordPanelContents
                key={id}
                panels={extensions.panels}
                record={panelRecord}
                section={section}
                reportState={extensions.reportState}
                visited={extensions.visited}
                target={
                  addressedPanel && targetId
                    ? { panel: addressedPanel, id: targetId }
                    : undefined
                }
              />
            </>
          )
        }
      </EditorDialog>
    </Tabs>
  );
}
