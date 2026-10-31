"use client";

import { useId, useState } from "react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { Input } from "@asmblyr-collaborative/kit/ui/input";
import { RelationPanelHeader } from "./relation-panel-header";
import { RelationPanelPagination } from "./relation-panel-pagination";
import { RelationRows } from "./relation-rows";
import { RelationCreateDialog } from "./relation-create-dialog";
import { RelationDraftRows } from "./relation-draft-rows";
import { recordChoiceColumns } from "./record-choice-presentation";
import {
  draftChanges,
  type RecordDraft,
  type RelationDraft,
} from "./record-draft-model";
import { useRelationPanel } from "./use-relation-panel";
import type { RecordEditorRequest } from "./record-editor-types";
import type { Collection, CollectionField } from "./types";
import { useUiCopy } from "@/lib/ui-copy";

export function RelationPanel({
  collection,
  itemId,
  field,
  target,
  catalog,
  portalContainer,
  onEdit,
  busy: saving,
  draft,
  onDraftChange,
}: {
  collection: string;
  itemId: string;
  field: CollectionField;
  target: Collection;
  catalog: Collection[];
  portalContainer: HTMLElement | null;
  onEdit: (request: RecordEditorRequest) => void;
  busy: boolean;
  draft: RelationDraft;
  onDraftChange: (draft: RelationDraft) => void;
}) {
  const copy = useUiCopy();

  const endpoint = `/api/items/${encodeURIComponent(collection)}/${encodeURIComponent(itemId)}/relations/${encodeURIComponent(field.name)}`;
  const state = useRelationPanel(
    endpoint,
    JSON.stringify(field.presentation?.relation),
  );
  const { result, loading, query, page, error, refresh } = state;
  const pending = saving;
  const [creating, setCreating] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const contentId = useId();
  const relation = field.relation;
  const junction =
    relation?.kind === "m2m"
      ? catalog.find((c) => c.name === relation.throughCollection)
      : undefined;
  const keys =
    relation && relation.kind !== "m2o"
      ? [
          relation.throughField,
          ...(relation.relatedField ? [relation.relatedField] : []),
        ]
      : [];
  const attributes =
    junction?.fields.filter(
      (f) => f.type !== "alias" && !keys.includes(f.name),
    ) ?? [];
  const linkCreateFields = attributes.filter(
    (f) =>
      junction?.access.create?.includes("*") ||
      junction?.access.create?.includes(f.name),
  );
  const linkReadFields = attributes.filter(
    (f) =>
      junction?.access.read?.includes("*") ||
      junction?.access.read?.includes(f.name),
  );
  const hasLinkForm = Boolean(junction && linkCreateFields.length);
  const label = field.presentation?.label || field.name;
  const busy = pending || loading;
  const omitted = relation?.kind === "o2m" ? [relation.throughField] : [];
  const leadField = recordChoiceColumns(
    target,
    catalog,
    result?.display.columns,
  ).find((column) => !omitted.includes(column.name))?.name;

  function stageCreate(record: RecordDraft, link?: RecordDraft) {
    const key = record.key ?? `draft:${crypto.randomUUID()}`;
    onDraftChange({
      ...draft,
      create: [
        ...(draft.create ?? []).filter((entry) => entry.key !== key),
        { key, record, link },
      ],
    });
  }

  function editNew(key?: string, record?: RecordDraft) {
    onEdit({
      collection: target.name,
      draft: record,
      omitFields: omitted,
      leadField,
      onDraft: (next) =>
        stageCreate(
          { ...next, key: key ?? next.key },
          draft.create?.find((entry) => entry.key === key)?.link,
        ),
    });
  }

  return (
    <section
      className="overflow-hidden rounded-xl border"
      aria-label={label}
      aria-busy={busy}
    >
      <RelationPanelHeader
        label={label}
        description={field.presentation?.description}
        expanded={expanded}
        contentId={contentId}
        onToggleExpanded={() => setExpanded(!expanded)}
        result={result}
        endpoint={endpoint}
        field={field}
        target={target}
        junction={junction}
        catalog={catalog}
        keys={keys}
        hasLinkForm={hasLinkForm}
        selected={state.selected}
        onSelectedChange={state.setSelected}
        draft={draft}
        onDraftChange={onDraftChange}
        onEdit={onEdit}
        onCreateClick={() => {
          if (hasLinkForm) {
            setCreating(true);
          } else {
            editNew();
          }
        }}
        portalContainer={portalContainer}
        pending={pending}
        busy={busy}
        error={error}
      />
      <div
        id={contentId}
        hidden={!expanded}
      >
        {(Number(result?.page.total) > (result?.page.size ?? 10) || query) && (
          <div className="border-t px-3 py-2">
            <Input
              type="search"
              value={query}
              maxLength={100}
              aria-label={copy("Поиск связанных записей {{value0}}", {
                value0: field.name,
              })}
              placeholder={copy("Найти связанную запись…")}
              onChange={(event) => state.setQuery(event.target.value)}
            />
          </div>
        )}
        {error && (
          <div
            role="alert"
            className="px-4 py-3 text-sm text-destructive"
          >
            {copy(error)}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={refresh}
            >
              {copy("Повторить")}
            </Button>
          </div>
        )}
        {loading ? (
          <p
            role="status"
            className="p-4 text-sm text-muted-foreground"
          >
            {copy("Загрузка…")}
          </p>
        ) : !result?.data.length ? (
          !error && (
            <p className="p-5 text-center text-sm text-muted-foreground">
              {query
                ? copy("Ничего не найдено")
                : copy("Связанных записей пока нет")}
            </p>
          )
        ) : (
          <RelationRows
            result={{
              ...result,
              data: result.data.filter(
                (row) => !draft.detach?.includes(row.linkId),
              ),
            }}
            target={target}
            catalog={catalog}
            pending={pending}
            portalContainer={portalContainer}
            onOpen={(row) =>
              onEdit({
                collection: target.name,
                id: row.id,
                title: row.label !== row.id ? row.label : undefined,
              })
            }
            onLink={
              junction && linkReadFields.length
                ? (row) =>
                    onEdit({
                      collection: junction.name,
                      id: row.linkId,
                      title: copy("Параметры связи · {{value0}}", {
                        value0: row.label,
                      }),
                      itemEndpoint: `${endpoint}/links/${encodeURIComponent(row.linkId)}`,
                      omitFields: keys,
                      draft: draft.links?.find(
                        (entry) => entry.id === row.linkId,
                      )?.record,
                      onDraft: (record) =>
                        onDraftChange({
                          ...draft,
                          links: [
                            ...(draft.links ?? []).filter(
                              (entry) => entry.id !== row.linkId,
                            ),
                            ...(draftChanges(record)
                              ? [{ id: row.linkId, record }]
                              : []),
                          ],
                        }),
                    })
                : undefined
            }
            onDetach={(row) =>
              onDraftChange({
                ...draft,
                detach: [...(draft.detach ?? []), row.linkId],
                links: draft.links?.filter((entry) => entry.id !== row.linkId),
                removedLabels: {
                  ...draft.removedLabels,
                  [row.linkId]: row.label,
                },
              })
            }
            onSort={state.toggleSort}
          />
        )}
        <RelationDraftRows
          draft={draft}
          busy={busy}
          onChange={onDraftChange}
          onEdit={editNew}
          junction={junction}
          omitFields={keys}
          endpoint={endpoint}
          onEditRecord={onEdit}
        />
        {result && Number(result.page.total) > result.page.size && (
          <RelationPanelPagination
            fieldName={field.name}
            page={page}
            size={result.page.size}
            total={result.page.total}
            busy={busy}
            onPageChange={state.setPage}
          />
        )}
      </div>
      {creating && junction && (
        <RelationCreateDialog
          target={target}
          junction={junction}
          omitFields={keys}
          catalog={catalog}
          leadField={leadField}
          onDraft={stageCreate}
          onClose={() => setCreating(false)}
        />
      )}
    </section>
  );
}
