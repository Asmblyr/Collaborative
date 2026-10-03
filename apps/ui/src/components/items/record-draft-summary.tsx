"use client";

import { Undo2 } from "lucide-react";
import { Button } from "@asmblyr/kit/ui/button";
import { draftChanges, type RecordDraft } from "./record-draft-model";
import type { RecordEditorRequest } from "./record-editor-types";

export function RecordDraftSummary({
  draft,
  busy,
  onChange,
  onEdit,
}: {
  draft: RecordDraft;
  busy: boolean;
  onChange: (value: RecordDraft) => void;
  onEdit: (request: RecordEditorRequest) => void;
}) {
  const records = draft.records?.filter(
    (entry) => draftChanges(entry.record) > 0,
  );
  if (!records?.length) {
    return null;
  }
  return (
    <section
      aria-label="Изменённые связанные записи"
      className="space-y-2 rounded-xl border bg-muted/20 p-4"
    >
      <p className="text-sm font-medium">Изменённые связанные записи</p>
      <p className="text-xs text-muted-foreground">
        Сохранятся вместе с этой карточкой.
      </p>
      {records.map(({ collection, record }) => (
        <div
          key={`${collection}:${record.id}`}
          className="flex items-center gap-2"
        >
          <Button
            type="button"
            variant="link"
            disabled={busy}
            className="h-auto min-w-0 flex-1 justify-start truncate px-0 text-foreground"
            onClick={() => onEdit({ collection, id: record.id })}
          >
            {record.label ?? record.id}
          </Button>
          <span className="text-xs text-muted-foreground">{collection}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={busy}
            aria-label={`Отменить изменения: ${record.label ?? record.id}`}
            onClick={() =>
              onChange({
                ...draft,
                records: draft.records?.filter(
                  (entry) =>
                    entry.collection !== collection ||
                    entry.record.id !== record.id,
                ),
              })
            }
          >
            <Undo2 />
          </Button>
        </div>
      ))}
    </section>
  );
}
