"use client";
import { useEffect, useState } from "react";
import type {
  SystemCollection,
  SystemRecordPage,
} from "@asmblyr-collaborative/contracts";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { Input } from "@asmblyr-collaborative/kit/ui/input";
import type { Collection } from "@/components/items/types";
import { apiRequest } from "@/lib/api-request";
import { useUiCopy } from "@/lib/ui-copy";
import { SystemRecordFields } from "./system-record-fields";

export function SystemRecords({
  collection,
  catalog,
  container,
  onLeave,
}: {
  collection: SystemCollection;
  catalog: Collection[];
  container: HTMLElement | null;
  onLeave: (action: () => void) => void;
}) {
  const copy = useUiCopy();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<SystemRecordPage | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      apiRequest<SystemRecordPage>(
        `/api/system-collections/${collection.name}/records?${new URLSearchParams({ q: query, page: String(page) })}`,
      )
        .then((data) => {
          if (active) {
            setResult(data);
            setError("");
          }
        })
        .catch((cause) => {
          if (active) {
            setError((cause as Error).message);
          }
        });
    }, 200);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [collection.name, query, page]);
  if (selected) {
    const back = () => onLeave(() => setSelected(null));
    return (
      <div className="space-y-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={back}
        >
          {copy("Назад")}
        </Button>
        <SystemRecordFields
          key={selected}
          collection={collection}
          id={selected}
          catalog={catalog}
          container={container}
          onCancel={back}
        />
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <Input
        aria-label={copy("Поиск записи")}
        placeholder={copy("Поиск записи")}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setPage(1);
          setResult(null);
        }}
      />
      {error && (
        <p
          role="alert"
          className="text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {!result && !error && <p role="status">{copy("Загрузка…")}</p>}
      {result?.records.length === 0 && (
        <p className="text-sm text-muted-foreground">{copy("Нет записей")}</p>
      )}
      <div className="divide-y">
        {result?.records.map((record) => (
          <Button
            key={record.id}
            variant="ghost"
            className="h-auto w-full justify-start rounded-none py-3 text-left whitespace-normal"
            onClick={() => setSelected(record.id)}
          >
            {record.label}
          </Button>
        ))}
      </div>
      {result && (
        <div className="flex items-center justify-between gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={page === 1}
            onClick={() => {
              setResult(null);
              setPage((value) => value - 1);
            }}
          >
            {copy("Назад")}
          </Button>
          <span className="text-xs text-muted-foreground">{page}</span>
          <Button
            size="sm"
            variant="outline"
            disabled={!result.hasMore}
            onClick={() => {
              setResult(null);
              setPage((value) => value + 1);
            }}
          >
            {copy("Далее")}
          </Button>
        </div>
      )}
    </div>
  );
}
