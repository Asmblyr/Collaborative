"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { WorkspaceLink as Link } from "@/components/workspaces/workspace-link";
import { useWorkspace } from "@/components/workspaces/workspace-provider";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@asmblyr-collaborative/kit/ui/input";
import { requestJson } from "@/lib/http-request";
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
  const workspace = useWorkspace();
  const params = useSearchParams();
  const input = useRef<HTMLInputElement>(null);
  const dropdown = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState(() => params.get("q") ?? "");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<SearchResults | null>(null);
  const [error, setError] = useState(false);
  const query = value.trim();
  const urlQuery = params.get("q") ?? "";

  useEffect(() => {
    function onGlobalKeyDown(event: KeyboardEvent) {
      if (
        event.key.toLowerCase() !== "k" ||
        !(event.metaKey || event.ctrlKey) ||
        event.altKey ||
        event.shiftKey
      ) {
        return;
      }
      const openDialog = document.querySelector("dialog[open]");
      if (openDialog && !openDialog.contains(input.current)) {
        return;
      }
      event.preventDefault();
      input.current?.focus();
      input.current?.select();
      setOpen(true);
    }
    window.addEventListener("keydown", onGlobalKeyDown);
    return () => window.removeEventListener("keydown", onGlobalKeyDown);
  }, []);

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
        const nextResults = await requestJson<SearchResults>(
          `/api/search?q=${encodeURIComponent(query)}`,
          "GET",
          undefined,
          controller.signal,
        );
        setResults(nextResults);
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
      const target = `/search${query ? `?q=${encodeURIComponent(query)}` : ""}`;
      router.push(workspace?.href(target) ?? target);
    }
    input.current?.blur();
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && open) {
      event.stopPropagation();
      setOpen(false);
      input.current?.focus();
      return;
    }
    if (
      !scoped &&
      open &&
      (event.key === "ArrowDown" || event.key === "ArrowUp")
    ) {
      const links = Array.from(
        dropdown.current?.querySelectorAll<HTMLAnchorElement>("a[href]") ?? [],
      );
      if (links.length === 0) {
        return;
      }
      event.preventDefault();
      const activeIndex = links.indexOf(
        document.activeElement as HTMLAnchorElement,
      );
      if (event.key === "ArrowDown") {
        const nextIndex = activeIndex < links.length - 1 ? activeIndex + 1 : 0;
        links[nextIndex]?.focus();
      } else if (activeIndex <= 0) {
        input.current?.focus();
      } else {
        links[activeIndex - 1]?.focus();
      }
    }
  }

  return (
    <div
      className="relative min-w-0 flex-1 sm:w-64 sm:flex-none lg:w-80"
      onKeyDown={handleKeyDown}
      onFocusCapture={() => setOpen(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
        }
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
            setOpen(true);
          }}
          maxLength={100}
          autoComplete="off"
          className={
            scoped && query
              ? "pl-9 pr-16"
              : !scoped && !value
                ? "pl-9 sm:pr-14"
                : "pl-9"
          }
        />
        {!scoped && !value && (
          <kbd
            aria-hidden="true"
            className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded border bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline-block"
          >
            ⌘K
          </kbd>
        )}
      </form>
      {scoped && query && (
        <Link
          href={`/search?q=${encodeURIComponent(query)}`}
          className="absolute right-1 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          {copy("Везде")}
        </Link>
      )}
      {!scoped && open && query && (
        <div
          ref={dropdown}
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
                    {copy("Коллекции")}
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
                    {copy("Записи")}
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
                {copy("Открыть страницу поиска")}
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  );
}
