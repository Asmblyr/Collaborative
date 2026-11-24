"use client";

import type { ReactNode, RefObject } from "react";
import { TabsContent } from "@asmblyr-collaborative/kit/ui/tabs";
import type { OpenRelated } from "./relation-picker";
import type { RecordEditorRequest } from "./record-editor-types";
import { RecordMetadata } from "./record-metadata";
import { ItemForm } from "./item-form";
import { MaterializedRecordCard } from "./materialized-record-card";
import { ItemAliasField } from "./item-alias-field";
import { ItemRelations } from "./item-relations";
import type { Collection, CollectionField, Item, ItemValue } from "./types";
import { draftChanges, type RecordDraft } from "./record-draft-model";
import { RecordDraftSummary } from "./record-draft-summary";
import { useUiCopy } from "@/lib/ui-copy";
import type { useRecordLive } from "./use-record-live";

export function ItemRecordDataSection({
  hidden,
  conflictReview,
  live,
  collection,
  sourceFields,
  fields,
  aliasFields,
  readOnlyFieldNames,
  placedAliasNames,
  catalog,
  item,
  id,
  formId,
  formRevision,
  draft,
  onDraftChange,
  onEditRelation,
  onOpenRelated,
  portalContainer,
  pending,
  busy,
  extensionsDirty,
  relationChanges,
  totalDraftChanges,
  draftMode,
  message,
  relationsRef,
  onReferenceChange,
  onUploadingChange,
  onChangedCount,
  onDirtyChange,
  onSubmitAttempt,
  onSave,
  onCancel,
}: {
  hidden: boolean;
  conflictReview?: ReactNode;
  live: ReturnType<typeof useRecordLive>;
  collection: Collection;
  sourceFields: CollectionField[];
  fields: CollectionField[];
  aliasFields: CollectionField[];
  readOnlyFieldNames: string[];
  placedAliasNames: string[];
  catalog: Collection[];
  item: Item;
  id: string;
  formId: string;
  formRevision: number;
  draft: RecordDraft;
  onDraftChange: (draft: RecordDraft) => void;
  onEditRelation: (request: RecordEditorRequest) => void;
  onOpenRelated: OpenRelated;
  portalContainer: HTMLElement | null;
  pending: boolean;
  busy: boolean;
  extensionsDirty: boolean;
  relationChanges: number;
  totalDraftChanges: number;
  draftMode?: boolean;
  message: string;
  relationsRef: RefObject<HTMLDivElement | null>;
  onReferenceChange: (field: string, value: string) => void;
  onUploadingChange: (uploading: boolean) => void;
  onChangedCount: (count: number) => void;
  onDirtyChange?: (dirty: boolean) => void;
  onSubmitAttempt: () => void;
  onSave: (
    values: Record<string, ItemValue>,
    keepOpen?: boolean,
  ) => Promise<void>;
  onCancel: () => void;
}) {
  const copy = useUiCopy();

  const liveDotClass =
    live.state === "connected"
      ? "bg-emerald-500"
      : live.state === "offline"
        ? "bg-destructive"
        : "bg-amber-500";
  const liveLabel =
    live.state === "connected"
      ? copy("В сети")
      : live.state === "reconnecting"
        ? copy("Переподключение…")
        : live.state === "offline"
          ? copy("Нет соединения")
          : copy("Подключение…");

  return (
    <TabsContent
      value="data"
      forceMount
      hidden={hidden}
      className="space-y-6"
    >
      {conflictReview}
      <div className="space-y-3">
        <div
          role="status"
          className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
        >
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-muted/40 px-2.5 py-0.5 font-medium text-foreground/80">
            <span
              aria-hidden="true"
              className={`size-1.5 rounded-full ${liveDotClass}`}
            />
            {liveLabel}
          </span>
          {live.notice && (
            <span className="text-amber-600 dark:text-amber-400">
              {live.notice}
            </span>
          )}
        </div>
        {collection.sourceKind === "materialized-view" ? (
          <MaterializedRecordCard
            collection={collection}
            fields={fields}
            sourceFields={sourceFields}
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
            readOnlyFields={readOnlyFieldNames}
            catalog={catalog}
            onOpenRelated={onOpenRelated}
            embedded
            primaryKey={collection.primaryKey}
            item={item}
            pending={pending || Boolean(conflictReview)}
            initialValues={draft.values}
            allowUnchanged={
              relationChanges > 0 || Boolean(draftMode && totalDraftChanges > 0)
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
            onBusyChange={onUploadingChange}
            onDirtyChange={(count) => {
              onChangedCount(count);
              onDirtyChange?.(
                count > 0 || draftChanges(draft) > 0 || extensionsDirty || busy,
              );
            }}
            onSubmitAttempt={onSubmitAttempt}
            onSave={onSave}
            onCancel={onCancel}
          />
        )}
      </div>
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
          key={`${id}:${formRevision}`}
          collection={collection}
          excludeAliases={placedAliasNames}
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
  );
}
