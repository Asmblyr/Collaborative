"use client";

import { useEffect, useState } from "react";
import { Button } from "@asmblyr/kit/ui/button";
import { RelationPanel } from "./relation-panel";
import type { Collection } from "./types";
import type { RecordEditorRequest } from "./record-editor-types";
import type { RecordDraft } from "./record-draft-model";

interface RelatedGroup {
  sourceCollection: string;
  sourceField: string;
  aliasName?: string;
  items: { id: string; label: string }[];
  hasMore: boolean;
}

export function ItemRelations({ collection, catalog, itemId, portalContainer, onEdit, draft, onDraftChange, busy }: {
  collection: Collection; catalog: Collection[]; itemId: string;
  portalContainer: HTMLElement | null; onEdit: (request: RecordEditorRequest) => void;
  draft: RecordDraft; onDraftChange: (draft: RecordDraft) => void; busy: boolean;
}) {
  const [groups, setGroups] = useState<RelatedGroup[]>([]);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/items/${encodeURIComponent(collection.name)}/${encodeURIComponent(itemId)}/related`, {
      signal: controller.signal, cache: "no-store",
    }).then(async (response) => {
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { message?: string } | null;
        throw new Error(body?.message ?? "Не удалось загрузить связанные записи");
      }
      return response.json() as Promise<{ data: RelatedGroup[] }>;
    }).then((result) => setGroups(result.data.filter((group) => !group.aliasName)))
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : "Не удалось загрузить связанные записи");
        }
      }).finally(() => {
        if (!controller.signal.aborted) setPending(false);
      });
    return () => controller.abort();
  }, [collection.name, itemId, revision]);

  const aliases = collection.fields.filter((field) => field.type === "alias" &&
    (collection.access.read?.includes("*") || collection.access.read?.includes(field.name))).flatMap((field) => {
      const target = catalog.find((entry) => entry.name === field.relation?.collection);
      if (!target?.access.read) return [];
      if (field.relation?.kind === "o2m" && !target.access.read.includes("*") &&
        !target.access.read.includes(field.relation.throughField)) return [];
      return [{ field, target }];
    }).sort((a, b) => (a.field.presentation?.order ?? 0) - (b.field.presentation?.order ?? 0));

  const visibleGroups = groups.filter((group) => group.items.length > 0);
  if (!pending && !error && !aliases.length && !visibleGroups.length) return null;

  return <div className="space-y-4">
    {(aliases.length > 0 || visibleGroups.length > 0) && <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h3 className="text-sm font-semibold">Связанные записи</h3>
      {aliases.length > 0 && <p className="text-xs text-muted-foreground">Связи сохранятся вместе с карточкой</p>}
    </div>}
    {aliases.map(({ field, target }) => <RelationPanel key={field.name} collection={collection.name} itemId={itemId}
      field={field} target={target} catalog={catalog} portalContainer={portalContainer} onEdit={onEdit} busy={busy}
      draft={draft.relations?.[field.name] ?? {}} onDraftChange={(changes) => onDraftChange({ ...draft,
        relations: { ...draft.relations, [field.name]: changes } })} />)}
    {pending && <p role="status" className="text-sm text-muted-foreground">Загрузка связанных записей…</p>}
    {error && <div role="alert" className="text-sm text-destructive">{error}
      <Button type="button" variant="ghost" size="sm" onClick={() => { setError(""); setPending(true); setRevision((value) => value + 1); }}>Повторить</Button>
    </div>}
    {visibleGroups.length > 0 && <h3 className="text-sm font-medium">Где используется эта запись</h3>}
    {visibleGroups.map((group) => <section key={`${group.sourceCollection}:${group.sourceField}`}
      className="space-y-3 rounded-xl border p-4">
      <h3 className="font-mono text-sm font-medium">{group.aliasName ??
        `${group.sourceCollection} · ${group.sourceField}`}</h3>
      <ul className="divide-y text-sm">
          {group.items.map((item) => <li key={item.id} className="py-2">
            <Button type="button" variant="ghost" className="h-auto max-w-full justify-start px-0 text-left font-normal"
              onClick={() => onEdit({ collection: group.sourceCollection, id: item.id })}>
              {item.label}
            </Button>
          </li>)}
      </ul>
      {group.hasMore && <p className="text-xs text-muted-foreground">Показаны первые 20 записей.</p>}
    </section>)}
  </div>;
}
