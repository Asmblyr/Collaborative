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
import { EditorDialog } from "@/components/ui/editor-dialog";
import { Tabs, TabsContent } from "@asmblyr-collaborative/kit/ui/tabs";
import { ItemRecordLoading } from "./item-record-loading";
import { ItemRecordFooter } from "./item-record-footer";
import { ItemRecordDataSection } from "./item-record-data-section";
import { recordLabel } from "./item-label";
import { ItemRecordNavigation } from "./item-record-navigation";
import type { OpenRelated } from "./relation-picker";
import type { RecordEditorRequest } from "./record-editor-types";
import { ItemHistory } from "./item-history";
import { fieldsInNodes } from "./form-layout-model";
import type { Collection, Item, ItemValue } from "./types";
import { draftChanges, type RecordDraft } from "./record-draft-model";
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
  trail,
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
    keepOpen?: boolean,
  ) => Promise<void>;
  formRevision?: number;
  conflictReview?: ReactNode;
  trail?: readonly string[];
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
    if (!id || !addressedPanel) {
      return;
    }
    const key = JSON.stringify([id, addressedPanel, targetId]);
    if (openedTarget.current === key) {
      return;
    }
    openedTarget.current = key;
    visitPanel(addressedPanel);
    setSection(addressedPanel);
  }, [id, addressedPanel, targetId, visitPanel]);

  const busy = pending || uploading || extensions.busy;
  const relationChanges = draftChanges({ ...draft, values: {} });
  const totalDraftChanges = draftChanges(draft);
  const recordDirty = changedCount > 0 || totalDraftChanges > 0;
  const dirty = recordDirty || extensions.dirty;

  useLayoutEffect(() => {
    onDirtyChange?.(dirty || busy);
  }, [busy, dirty, onDirtyChange]);

  const live = useRecordLive(collection.name, id, dirty, onRetry, busy);
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
  // Replacing the dialog would restart both entrance and backdrop animations.
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
        nested={Boolean(trail?.length)}
        contentKey={section}
        hasUnsavedChanges={dirty}
        title={title ?? (item ? recordLabel(collection, item) : copy("Запись"))}
        eyebrow={`${trail?.length ? `${trail.join(" → ")} → ` : ""}${collection.displayName || collection.name}${item ? ` · ${collection.primaryKey.name}: ${id}` : ""}`}
        onClose={(reason) => {
          if (busy) {
            return;
          }
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
            <ItemRecordFooter
              formId={formId}
              editFields={editFields}
              relationChanges={relationChanges}
              recordDirty={recordDirty}
              hasDraftChanges={totalDraftChanges > 0}
              extensionsDirty={extensions.dirty}
              dirty={dirty}
              busy={busy}
              draftMode={draftMode}
              hasConflictReview={Boolean(conflictReview)}
            />
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
              <ItemRecordDataSection
                hidden={section !== "data"}
                conflictReview={conflictReview}
                live={live}
                collection={collection}
                sourceFields={sourceCollection.fields}
                fields={fields}
                aliasFields={aliasFields}
                readOnlyFieldNames={readOnly.map((f) => f.name)}
                placedAliasNames={[...placed]}
                catalog={catalog}
                item={item}
                id={id}
                formId={formId}
                formRevision={formRevision}
                draft={draft}
                onDraftChange={onDraftChange}
                onEditRelation={onEditRelation}
                onOpenRelated={onOpenRelated}
                portalContainer={portalContainer}
                pending={pending}
                busy={busy}
                extensionsDirty={extensions.dirty}
                relationChanges={relationChanges}
                totalDraftChanges={totalDraftChanges}
                draftMode={draftMode}
                message={message}
                relationsRef={relationsRef}
                onReferenceChange={onReferenceChange}
                onUploadingChange={setUploading}
                onChangedCount={setChangedCount}
                onDirtyChange={onDirtyChange}
                onSubmitAttempt={() => setSection("data")}
                onSave={(values, keepOpen) => onSave(values, close, keepOpen)}
                onCancel={close}
              />
              <TabsContent value="history">
                <ItemHistory
                  key={`${id}:${formRevision}`}
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
