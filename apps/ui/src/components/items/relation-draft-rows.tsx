"use client";

import { Settings2, Undo2 } from "lucide-react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import type { RecordDraft, RelationDraft } from "./record-draft-model";
import { useUiCopy } from "@/lib/ui-copy";

export function RelationDraftRows({
  draft,
  busy,
  onChange,
  onEdit,
  onEditAttributes,
}: {
  draft: RelationDraft;
  busy: boolean;
  onChange: (value: RelationDraft) => void;
  onEdit: (key: string, record: RecordDraft) => void;
  onEditAttributes?: (kind: "create" | "attach" | "link", id: string) => void;
}) {
  const copy = useUiCopy();

  const rows = [
    ...(draft.create ?? []).map((entry) => ({
      key: entry.key,
      label: entry.record.label ?? copy("Новая запись"),
      state: copy("Будет создана"),
      attributes: entry.link
        ? () => onEditAttributes?.("create", entry.key)
        : undefined,
      edit: () => onEdit(entry.key, entry.record),
      undo: () =>
        onChange({
          ...draft,
          create: draft.create?.filter((row) => row.key !== entry.key),
        }),
    })),
    ...(draft.attach ?? []).map((entry) => ({
      key: `attach:${entry.id}`,
      label: entry.label ?? entry.id,
      state: copy("Будет добавлена"),
      attributes: entry.record
        ? () => onEditAttributes?.("attach", entry.id)
        : undefined,
      edit: undefined,
      undo: () =>
        onChange({
          ...draft,
          attach: draft.attach?.filter((row) => row.id !== entry.id),
        }),
    })),
    ...(draft.detach ?? []).map((id) => ({
      key: `detach:${id}`,
      label: draft.removedLabels?.[id] ?? id,
      state: copy("Будет отвязана"),
      attributes: undefined,
      edit: undefined,
      undo: () =>
        onChange({
          ...draft,
          detach: draft.detach?.filter((key) => key !== id),
        }),
    })),
    ...(draft.links ?? []).map((entry) => ({
      key: `link:${entry.id}`,
      label: copy("Параметры связи {{value0}}", { value0: entry.id }),
      state: copy("Будут изменены"),
      attributes: () => onEditAttributes?.("link", entry.id),
      edit: undefined,
      undo: () =>
        onChange({
          ...draft,
          links: draft.links?.filter((row) => row.id !== entry.id),
        }),
    })),
  ];
  if (!rows.length) return null;
  return (
    <section
      aria-label={copy("Изменения связей в черновике")}
      className="space-y-1 border-t bg-muted/20 p-3"
    >
      <p className="mb-2 text-xs font-medium text-muted-foreground">
        {copy("В черновике · ")}
        {rows.length}
      </p>
      {rows.map((row) => (
        <div
          key={row.key}
          className="flex items-center gap-2 rounded-md border bg-card px-3 py-2"
        >
          <div className="min-w-0 flex-1">
            {row.edit ? (
              <Button
                type="button"
                variant="link"
                className="h-auto max-w-full truncate p-0 text-foreground"
                disabled={busy}
                onClick={row.edit}
              >
                {row.label}
              </Button>
            ) : (
              <p className="truncate text-sm">{row.label}</p>
            )}
            <p className="text-xs text-muted-foreground">{row.state}</p>
          </div>
          {row.attributes && onEditAttributes && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={busy}
              aria-label={copy("Параметры связи: {{value0}}", {
                value0: row.label,
              })}
              onClick={row.attributes}
            >
              <Settings2 />
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={busy}
            aria-label={copy("Отменить: {{value0}}", { value0: row.label })}
            onClick={row.undo}
          >
            <Undo2 />
          </Button>
        </div>
      ))}
    </section>
  );
}
