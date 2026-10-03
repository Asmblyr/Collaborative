"use client";

import { useEffect, useState } from "react";
import { History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@asmblyr/kit/ui/button";
import { displayValue } from "./item-display";
import type { Collection, ItemEvent } from "./types";

interface HistoryPage {
  data: ItemEvent[];
  nextCursor: string | null;
}

const actionLabels = { create: "Создана", update: "Изменена", delete: "Удалена" };

async function fetchHistory(
  collection: string, itemId?: string, before?: string, signal?: AbortSignal,
): Promise<HistoryPage> {
  const url = new URL(`/api/item-events/${encodeURIComponent(collection)}`, window.location.origin);
  if (itemId !== undefined) url.searchParams.set("item", itemId);
  if (before !== undefined) url.searchParams.set("before", before);
  const response = await fetch(url, { cache: "no-store", signal });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(body?.message ?? "Не удалось загрузить историю");
  }
  return response.json() as Promise<HistoryPage>;
}

function valueText(value: unknown, type?: string): string {
  if (value === undefined) return "—";
  if (value === null) return "Не задано";
  if (value === "") return "Пустая строка";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return displayValue(value, type ?? typeof value);
  }
  return JSON.stringify(value, null, 2);
}

function EventCard({ event, schema, showItemId }: { event: ItemEvent; schema?: Collection; showItemId: boolean }) {
  const fields = Object.keys(event.after ?? event.before ?? {});
  const actor = event.actor_id ? `${event.actor_kind === "service" ? "Сервис" : "Пользователь"}: ${event.actor_id}` : "Автор неизвестен";
  return (
    <article className="space-y-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={event.action === "delete" ? "destructive" : "secondary"}>
            {actionLabels[event.action]}
          </Badge>
          {showItemId && <span className="break-all font-mono text-xs">{event.item_id}</span>}
        </div>
        <time className="text-xs text-muted-foreground" dateTime={event.occurred_at}>
          {new Date(event.occurred_at).toLocaleString("ru-RU")}
        </time>
      </div>
      <p className="text-xs text-muted-foreground">{actor}</p>
      <div className="divide-y rounded-lg border">
        <div className="hidden px-3 py-2 text-xs font-medium text-muted-foreground sm:grid sm:grid-cols-[minmax(6rem,1fr)_2fr_2fr] sm:gap-3">
          <span>Поле</span><span>До</span><span>После</span>
        </div>
        {fields.map((field) => {
          const metadata = schema?.fields.find((entry) => entry.name === field);
          const type = metadata?.type ?? (["created_at", "updated_at"].includes(field) ? "datetime" : undefined);
          return (
          <div key={field} className="grid gap-1 px-3 py-2 text-xs sm:grid-cols-[minmax(6rem,1fr)_2fr_2fr] sm:gap-3">
            <span className="break-words font-medium">{metadata?.presentation?.label || field}</span>
            <span className="min-w-0 whitespace-pre-wrap break-words text-muted-foreground" title="До">
              <span className="mr-1 sm:hidden">До:</span>{valueText(event.before?.[field], type)}
            </span>
            <span className="min-w-0 whitespace-pre-wrap break-words" title="После">
              <span className="mr-1 sm:hidden">После:</span>{valueText(event.after?.[field], type)}
            </span>
          </div>
        ); })}
      </div>
    </article>
  );
}

export function ItemHistory({ collection, itemId, schema }: { collection: string; itemId?: string; schema?: Collection }) {
  const [events, setEvents] = useState<ItemEvent[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetchHistory(collection, itemId, undefined, controller.signal)
      .then((page) => {
        setEvents(page.data);
        setCursor(page.nextCursor);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Не удалось загрузить историю");
      })
      .finally(() => {
        if (!controller.signal.aborted) setPending(false);
      });
    return () => controller.abort();
  }, [collection, itemId]);

  async function loadMore() {
    if (!cursor || pending) return;
    setPending(true);
    setError("");
    try {
      const page = await fetchHistory(collection, itemId, cursor);
      setEvents((current) => [...current, ...page.data]);
      setCursor(page.nextCursor);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось загрузить историю");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      {events.length === 0 && !pending && !error && (
        <div className="rounded-xl border border-dashed px-5 py-10 text-center">
          <History className="mx-auto mb-3 size-6 text-muted-foreground" />
          <h3 className="text-sm font-medium">История пока пуста</h3>
          <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-muted-foreground">
            Здесь появятся изменения через Asmblyr: кто и когда изменил поля, значения до и после.
            Изменения напрямую в базе и история из других систем сюда не попадают.
          </p>
        </div>
      )}
      {events.map((event) => <EventCard key={event.id} event={event} schema={schema} showItemId={!itemId} />)}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {pending && <p role="status" className="text-sm text-muted-foreground">Загрузка…</p>}
      {cursor && <Button type="button" variant="outline" disabled={pending} onClick={loadMore}>
        Показать ещё
      </Button>}
    </div>
  );
}
