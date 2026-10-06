import { useEffect, useState } from "react";
import type { Item, RelationPresentation } from "./types";

export interface RelationRow {
  id: string;
  linkId: string;
  label: string;
  values: Item;
}
export interface RelationResult {
  data: RelationRow[];
  page: {
    number: number;
    size: number;
    total: string;
    sort: string;
    direction: "asc" | "desc";
    order?: "field" | "relevance";
  };
  abilities: { attach: boolean; detach: boolean; create: boolean };
  display: RelationPresentation;
}

export function useRelationPanel(endpoint: string, settings: string) {
  const [result, setResult] = useState<RelationResult | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<{
    sort: string;
    direction: "asc" | "desc";
  }>();
  const [revision, setRevision] = useState(0);
  const [loaded, setLoaded] = useState("");
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const request = JSON.stringify([
    endpoint,
    query,
    page,
    sort,
    revision,
    settings,
  ]);
  const refresh = () => {
    setRevision((value) => value + 1);
  };
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(
      () => {
        const params = new URLSearchParams({
          page: String(page),
          q: query.trim(),
          ...sort,
        });
        fetch(`${endpoint}?${params}`, { signal: controller.signal })
          .then(async (response) => {
            const body = (await response.json()) as RelationResult & {
              message?: string;
            };
            if (!response.ok)
              throw new Error(body.message ?? "Не удалось загрузить связи");
            if (controller.signal.aborted) return;
            const lastPage = Math.max(
              1,
              Math.ceil(Number(body.page.total) / body.page.size),
            );
            if (page > lastPage) {
              setPage(lastPage);
              return;
            }
            setResult(body);
            setError("");
            setLoaded(request);
          })
          .catch((cause: unknown) => {
            if (!controller.signal.aborted) {
              setResult(null);
              setError(
                cause instanceof Error ? cause.message : "Ошибка соединения",
              );
              setLoaded(request);
            }
          });
      },
      query ? 250 : 0,
    );
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [endpoint, page, query, request, sort]);

  return {
    result,
    query,
    page,
    loading: loaded !== request,
    error,
    selected,
    setSelected,
    setPage,
    refresh,
    setQuery: (value: string) => {
      setQuery(value);
      setPage(1);
    },
    toggleSort: (name: string) => {
      setSort({
        sort: name,
        direction:
          result?.page.order !== "relevance" &&
          result?.page.sort === name &&
          result.page.direction === "asc"
            ? "desc"
            : "asc",
      });
      setPage(1);
    },
  };
}
