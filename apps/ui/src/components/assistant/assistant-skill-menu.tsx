"use client";

import { useEffect, useRef, type KeyboardEvent } from "react";
import { Check, Search, Sparkles } from "lucide-react";
import type { AssistantSkillSummary } from "@asmblyr-collaborative/contracts";
import { cn } from "cn";
import { useUiCopy } from "@/lib/ui-copy";

export function AssistantSkillMenu({
  open,
  mode,
  query,
  onQueryChange,
  collectionSkills,
  generalSkills,
  totalCount,
  activeIndex,
  onActiveIndexChange,
  selectedSlug,
  loading = false,
  onSelect,
  onClose,
  listboxId,
}: {
  open: boolean;
  mode: "slash" | "picker";
  query: string;
  onQueryChange?: (value: string) => void;
  collectionSkills: readonly AssistantSkillSummary[];
  generalSkills: readonly AssistantSkillSummary[];
  totalCount: number;
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  selectedSlug?: string | null;
  loading?: boolean;
  onSelect: (skill: AssistantSkillSummary) => void;
  onClose: () => void;
  listboxId: string;
}) {
  const copy = useUiCopy();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const flatSkills = [...collectionSkills, ...generalSkills];

  useEffect(() => {
    if (open && mode === "picker") {
      searchInputRef.current?.focus();
    }
  }, [open, mode]);

  useEffect(() => {
    if (!open || flatSkills.length === 0) {
      return;
    }
    const activeOption = listRef.current?.querySelector<HTMLElement>(
      `[data-skill-index="${activeIndex}"]`,
    );
    activeOption?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex, flatSkills.length]);

  if (!open) {
    return null;
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (flatSkills.length > 0) {
        onActiveIndexChange((activeIndex + 1) % flatSkills.length);
      }
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (flatSkills.length > 0) {
        onActiveIndexChange(
          (activeIndex - 1 + flatSkills.length) % flatSkills.length,
        );
      }
      return;
    }
    if (
      (event.key === "Enter" || event.key === "Tab") &&
      !event.nativeEvent.isComposing
    ) {
      const target = flatSkills[activeIndex];
      if (target) {
        event.preventDefault();
        onSelect(target);
      }
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
  }

  function renderOption(skill: AssistantSkillSummary, flatIndex: number) {
    const isActive = flatIndex === activeIndex;
    const isSelected = skill.slug === selectedSlug;
    return (
      <div
        key={skill.slug}
        id={`${listboxId}-option-${flatIndex}`}
        role="option"
        aria-selected={isActive}
        data-skill-index={flatIndex}
        onMouseDown={(event) => event.preventDefault()}
        onMouseEnter={() => onActiveIndexChange(flatIndex)}
        onClick={() => onSelect(skill)}
        className={cn(
          "flex cursor-pointer flex-col gap-0.5 rounded-lg px-2.5 py-2 text-left transition-colors",
          isActive ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
        )}
      >
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[11px] font-medium leading-none text-primary">
            /{skill.slug}
          </span>
          <span className="min-w-0 flex-1 truncate text-xs font-medium leading-4">
            {skill.title}
          </span>
          {isSelected && (
            <Check
              className="size-3.5 shrink-0 text-primary"
              aria-hidden="true"
            />
          )}
        </div>
        {skill.description && (
          <p className="truncate text-[11px] leading-4 text-muted-foreground">
            {skill.description}
          </p>
        )}
      </div>
    );
  }

  return (
    <div
      className="absolute bottom-full left-0 right-0 z-30 mb-1.5 overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-lg"
      data-slot="assistant-skill-menu"
    >
      {mode === "picker" ? (
        <div className="flex items-center gap-2 border-b border-border/70 px-2.5 py-2">
          <Search
            className="size-3.5 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            ref={searchInputRef}
            type="text"
            value={query}
            onChange={(event) => onQueryChange?.(event.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder={copy("Поиск умений…")}
            aria-label={copy("Поиск умений…")}
            aria-controls={listboxId}
            aria-activedescendant={
              flatSkills[activeIndex]
                ? `${listboxId}-option-${activeIndex}`
                : undefined
            }
            className="min-w-0 flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2 border-b border-border/70 px-2.5 py-1.5 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5 font-medium">
            <Sparkles
              className="size-3 text-primary"
              aria-hidden="true"
            />
            {copy("Умения ассистента")}
          </span>
          <span className="font-mono text-[10px]">Esc</span>
        </div>
      )}

      <div
        ref={listRef}
        id={listboxId}
        role="listbox"
        aria-label={copy("Умения ассистента")}
        className="max-h-60 overflow-y-auto p-1.5"
      >
        {loading && flatSkills.length === 0 ? (
          <p className="px-2.5 py-3 text-center text-xs text-muted-foreground">
            {copy("Поиск умений…")}
          </p>
        ) : flatSkills.length === 0 ? (
          <p className="px-2.5 py-3 text-center text-xs text-muted-foreground">
            {totalCount === 0
              ? copy("Нет доступных умений")
              : copy("Умения не найдены")}
          </p>
        ) : (
          <div className="space-y-2">
            {collectionSkills.length > 0 && (
              <div
                role="group"
                aria-label={copy("Для текущей коллекции")}
                className="space-y-0.5"
              >
                <p
                  role="presentation"
                  className="px-2 pb-0.5 pt-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                >
                  {copy("Для текущей коллекции")}
                </p>
                {collectionSkills.map((skill, index) =>
                  renderOption(skill, index),
                )}
              </div>
            )}
            {generalSkills.length > 0 && (
              <div
                role="group"
                aria-label={copy("Общие умения")}
                className="space-y-0.5"
              >
                <p
                  role="presentation"
                  className="px-2 pb-0.5 pt-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                >
                  {copy("Общие умения")}
                </p>
                {generalSkills.map((skill, index) =>
                  renderOption(skill, collectionSkills.length + index),
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
