"use client";

import { Badge } from "@asmblyr-collaborative/kit/ui/badge";
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
      ) : (
        q && (
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
                <p className="text-sm text-muted-foreground">
                  {copy("Совпадений нет")}
                </p>
              )}
            </section>
            <section className="space-y-3">
              <h2 className="font-semibold">
                {copy("Первые найденные записи")}
              </h2>
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
                <p className="text-sm text-muted-foreground">
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
        )
      )}
    </div>
  );
}
