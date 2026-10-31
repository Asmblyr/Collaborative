"use client";

import { ChevronDown, Link2, Plus } from "lucide-react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { RecordChooser } from "./record-chooser";
import type { RelationDraft } from "./record-draft-model";
import type { RecordEditorRequest } from "./record-editor-types";
import type { RelationResult } from "./use-relation-panel";
import type { Collection, CollectionField } from "./types";
import { useUiCopy } from "@/lib/ui-copy";

export function RelationPanelHeader({
  label,
  description,
  expanded,
  contentId,
  onToggleExpanded,
  result,
  endpoint,
  field,
  target,
  junction,
  catalog,
  keys,
  hasLinkForm,
  selected,
  onSelectedChange,
  draft,
  onDraftChange,
  onEdit,
  onCreateClick,
  portalContainer,
  pending,
  busy,
  error,
}: {
  label: string;
  description?: string;
  expanded: boolean;
  contentId: string;
  onToggleExpanded: () => void;
  result: RelationResult | null;
  endpoint: string;
  field: CollectionField;
  target: Collection;
  junction?: Collection;
  catalog: Collection[];
  keys: string[];
  hasLinkForm: boolean;
  selected: string[];
  onSelectedChange: (ids: string[]) => void;
  draft: RelationDraft;
  onDraftChange: (draft: RelationDraft) => void;
  onEdit: (request: RecordEditorRequest) => void;
  onCreateClick: () => void;
  portalContainer: HTMLElement | null;
  pending: boolean;
  busy: boolean;
  error: string;
}) {
  const copy = useUiCopy();
  const relation = field.relation;

  return (
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
            onClick={onToggleExpanded}
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
        {description && (
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
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
            selected={selected}
            onChange={onSelectedChange}
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
                {copy("Добавить существующую")}
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
                    onSelectedChange([]);
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
            onClick={onCreateClick}
          >
            <Plus />
            {copy("Создать")}
          </Button>
        )}
      </div>
    </div>
  );
}
