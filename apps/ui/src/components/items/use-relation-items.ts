import { useEffect, useMemo, useState } from "react";
import { itemLabel, templateLabel } from "./item-label";
import type { Item, ItemList } from "./types";
import { useDraftPreviews } from "./record-draft-context";

interface Option {
  id: string;
  label: string;
  item: Item;
}
interface Result {
  request: string;
  options: Option[];
  total: number;
  error: string;
}

async function readItems(
  collection: string,
  params: URLSearchParams,
  signal: AbortSignal,
  endpoint?: string,
): Promise<ItemList> {
  const response = await fetch(
    `${endpoint ?? `/api/items/${encodeURIComponent(collection)}`}?${params}`,
    { signal },
  );
  if (!response.ok)
    throw new Error(
      response.status === 403
        ? "Нет доступа к записям этой коллекции"
        : "Не удалось загрузить записи",
    );
  return response.json() as Promise<ItemList>;
}

function optionFor(
  item: Item,
  key: string,
  labelField?: string,
  template?: string | null,
  resolved?: Record<string, string>,
): Option {
  const id = String(item[key]);
  const value = labelField ? item[labelField] : undefined;
  return {
    id,
    label:
      resolved?.[id] ?? templateLabel(template, item) ?? itemLabel(value, id),
    item,
  };
}

export function useRelationItems(
  collection: string,
  key: string,
  labelField: string | undefined,
  selected: string[],
  open: boolean,
  template?: string | null,
  candidatesEndpoint?: string,
  canonicalLabels = true,
) {
  const previews = useDraftPreviews();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const scopeKey = JSON.stringify([
    collection,
    key,
    labelField,
    template,
    canonicalLabels,
  ]);
  const [labelCache, setLabelCache] = useState(() => ({
    scope: scopeKey,
    labels: new Map<string, string>(),
  }));
  const labels = new Map(
    labelCache.scope === scopeKey ? labelCache.labels : [],
  );
  for (const id of selected) {
    const preview = previews.get(JSON.stringify([collection, id]));
    if (preview) labels.set(id, preview.label);
  }
  const [labelError, setLabelError] = useState("");
  const request = JSON.stringify([
    collection,
    key,
    labelField,
    template,
    query,
    page,
    revision,
    candidatesEndpoint,
  ]);
  const selectedIds = JSON.stringify(selected);
  const [selectedRecords, setSelectedRecords] = useState<{
    scope: string;
    items: Item[];
  } | null>(null);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = window.setTimeout(
      async () => {
        try {
          const params = new URLSearchParams({
            limit: "25",
            page: String(page),
            sort: key,
            direction: "asc",
          });
          if (query.trim()) params.set("q", query.trim());
          const data = await readItems(
            collection,
            params,
            controller.signal,
            candidatesEndpoint,
          );
          if (controller.signal.aborted) return;
          const lastPage = Math.max(1, Math.ceil(Number(data.page.total) / 25));
          if (page > lastPage) {
            setPage(lastPage);
            return;
          }
          const options = data.data.map((item) =>
            optionFor(
              item,
              key,
              labelField,
              template,
              canonicalLabels ? data.labels : undefined,
            ),
          );
          setResult({
            request,
            options,
            total: Number(data.page.total),
            error: "",
          });
          setLabelCache((current) => ({
            scope: scopeKey,
            labels: new Map([
              ...(current.scope === scopeKey ? current.labels : []),
              ...options.map(({ id, label }) => [id, label] as const),
            ]),
          }));
        } catch (error) {
          if (!controller.signal.aborted)
            setResult({
              request,
              options: [],
              total: 0,
              error:
                error instanceof Error
                  ? error.message
                  : "Не удалось загрузить записи",
            });
        }
      },
      query ? 250 : 0,
    );
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [
    collection,
    key,
    labelField,
    template,
    open,
    page,
    query,
    request,
    scopeKey,
    candidatesEndpoint,
    canonicalLabels,
  ]);

  useEffect(() => {
    const ids = (JSON.parse(selectedIds) as string[]).filter(
      (id) => !id.startsWith("draft:"),
    );
    if (!ids.length) return;
    const controller = new AbortController();
    const chunks = Array.from(
      { length: Math.ceil(ids.length / 20) },
      (_, index) => ids.slice(index * 20, index * 20 + 20),
    );
    Promise.all(
      chunks.map((values) =>
        readItems(
          collection,
          new URLSearchParams({
            limit: "20",
            filter: JSON.stringify({
              logic: "and",
              children: [{ field: key, op: "in", value: values }],
            }),
          }),
          controller.signal,
        ),
      ),
    )
      .then((batches) => {
        if (controller.signal.aborted) return;
        const options = batches.flatMap((data) =>
          data.data.map((item) =>
            optionFor(
              item,
              key,
              labelField,
              template,
              canonicalLabels ? data.labels : undefined,
            ),
          ),
        );
        setSelectedRecords({
          scope: scopeKey,
          items: options.map((option) => option.item),
        });
        setLabelCache((current) => ({
          scope: scopeKey,
          labels: new Map([
            ...(current.scope === scopeKey ? current.labels : []),
            ...ids.map((id) => [id, id] as const),
            ...options.map(({ id, label }) => [id, label] as const),
          ]),
        }));
        setLabelError("");
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setLabelError(
          "Не удалось получить названия выбранных записей. Показаны их ID.",
        );
        setSelectedRecords(null);
        setLabelCache((current) => ({
          scope: scopeKey,
          labels: new Map([
            ...(current.scope === scopeKey ? current.labels : []),
            ...ids.map((id) => [id, id] as const),
          ]),
        }));
      });
    return () => controller.abort();
  }, [
    collection,
    key,
    labelField,
    template,
    selectedIds,
    open,
    revision,
    scopeKey,
    canonicalLabels,
  ]);

  const current = result?.request === request ? result : null;
  // Only the current page and selected records need related labels, not the whole collection.
  const records = useMemo(() => {
    const ids = new Set(JSON.parse(selectedIds) as string[]);
    const saved =
      selectedRecords?.scope === scopeKey
        ? selectedRecords.items.filter((item) => ids.has(String(item[key])))
        : [];
    const local = [...ids].flatMap<Item>((id) => {
      const preview = previews.get(JSON.stringify([collection, id]));
      return preview ? [preview.item] : [];
    });
    return [
      ...new Map(
        [
          ...saved,
          ...(current?.options.map((option) => option.item) ?? []),
          ...local,
        ].map((item) => [String(item[key]), item]),
      ).values(),
    ];
  }, [
    current,
    key,
    scopeKey,
    selectedIds,
    selectedRecords,
    previews,
    collection,
  ]);
  return {
    query,
    page,
    labels,
    labelError,
    records,
    options: current?.options ?? [],
    total: current?.total ?? 0,
    error: current?.error ?? "",
    loading: open && !current,
    setQuery: (value: string) => {
      setQuery(value);
      setPage(1);
    },
    setPage,
    retry: () => setRevision((value) => value + 1),
  };
}
