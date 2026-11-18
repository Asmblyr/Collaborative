import { SearchWorkspace } from "@/components/search/search-workspace";
import { loadCollections } from "@/lib/collections";
import { coreAddress, requireSession } from "@/lib/session";
import { searchReturnHref, type SearchResults } from "@/lib/search";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const rawParams = await searchParams;
  const q = typeof rawParams.q === "string" ? rawParams.q.trim() : "";
  const { token } = await requireSession(searchReturnHref(rawParams));
  const catalogPromise = loadCollections(token);

  let results: SearchResults = { collections: [], items: [] };
  let failed = false;
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
      if (!response.ok) {
        failed = true;
      } else {
        results = (await response.json()) as SearchResults;
      }
    } catch {
      failed = true;
    }
  }

  const catalog = await catalogPromise;

  return (
    <SearchWorkspace
      q={q}
      results={results}
      catalog={catalog.data}
      failed={failed}
    />
  );
}
