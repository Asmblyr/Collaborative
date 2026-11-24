"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
} from "react";
import {
  Check,
  ChevronsUpDown,
  Globe,
  LocateFixed,
  Search,
  X,
} from "lucide-react";
import { Label } from "@asmblyr-collaborative/kit/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useAccountTheme } from "./account-theme";
import { useUiCopy } from "@/lib/ui-copy";
import {
  buildTimezoneOption,
  buildTimezoneOptions,
  canonicalTimeZone,
  detectBrowserTimeZone,
  filterTimezoneOptions,
  matchesAutoTimezoneQuery,
  type TimezoneOption,
} from "./timezone-options";

const subscribe = () => () => {};

type ComboboxEntry =
  | { kind: "auto"; id: "__auto__"; option: TimezoneOption }
  | { kind: "zone"; id: string; option: TimezoneOption };

export function TimezoneSetting() {
  const copy = useUiCopy();
  const { timezone, saveTimezone } = useAccountTheme();
  const listboxId = useId();
  const optionPrefix = useId();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

  const allOptions = useMemo(() => buildTimezoneOptions(), []);
  const optionsById = useMemo(
    () => new Map(allOptions.map((option) => [option.id, option])),
    [allOptions],
  );

  const browserZoneId = useMemo(
    () => (mounted ? detectBrowserTimeZone() : "UTC"),
    [mounted],
  );
  const browserOption = useMemo(
    () => optionsById.get(browserZoneId) ?? buildTimezoneOption(browserZoneId),
    [optionsById, browserZoneId],
  );

  const selectedOption = useMemo(() => {
    if (!timezone) {
      return null;
    }
    return optionsById.get(timezone) ?? buildTimezoneOption(timezone);
  }, [optionsById, timezone]);

  const filteredOptions = useMemo(
    () => filterTimezoneOptions(allOptions, query),
    [allOptions, query],
  );
  const showAutoOption = useMemo(
    () => matchesAutoTimezoneQuery(query, browserOption),
    [query, browserOption],
  );

  const entries = useMemo<ComboboxEntry[]>(() => {
    const list: ComboboxEntry[] = [];
    if (showAutoOption) {
      list.push({ kind: "auto", id: "__auto__", option: browserOption });
    }
    for (const option of filteredOptions) {
      list.push({ kind: "zone", id: option.id, option });
    }
    return list;
  }, [showAutoOption, browserOption, filteredOptions]);

  const effectiveActiveIndex =
    entries.length === 0
      ? -1
      : Math.min(Math.max(activeIndex, 0), entries.length - 1);
  const activeEntry =
    effectiveActiveIndex >= 0 ? entries[effectiveActiveIndex] : null;

  useEffect(() => {
    if (!open || effectiveActiveIndex < 0) {
      return;
    }
    const target = listRef.current?.querySelector<HTMLElement>(
      `[data-option-index="${effectiveActiveIndex}"]`,
    );
    target?.scrollIntoView({ block: "nearest" });
  }, [open, effectiveActiveIndex]);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setQuery("");
      const selectedIdx = timezone
        ? allOptions.findIndex((option) => option.id === timezone) + 1
        : 0;
      setActiveIndex(selectedIdx >= 0 ? selectedIdx : 0);
    }
  }

  async function selectTimezone(nextZone: string | null) {
    if (pending) {
      return;
    }
    try {
      const canonical = nextZone ? canonicalTimeZone(nextZone) : null;
      setOpen(false);
      setQuery("");
      setPending(true);
      await saveTimezone(canonical);
      setError("");
    } catch {
      setError(copy("Выберите существующий часовой пояс"));
    } finally {
      setPending(false);
    }
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (entries.length > 0) {
        setActiveIndex((current) => (current + 1) % entries.length);
      }
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (entries.length > 0) {
        setActiveIndex(
          (current) => (current - 1 + entries.length) % entries.length,
        );
      }
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      if (entries.length > 0) {
        setActiveIndex(entries.length - 1);
      }
      return;
    }
    if (event.key === "Enter" && activeEntry) {
      event.preventDefault();
      void selectTimezone(
        activeEntry.kind === "auto" ? null : activeEntry.option.id,
      );
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div className="max-w-md space-y-2">
      <Label htmlFor="profile-timezone">{copy("Часовой пояс")}</Label>
      <Popover
        open={open}
        onOpenChange={handleOpenChange}
      >
        <PopoverTrigger asChild>
          <button
            id="profile-timezone"
            type="button"
            role="combobox"
            aria-expanded={open}
            aria-controls={listboxId}
            aria-haspopup="listbox"
            disabled={pending}
            className="flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-left text-sm text-foreground shadow-xs transition-colors outline-none hover:bg-accent/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30 dark:hover:bg-input/50"
          >
            <span className="flex min-w-0 items-center gap-2">
              <Globe
                aria-hidden="true"
                className="size-4 shrink-0 text-muted-foreground"
              />
              {selectedOption ? (
                <span className="flex min-w-0 items-center gap-1.5 truncate">
                  <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                    {selectedOption.offsetLabel}
                  </span>
                  <span
                    aria-hidden="true"
                    className="text-muted-foreground/70"
                  >
                    ·
                  </span>
                  <span className="truncate">{selectedOption.id}</span>
                </span>
              ) : (
                <span className="flex min-w-0 items-center gap-1.5 truncate">
                  <span className="shrink-0">{copy("Как на устройстве")}</span>
                  {mounted && (
                    <span className="truncate text-xs text-muted-foreground">
                      ({browserOption.label})
                    </span>
                  )}
                </span>
              )}
            </span>
            <ChevronsUpDown
              aria-hidden="true"
              className="size-4 shrink-0 text-muted-foreground"
            />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={6}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            searchInputRef.current?.focus();
          }}
          className="w-[var(--radix-popover-trigger-width)] min-w-[20rem] max-w-[min(28rem,calc(100vw-2rem))] overflow-hidden p-0"
        >
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Search
              aria-hidden="true"
              className="size-4 shrink-0 text-muted-foreground"
            />
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={handleSearchKeyDown}
              placeholder={copy("Поиск часового пояса…")}
              aria-label={copy("Поиск часового пояса…")}
              aria-controls={listboxId}
              aria-activedescendant={
                activeEntry
                  ? `${optionPrefix}-${effectiveActiveIndex}`
                  : undefined
              }
              autoComplete="off"
              spellCheck={false}
              className="h-7 min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
            />
            {query && (
              <button
                type="button"
                aria-label={copy("Сбросить поиск")}
                onClick={() => {
                  setQuery("");
                  setActiveIndex(0);
                  searchInputRef.current?.focus();
                }}
                className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X
                  aria-hidden="true"
                  className="size-3.5"
                />
              </button>
            )}
          </div>
          <div
            ref={listRef}
            id={listboxId}
            role="listbox"
            aria-label={copy("Часовой пояс")}
            className="max-h-72 overflow-y-auto p-1"
          >
            {entries.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                {copy("Часовой пояс не найден")}
              </p>
            ) : (
              entries.map((entry, index) => {
                const isActive = index === effectiveActiveIndex;
                const isSelected =
                  entry.kind === "auto"
                    ? timezone === null
                    : timezone === entry.option.id;
                const showDividerAfter =
                  entry.kind === "auto" && entries.length > 1;
                return (
                  <div key={entry.id}>
                    <button
                      id={`${optionPrefix}-${index}`}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      data-option-index={index}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() =>
                        void selectTimezone(
                          entry.kind === "auto" ? null : entry.option.id,
                        )
                      }
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors outline-none",
                        isActive
                          ? "bg-accent text-accent-foreground"
                          : "text-popover-foreground hover:bg-accent/60",
                      )}
                    >
                      {entry.kind === "auto" ? (
                        <>
                          <LocateFixed
                            aria-hidden="true"
                            className="size-3.5 shrink-0 text-primary"
                          />
                          <span className="min-w-0 flex-1 truncate font-medium">
                            {copy("Определить автоматически ({{value0}})", {
                              value0: entry.option.id,
                            })}
                          </span>
                          <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                            {entry.option.offsetLabel}
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="w-[5.25rem] shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                            {entry.option.offsetLabel}
                          </span>
                          <span
                            aria-hidden="true"
                            className="shrink-0 text-muted-foreground/60"
                          >
                            ·
                          </span>
                          <span className="min-w-0 flex-1 truncate">
                            {entry.option.id}
                          </span>
                        </>
                      )}
                      {isSelected && (
                        <Check
                          aria-hidden="true"
                          className="ml-auto size-4 shrink-0 text-primary"
                        />
                      )}
                    </button>
                    {showDividerAfter && (
                      <div
                        role="separator"
                        className="my-1 h-px bg-border"
                      />
                    )}
                  </div>
                );
              })
            )}
          </div>
        </PopoverContent>
      </Popover>
      <p className="text-xs text-muted-foreground">
        {copy(
          "Используется для дат профиля. Пустое значение — часовой пояс устройства.",
        )}
      </p>
      {error && (
        <p
          role="alert"
          className="text-sm text-destructive"
        >
          {error}
        </p>
      )}
    </div>
  );
}
