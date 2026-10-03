"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { LockKeyhole } from "lucide-react";
import { EditorDialog } from "@/components/collections/editor-dialog";
import { Tabs, TabsContent } from "@asmblyr/kit/ui/tabs";
import { ItemRecordLoading } from "./item-record-loading";
import { recordLabel } from "./item-label";
import { ItemRecordNavigation } from "./item-record-navigation";
import type { OpenRelated } from "./relation-picker";
import type { RecordEditorRequest } from "./record-editor-types";
import { displayValue } from "./item-display";
import { ItemForm } from "./item-form";
import { ItemFormActions } from "./item-form-actions";
import { ItemHistory } from "./item-history";
import { ItemRelations } from "./item-relations";
import type { Collection, Item, ItemValue } from "./types";
import { draftChanges, type RecordDraft } from "./record-draft-model";
import { RecordDraftSummary } from "./record-draft-summary";
import {
  useRecordPanels,
  RecordPanelTabs,
  RecordPanelContents,
} from "@/components/plugins/record-panels";

export function ItemRecordDialog({
  collection,
  catalog,
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
  draftMode?: boolean;
  onReferenceChange: (field: string, value: string) => void;
  onSave: (
    values: Record<string, ItemValue>,
    close: () => void,
  ) => Promise<void>;
  formRevision?: number;
  conflictReview?: ReactNode;
}) {
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
  const busy = pending || uploading || extensions.busy;
  const relationChanges = draftChanges({ ...draft, values: {} });
  const recordDirty = changedCount > 0 || relationChanges > 0;
  const dirty = recordDirty || extensions.dirty;
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
  const managed = [
    ...(collection.timestamps.createdAt && readable("created_at")
      ? [{ name: "created_at", label: "Создана" }]
      : []),
    ...(collection.timestamps.updatedAt && readable("updated_at")
      ? [{ name: "updated_at", label: "Обновлена" }]
      : []),
  ];

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
        title={title ?? (item ? recordLabel(collection, item) : "Запись")}
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
                  "Есть несохранённый текст на другой вкладке"
                ) : !editFields.length && !relationChanges ? (
                  <>
                    <LockKeyhole className="size-3.5" />
                    Только просмотр
                  </>
                ) : dirty ? (
                  <>
                    <span className="size-1.5 rounded-full bg-amber-500" />
                    Есть несохранённые изменения
                  </>
                ) : (
                  "Нет изменений"
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
                      ? "Применить к черновику"
                      : "Сохранить всё и закрыть"
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
              message={message}
              onRetry={onRetry}
            />
          ) : (
            <>
              <TabsContent
                value="data"
                forceMount
                hidden={section !== "data"}
                className="space-y-7"
              >
                {conflictReview}
                <ItemForm
                  key={`${id}:${formRevision}`}
                  id={formId}
                  hideActions
                  fields={fields}
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
                  portalContainer={portalContainer}
                  onBusyChange={setUploading}
                  onDirtyChange={setChangedCount}
                  onSubmitAttempt={() => setSection("data")}
                  onSave={(values) => onSave(values, close)}
                  onCancel={close}
                />
                {message && (
                  <p
                    role="alert"
                    className="text-sm text-destructive"
                  >
                    {message}
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
                    catalog={catalog}
                    itemId={id}
                    portalContainer={portalContainer}
                    onEdit={onEditRelation}
                    draft={draft}
                    onDraftChange={onDraftChange}
                    busy={busy || Boolean(conflictReview)}
                  />
                </div>
                {managed.length > 0 && (
                  <section
                    aria-label="Сведения о записи"
                    className="grid gap-4 border-t pt-5 sm:grid-cols-2"
                  >
                    {managed.map((field) => (
                      <div
                        key={field.name}
                        className="space-y-1"
                      >
                        <p className="text-xs text-muted-foreground">
                          {field.label}
                        </p>
                        <p className="text-xs tabular-nums">
                          {item[field.name] == null
                            ? "Дата неизвестна"
                            : displayValue(item[field.name], "datetime")}
                        </p>
                      </div>
                    ))}
                  </section>
                )}
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
              />
            </>
          )
        }
      </EditorDialog>
    </Tabs>
  );
}
