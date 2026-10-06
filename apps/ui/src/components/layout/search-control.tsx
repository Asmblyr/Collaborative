"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@asmblyr-collaborative/kit/ui/input";
import { itemSearchHref, type SearchResults } from "@/lib/search";
import { useUiCopy } from "@/lib/ui-copy";

export function SearchControl({
  collection,
  localLabel,
}: {
  collection?: string;
  localLabel?: string;
}) {
  const copy = useUiCopy();

  const scoped = Boolean(collection || localLabel);
  const pathname = usePathname();
  const router = useRouter();
  const params = useSearchParams();
  const input = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(() => params.get("q") ?? "");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<SearchResults | null>(null);
  const [error, setError] = useState(false);
  const query = value.trim();
  const urlQuery = params.get("q") ?? "";

  useEffect(() => {
    if (document.activeElement !== input.current) setValue(urlQuery);
  }, [urlQuery]);

  useEffect(() => {
    if (!scoped || query === urlQuery) return;
    const timer = window.setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (query) next.set("q", query);
      else next.delete("q");
      next.delete("page");
      if (collection && !urlQuery && query) next.set("order", "relevance");
      if (collection && !query) next.set("order", "field");
      router.replace(`${pathname}${next.size ? `?${next}` : ""}`, {
        scroll: false,
      });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [collection, scoped, params, pathname, query, router, urlQuery]);

  useEffect(() => {
    if (scoped || !query) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/search?q=${encodeURIComponent(query)}`,
          {
            signal: controller.signal,
          },
        );
        if (!response.ok) throw new Error("Search failed");
        setResults((await response.json()) as SearchResults);
        setError(false);
      } catch {
        if (!controller.signal.aborted) {
          setResults(null);
          setError(true);
        }
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [scoped, query]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setOpen(false);
    if (scoped) {
      const next = new URLSearchParams(params.toString());
      if (query) next.set("q", query);
      else next.delete("q");
      next.delete("page");
      if (collection && !urlQuery && query) next.set("order", "relevance");
      if (collection && !query) next.set("order", "field");
      router.replace(`${pathname}${next.size ? `?${next}` : ""}`, {
        scroll: false,
      });
    } else {
      router.push(`/search${query ? `?q=${encodeURIComponent(query)}` : ""}`);
    }
    input.current?.blur();
  }

  return (
    <div
      className="relative min-w-0 flex-1 sm:w-64 sm:flex-none lg:w-80"
      onFocusCapture={() => setOpen(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <form
        onSubmit={submit}
        role="search"
        className="relative"
      >
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          ref={input}
          type="search"
          aria-label={
            scoped
              ? copy("Поиск в {{value0}}", { value0: localLabel ?? collection })
              : copy("Глобальный поиск")
          }
          placeholder={
            scoped
              ? copy("Поиск в {{value0}}", { value0: localLabel ?? collection })
              : copy("Поиск везде")
          }
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setResults(null);
          }}
          maxLength={100}
          autoComplete="off"
          className={scoped && query ? "pl-9 pr-16" : "pl-9"}
        />
      </form>
      {scoped && query && (
        <Link
          href={`/search?q=${encodeURIComponent(query)}`}
          className="absolute right-1 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          {copy("Везде ")}
        </Link>
      )}
      {!scoped && open && query && (
        <div
          role="region"
          aria-label={copy("Результаты поиска")}
          className="absolute right-0 z-50 mt-2 max-h-96 w-full min-w-72 overflow-y-auto rounded-xl border bg-popover p-2 text-sm shadow-lg sm:w-96"
        >
          {error ? (
            <p className="p-2 text-muted-foreground">
              {copy("Поиск недоступен")}
            </p>
          ) : !results ? (
            <p className="p-2 text-muted-foreground">{copy("Ищем…")}</p>
          ) : (
            <>
              {results.collections.length > 0 && (
                <div className="py-1">
                  <p className="px-2 py-1 text-xs font-medium text-muted-foreground">
                    {copy("Коллекции ")}
                  </p>
                  {results.collections
                    .slice(0, 5)
                    .map(({ name, displayName }) => (
                      <Link
                        key={name}
                        href={`/items/${encodeURIComponent(name)}`}
                        className="block truncate rounded px-2 py-1.5 font-mono hover:bg-muted"
                      >
                        {displayName || name}
                      </Link>
                    ))}
                </div>
              )}
              {results.items.length > 0 && (
                <div className="py-1">
                  <p className="px-2 py-1 text-xs font-medium text-muted-foreground">
                    {copy("Записи ")}
                  </p>
                  {results.items.slice(0, 5).map((item) => (
                    <Link
                      key={`${item.collection}:${item.id}`}
                      href={itemSearchHref(item.collection, item.id)}
                      className="flex gap-2 rounded px-2 py-1.5 hover:bg-muted"
                    >
                      <span className="shrink-0 font-mono text-muted-foreground">
                        {item.collection}
                      </span>
                      <span className="min-w-0 truncate">{item.label}</span>
                    </Link>
                  ))}
                </div>
              )}
              {results.collections.length === 0 &&
                results.items.length === 0 && (
                  <p className="p-2 text-muted-foreground">
                    {copy("Ничего не найдено")}
                  </p>
                )}
              <Link
                href={`/search?q=${encodeURIComponent(query)}`}
                className="block rounded border-t px-2 py-2 text-primary hover:bg-muted"
              >
                {copy("Открыть страницу поиска ")}
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  );
}
