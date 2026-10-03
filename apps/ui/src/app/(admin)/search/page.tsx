import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { coreAddress, requireSession } from "@/lib/session";
import { itemSearchHref, type SearchResults } from "@/lib/search";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const requested = (await searchParams).q;
  const q = typeof requested === "string" ? requested.trim() : "";
  const { token } = await requireSession(`/search?q=${encodeURIComponent(q)}`);
  let results: SearchResults = { collections: [], items: [] };
  let error = "";
  if (q) {
    try {
      const response = await fetch(
        coreAddress(`/search?q=${encodeURIComponent(q)}`),
        {
          headers: { authorization: `Bearer ${token}` },
          cache: "no-store",
          signal: AbortSignal.timeout(10000),
        },
      );
      if (!response.ok) error = "Не удалось выполнить поиск";
      else results = (await response.json()) as SearchResults;
    } catch {
      error = "Не удалось выполнить поиск";
    }
  }

  return (
    <div className="space-y-7">
      <PageHeader
        title="Поиск"
        description={
          q
            ? `Результаты по запросу «${q}»`
            : "Введите запрос в поле поиска в шапке."
        }
      />
      {error ? (
        <p role="alert">{error}</p>
      ) : (
        q && (
          <>
            <section className="space-y-3">
              <h2 className="font-semibold">Коллекции</h2>
              {results.collections.length ? (
                <div className="divide-y rounded-xl border bg-card">
                  {results.collections.map(({ name, displayName }) => (
                    <Link
                      key={name}
                      href={`/items/${encodeURIComponent(name)}`}
                      className="block px-4 py-3 font-mono text-sm hover:bg-muted"
                    >
                      {displayName || name}
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Совпадений нет</p>
              )}
            </section>
            <section className="space-y-3">
              <h2 className="font-semibold">Первые найденные записи</h2>
              {results.items.length ? (
                <div className="divide-y rounded-xl border bg-card">
                  {results.items.map((item) => (
                    <Link
                      key={`${item.collection}:${item.id}`}
                      href={itemSearchHref(item.collection, item.id)}
                      className="flex flex-wrap gap-x-3 px-4 py-3 text-sm hover:bg-muted"
                    >
                      <span className="font-mono text-muted-foreground">
                        {item.collection}
                      </span>
                      <span className="min-w-0 truncate">{item.label}</span>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Совпадений нет</p>
              )}
              {[...new Set(results.items.map((item) => item.collection))].map(
                (collection) => (
                  <Link
                    key={collection}
                    href={`/items/${encodeURIComponent(collection)}?q=${encodeURIComponent(q)}`}
                    className="mr-4 inline-block text-sm text-primary hover:underline"
                  >
                    Все совпадения в {collection}
                  </Link>
                ),
              )}
            </section>
          </>
        )
      )}
    </div>
  );
}
