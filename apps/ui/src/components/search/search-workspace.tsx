"use client";

import { Search, SearchX } from "lucide-react";
import { Badge } from "@asmblyr-collaborative/kit/ui/badge";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { WorkspaceLink as Link } from "@/components/workspaces/workspace-link";
import { useLocalizedCatalog } from "@/components/items/use-localized-catalog";
import type { Collection } from "@/components/items/types";
import { PageHeader } from "@/components/layout/page-header";
import { itemSearchHref, type SearchResults } from "@/lib/search";
import { useUiCopy } from "@/lib/ui-copy";

export function SearchWorkspace({
  q,
  results,
  catalog: sourceCatalog,
  failed,
}: {
  q: string;
  results: SearchResults;
  catalog: Collection[];
  failed: boolean;
}) {
  const copy = useUiCopy();
  const catalog = useLocalizedCatalog(sourceCatalog);
  const labelsByCollection = new Map(
    catalog.map((entry) => [entry.name, entry.displayName || entry.name]),
  );

  function collectionTitle(name: string, fallback?: string | null): string {
    return labelsByCollection.get(name) ?? fallback ?? name;
  }

  const matchedCollections = [
    ...new Set(results.items.map((item) => item.collection)),
  ];
  const hasAnyMatches =
    results.collections.length > 0 || results.items.length > 0;

  return (
    <div className="space-y-7">
      <PageHeader
        title={copy("Поиск")}
        description={
          q
            ? copy("Результаты по запросу «{{value0}}»", { value0: q })
            : copy("Введите запрос в поле поиска в шапке.")
        }
      />
      {failed ? (
        <p
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
        >
          {copy("Не удалось выполнить поиск")}
        </p>
      ) : !q ? (
        <div className="flex min-h-72 flex-col items-center justify-center rounded-xl border bg-card px-6 py-12 text-center">
          <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-muted">
            <Search
              aria-hidden="true"
              className="size-6 text-muted-foreground"
            />
          </div>
          <h2 className="text-base font-medium">{copy("Поиск везде")}</h2>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
            {copy("Введите запрос в поле поиска в шапке.")}
          </p>
        </div>
      ) : !hasAnyMatches ? (
        <div className="flex min-h-72 flex-col items-center justify-center rounded-xl border bg-card px-6 py-12 text-center">
          <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-muted">
            <SearchX
              aria-hidden="true"
              className="size-6 text-muted-foreground"
            />
          </div>
          <h2 className="text-base font-medium">{copy("Ничего не найдено")}</h2>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
            {copy("Попробуйте другой запрос или сбросьте условия отбора.")}
          </p>
          <div className="mt-5">
            <Button
              asChild
              variant="outline"
            >
              <Link href="/search">{copy("Сбросить поиск")}</Link>
            </Button>
          </div>
        </div>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="font-semibold">{copy("Коллекции")}</h2>
            {results.collections.length ? (
              <div className="divide-y rounded-xl border bg-card">
                {results.collections.map(({ name, displayName }) => (
                  <Link
                    key={name}
                    href={`/items/${encodeURIComponent(name)}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 text-sm font-medium transition-colors hover:bg-muted/60"
                  >
                    <span className="truncate">
                      {collectionTitle(name, displayName)}
                    </span>
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">
                      {name}
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground">
                {copy("Совпадений нет")}
              </p>
            )}
          </section>
          <section className="space-y-3">
            <h2 className="font-semibold">{copy("Первые найденные записи")}</h2>
            {results.items.length ? (
              <div className="divide-y rounded-xl border bg-card">
                {results.items.map((item) => (
                  <Link
                    key={`${item.collection}:${item.id}`}
                    href={itemSearchHref(item.collection, item.id)}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm transition-colors hover:bg-muted/60"
                  >
                    <Badge
                      variant="secondary"
                      className="shrink-0 font-normal"
                    >
                      {collectionTitle(item.collection)}
                    </Badge>
                    <span className="min-w-0 truncate font-medium">
                      {item.label}
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground">
                {copy("Совпадений нет")}
              </p>
            )}
            {matchedCollections.length > 0 && (
              <div className="flex flex-wrap gap-x-4 gap-y-2 pt-1">
                {matchedCollections.map((collection) => (
                  <Link
                    key={collection}
                    href={`/items/${encodeURIComponent(collection)}?q=${encodeURIComponent(q)}`}
                    className="text-sm text-primary hover:underline"
                  >
                    {copy("Все совпадения в")} {collectionTitle(collection)}
                  </Link>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
