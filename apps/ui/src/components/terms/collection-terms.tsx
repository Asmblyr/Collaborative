"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import type { TermDefinition } from "@asmblyr/contracts";
import { Button } from "@asmblyr/kit/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@asmblyr/kit/ui/select";
import { PortalContainerContext } from "@asmblyr/kit/ui/portal-container";
import { useEditorState } from "@/components/collections/editor-lifecycle";
import { filterScopes, type FilterGroup } from "@/components/items/item-filter-options";
import { normalizeFilter } from "@/components/items/item-filter-model";
import type { Collection } from "@/components/items/types";
import { TermFilterEditor } from "./term-filter-editor";

interface Binding {
  termId: string;
  filter: FilterGroup;
  valid?: boolean;
}
interface Snapshot {
  terms: TermDefinition[];
  bindings: Binding[];
}

export function CollectionTerms({
  collection,
  catalog,
  container,
  disabled,
  onStateChange,
}: {
  collection: Collection;
  catalog: Collection[];
  container: HTMLElement | null;
  disabled: boolean;
  onStateChange: (dirty: boolean, busy: boolean) => void;
}) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [bindings, setBindings] = useState<Binding[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [retry, setRetry] = useState(0);
  const dirty = snapshot !== null && JSON.stringify(bindings) !== JSON.stringify(snapshot.bindings);
  useEditorState(dirty, busy);
  useEffect(() => onStateChange(dirty, busy), [dirty, busy, onStateChange]);
  const path = `/api/collections/${encodeURIComponent(collection.name)}/terms`;
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(path, { signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(body.message ?? "Не удалось загрузить термины");
        setSnapshot(body.data);
        setBindings(body.data.bindings);
        setError("");
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : "Ошибка соединения");
      }
    }
    void load();
    return () => controller.abort();
  }, [path, retry]);
  const scopes = filterScopes(collection, catalog);
  async function save() {
    if (!snapshot || disabled || busy) return;
    setError("");
    setNotice("");
    try {
      const next = bindings.map((binding) => {
        const filter = normalizeFilter(binding.filter, scopes);
        if (!filter.children.length)
          throw new Error("Добавьте условие для каждого термина или уберите его из коллекции.");
        return { termId: binding.termId, filter, valid: true };
      });
      setBusy(true);
      const response = await fetch(path, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bindings: next.map(({ termId, filter }) => ({ termId, filter })) }),
      });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.message ?? "Не удалось сохранить условия");
      }
      setSnapshot({ ...snapshot, bindings: next });
      setBindings(next);
      setNotice("Условия сохранены");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Ошибка соединения");
    } finally {
      setBusy(false);
    }
  }
  function change(next: Binding[]) {
    if (disabled || busy) return;
    setBindings(next);
    setNotice("");
    setError("");
  }
  const unused =
    snapshot?.terms.filter(
      (term) => term.enabled && !bindings.some((binding) => binding.termId === term.id),
    ) ?? [];
  return (
    <PortalContainerContext.Provider value={container}>
      <section
        className="space-y-4 border-t pt-6"
        aria-labelledby="collection-terms-title"
        inert={disabled}
      >
        <div className="space-y-2">
          <h3 id="collection-terms-title" className="text-base font-medium">
            Термины этой коллекции
          </h3>
          <p className="text-sm leading-6 text-muted-foreground">
            Задайте, какие записи означают «активные» и другие понятия. Ассистент будет применять
            эти условия при поиске и подсчёте.
          </p>
          <Link href="/system-settings/terms" className="text-xs underline underline-offset-4">
            Открыть общий справочник
          </Link>
        </div>
        {!snapshot && !error && (
          <p role="status" className="text-sm text-muted-foreground">
            Загрузка терминов…
          </p>
        )}
        <fieldset disabled={busy} className="space-y-4" inert={busy}>
          {bindings.map((binding, index) => {
            const term = snapshot?.terms.find((entry) => entry.id === binding.termId);
            return (
              <div key={binding.termId} className="rounded-xl border bg-card">
                <div className="flex items-start gap-3 border-b p-4">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <p className="text-sm font-medium">{term?.name ?? "Недоступный термин"}</p>
                    <p className="text-xs leading-5 text-muted-foreground">{term?.description}</p>
                    {term && !term.enabled && (
                      <Badge variant="outline">Выключен в справочнике</Badge>
                    )}
                    {binding.valid === false && (
                      <p className="text-xs text-destructive">
                        Структура изменилась. Исправьте или удалите условие.
                      </p>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Убрать термин ${term?.name ?? ""}`}
                    onClick={() => change(bindings.filter((_, position) => position !== index))}
                  >
                    <X />
                  </Button>
                </div>
                <div className="p-3">
                  <TermFilterEditor
                    value={binding.filter}
                    scopes={scopes}
                    onChange={(filter) =>
                      change(
                        bindings.map((entry, position) =>
                          position === index ? { ...entry, filter } : entry,
                        ),
                      )
                    }
                  />
                </div>
              </div>
            );
          })}
          {snapshot && !bindings.length && (
            <p className="rounded-xl border border-dashed p-5 text-sm leading-6 text-muted-foreground">
              Пока нет настроенных терминов. Добавьте понятие из справочника и выберите условие.
            </p>
          )}
          {unused.length > 0 && (
            <Select
              value=""
              disabled={bindings.length >= 20}
              onValueChange={(termId) =>
                change([...bindings, { termId, filter: { logic: "and", children: [] } }])
              }
            >
              <SelectTrigger className="w-full" aria-label="Добавить термин в коллекцию">
                <SelectValue placeholder="Добавить термин из справочника…" />
              </SelectTrigger>
              <SelectContent>
                {unused.map((term) => (
                  <SelectItem key={term.id} value={term.id}>
                    {term.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </fieldset>
        {error && (
          <div role="alert" className="text-sm text-destructive">
            {error}
            {!snapshot && (
              <Button type="button" variant="ghost" onClick={() => setRetry(retry + 1)}>
                Повторить
              </Button>
            )}
          </div>
        )}
        {snapshot && (
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" disabled={busy || !dirty} onClick={() => void save()}>
              {busy ? "Сохранение…" : "Сохранить условия терминов"}
            </Button>
            {dirty && (
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => change(snapshot.bindings)}
              >
                Отменить изменения
              </Button>
            )}
            {notice && (
              <span role="status" className="text-xs text-muted-foreground">
                {notice}
              </span>
            )}
          </div>
        )}
      </section>
    </PortalContainerContext.Provider>
  );
}
