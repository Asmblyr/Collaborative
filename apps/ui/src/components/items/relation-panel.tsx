"use client";

import { useId, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Link2,
  Plus,
} from "lucide-react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { Input } from "@asmblyr-collaborative/kit/ui/input";
import { RecordChooser } from "./record-chooser";
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
      <div className="flex flex-wrap items-center justify-between gap-3 bg-muted/30 px-4 py-3">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-ml-2 h-auto py-1"
              aria-expanded={expanded}
              aria-controls={contentId}
              onClick={() => setExpanded(!expanded)}
            >
              <ChevronDown
                className={`size-4 text-muted-foreground ${expanded ? "" : "-rotate-90"}`}
              />
              {label}
              {result && (
                <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-normal tabular-nums text-muted-foreground">
                  {result.page.total}
                </span>
              )}
            </Button>
          </h4>
          {field.presentation?.description && (
            <p className="mt-1 text-xs text-muted-foreground">
              {field.presentation.description}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {result?.abilities.attach && result.display.allowSelect && (
            <RecordChooser
              collection={target}
              catalog={catalog}
              title={label}
              previewColumns={result.display.columns}
              excludedIds={draft.attach?.map((entry) => entry.id)}
              candidatesEndpoint={`${endpoint}/candidates`}
              description={
                relation?.kind === "o2m"
                  ? copy(
                      "Показаны только непривязанные записи. Занятые записи нужно сначала отвязать в прежней карточке.",
                    )
                  : copy("Записи, уже добавленные в эту карточку, скрыты.")
              }
              emptyMessage={
                relation?.kind === "o2m"
                  ? copy(
                      "Нет свободных записей. Создайте новую или сначала отвяжите существующую в другой карточке.",
                    )
                  : copy("Нет доступных записей для добавления.")
              }
              labelField={
                field.presentation?.relation?.labelField
                  ? (result.display.labelField ?? undefined)
                  : undefined
              }
              selected={state.selected}
              onChange={state.setSelected}
              onChoose={
                hasLinkForm && junction
                  ? (choice) => {
                      onEdit({
                        collection: junction.name,
                        title: copy("Параметры новой связи"),
                        description: copy(
                          "Заполните параметры, чтобы связать выбранную запись с текущей.",
                        ),
                        omitFields: keys,
                        onDraft: (record) =>
                          onDraftChange({
                            ...draft,
                            attach: [
                              ...(draft.attach ?? []),
                              {
                                id: choice.id,
                                label: choice.label,
                                preview: choice.item,
                                record,
                              },
                            ],
                          }),
                      });
                    }
                  : undefined
              }
              multiple={!hasLinkForm}
              portalContainer={portalContainer}
              trigger={
                <>
                  <Link2 className="size-4" />
                  {copy("Добавить существующую ")}
                </>
              }
              pending={pending}
              disabled={busy}
              actionError={copy(error)}
              onApply={
                hasLinkForm
                  ? undefined
                  : async (choices) => {
                      onDraftChange({
                        ...draft,
                        attach: [
                          ...(draft.attach ?? []),
                          ...choices
                            .filter(
                              (choice) =>
                                !draft.attach?.some(
                                  (entry) => entry.id === choice.id,
                                ),
                            )
                            .map((choice) => ({
                              id: choice.id,
                              label: choice.label,
                              preview: choice.item,
                            })),
                        ],
                      });
                      state.setSelected([]);
                      return true;
                    }
              }
            />
          )}
          {result?.abilities.create && result.display.allowCreate && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => (hasLinkForm ? setCreating(true) : editNew())}
            >
              <Plus />
              {copy("Создать ")}
            </Button>
          )}
        </div>
      </div>
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
              {copy("Повторить ")}
            </Button>
          </div>
        )}
        {loading ? (
          <p
            role="status"
            className="p-4 text-sm text-muted-foreground"
          >
            {copy("Загрузка… ")}
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
          onEditAttributes={
            junction
              ? (kind, id) => {
                  const staged =
                    kind === "create"
                      ? draft.create?.find((entry) => entry.key === id)?.link
                      : kind === "attach"
                        ? draft.attach?.find((entry) => entry.id === id)?.record
                        : draft.links?.find((entry) => entry.id === id)?.record;
                  if (!staged) return;
                  onEdit({
                    collection: junction.name,
                    id: kind === "link" ? id : undefined,
                    draft: staged,
                    omitFields: keys,
                    title: copy("Параметры связи"),
                    itemEndpoint:
                      kind === "link"
                        ? `${endpoint}/links/${encodeURIComponent(id)}`
                        : undefined,
                    onDraft: (record) =>
                      onDraftChange(
                        kind === "create"
                          ? {
                              ...draft,
                              create: draft.create?.map((entry) =>
                                entry.key === id
                                  ? { ...entry, link: record }
                                  : entry,
                              ),
                            }
                          : kind === "attach"
                            ? {
                                ...draft,
                                attach: draft.attach?.map((entry) =>
                                  entry.id === id
                                    ? { ...entry, record }
                                    : entry,
                                ),
                              }
                            : {
                                ...draft,
                                links: draft.links?.flatMap((entry) =>
                                  entry.id === id
                                    ? draftChanges(record)
                                      ? [{ ...entry, record }]
                                      : []
                                    : [entry],
                                ),
                              },
                      ),
                  });
                }
              : undefined
          }
        />
        {result && Number(result.page.total) > result.page.size && (
          <div className="flex items-center justify-between gap-2 border-t px-3 py-2">
            <span className="text-xs text-muted-foreground">
              {copy("Всего: ")}
              {result.page.total}
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={copy("Предыдущая страница {{value0}}", {
                  value0: field.name,
                })}
                disabled={busy || page === 1}
                onClick={() => state.setPage(page - 1)}
              >
                <ChevronLeft />
              </Button>
              <span className="text-xs tabular-nums">
                {page} /{" "}
                {Math.max(
                  1,
                  Math.ceil(Number(result.page.total) / result.page.size),
                )}
              </span>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={copy("Следующая страница {{value0}}", {
                  value0: field.name,
                })}
                disabled={
                  busy || page * result.page.size >= Number(result.page.total)
                }
                onClick={() => state.setPage(page + 1)}
              >
                <ChevronRight />
              </Button>
            </div>
          </div>
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
