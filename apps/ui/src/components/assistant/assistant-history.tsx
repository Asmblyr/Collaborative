"use client";

import {
  ArrowLeft,
  Check,
  LoaderCircle,
  MessageSquare,
  Pencil,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { AssistantConversation } from "@asmblyr-collaborative/contracts";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { Input } from "@asmblyr-collaborative/kit/ui/input";
import { useUiCopy } from "@/lib/ui-copy";
import {
  filterHistoryConversations,
  MAX_CONVERSATION_TITLE_LENGTH,
  validateConversationTitle,
} from "./assistant-history-messages";

export function AssistantHistory({
  items,
  selectedId,
  loading,
  error,
  more,
  hasDraft,
  onBack,
  onSelect,
  onRename,
  onDelete,
  onMore,
  onEditingChange,
}: {
  items: AssistantConversation[];
  selectedId?: string;
  loading: boolean;
  error: string | null;
  more: boolean;
  hasDraft(id: string): boolean;
  onBack(): void;
  onSelect(id: string): void;
  onRename(id: string, title: string): Promise<{ ok: boolean; error?: string }>;
  onDelete(id: string): void;
  onMore(): void;
  onEditingChange?(editing: boolean): void;
}) {
  const copy = useUiCopy();
  const isEn = copy.locale.startsWith("en");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const fallbackTitle = copy("Новая сессия");
  const filteredItems = useMemo(
    () => filterHistoryConversations(items, query, fallbackTitle),
    [items, query, fallbackTitle],
  );
  const trimmedQuery = query.trim();

  useEffect(() => {
    onEditingChange?.(editingId !== null);
    return () => {
      onEditingChange?.(false);
    };
  }, [editingId, onEditingChange]);

  function startRename(item: AssistantConversation) {
    setConfirmId(null);
    setEditingId(item.id);
    setDraftTitle(item.title || "");
    setRenameError(null);
  }

  function cancelRename() {
    if (renamingId !== null) {
      return;
    }
    setEditingId(null);
    setDraftTitle("");
    setRenameError(null);
  }

  async function submitRename(item: AssistantConversation) {
    const validated = validateConversationTitle(draftTitle);
    if (!validated.ok) {
      if (validated.reason === "empty") {
        setRenameError(copy("Введите название сессии."));
      } else if (validated.reason === "too_long") {
        setRenameError(
          copy("Название сессии не может быть длиннее 120 символов."),
        );
      } else {
        setRenameError(copy("Название содержит недопустимые символы."));
      }
      return;
    }
    if (item.title.trim() && validated.title === item.title.trim()) {
      setEditingId(null);
      setDraftTitle("");
      setRenameError(null);
      return;
    }
    setRenamingId(item.id);
    setRenameError(null);
    try {
      const result = await onRename(item.id, validated.title);
      if (result.ok) {
        setEditingId(null);
        setDraftTitle("");
        setRenameError(null);
      } else {
        setRenameError(
          result.error || copy("Не удалось переименовать сессию."),
        );
      }
    } finally {
      setRenamingId(null);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-y px-3 py-2">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onBack}
          aria-label={copy("Вернуться к диалогу")}
        >
          <ArrowLeft />
        </Button>
        <h3 className="text-sm font-medium">{copy("История сессий")}</h3>
      </div>
      {items.length > 0 && (
        <div className="border-b px-3 py-2">
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="text"
              role="searchbox"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={isEn ? "Search sessions…" : "Поиск по сессиям…"}
              aria-label={
                isEn ? "Search session history" : "Поиск по истории сессий"
              }
              className="h-8 pl-8 pr-8 text-xs"
            />
            {query && (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={() => setQuery("")}
                aria-label={isEn ? "Clear search" : "Очистить поиск"}
                className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground"
              >
                <X className="size-3.5" />
              </Button>
            )}
          </div>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {error && (
          <p
            role="alert"
            className="p-2 text-xs text-destructive"
          >
            {copy(error)}
          </p>
        )}
        {!items.length && (
          <p className="p-3 text-sm text-muted-foreground">
            {copy(
              loading ? "Загрузка истории…" : "Пока нет сохранённых сессий",
            )}
          </p>
        )}
        {items.length > 0 && filteredItems.length === 0 && trimmedQuery && (
          <div className="space-y-2 p-3 text-sm text-muted-foreground">
            <p>
              {isEn ? "No matching sessions" : "По запросу ничего не найдено"}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setQuery("")}
            >
              {copy("Сбросить поиск")}
            </Button>
          </div>
        )}
        {filteredItems.map((item) => {
          const isEditing = editingId === item.id;
          const isRenaming = renamingId === item.id;
          return (
            <div
              key={item.id}
              className={
                "group flex flex-wrap items-center rounded-lg " +
                (selectedId === item.id ? "bg-accent" : "hover:bg-muted/60")
              }
            >
              {isEditing ? (
                <form
                  className="flex w-full flex-col gap-1.5 px-2.5 py-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void submitRename(item);
                  }}
                >
                  <div className="flex items-center gap-1">
                    <Input
                      type="text"
                      autoFocus
                      maxLength={MAX_CONVERSATION_TITLE_LENGTH}
                      value={draftTitle}
                      disabled={isRenaming}
                      aria-label={copy("Название сессии")}
                      placeholder={copy("Название сессии")}
                      className="h-8 flex-1 text-xs"
                      onChange={(event) => {
                        setDraftTitle(event.target.value);
                        if (renameError) {
                          setRenameError(null);
                        }
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          event.preventDefault();
                          event.stopPropagation();
                          cancelRename();
                        }
                      }}
                    />
                    <Button
                      type="submit"
                      variant="ghost"
                      size="icon-sm"
                      className="shrink-0 text-foreground"
                      disabled={isRenaming}
                      aria-label={copy("Сохранить название")}
                      title={copy("Сохранить название")}
                    >
                      {isRenaming ? (
                        <LoaderCircle className="size-3.5 animate-spin" />
                      ) : (
                        <Check className="size-3.5" />
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="shrink-0 text-muted-foreground"
                      disabled={isRenaming}
                      aria-label={copy("Отмена")}
                      title={copy("Отмена")}
                      onClick={cancelRename}
                    >
                      <X className="size-3.5" />
                    </Button>
                  </div>
                  {renameError && (
                    <p
                      role="alert"
                      className="px-0.5 text-xs text-destructive"
                    >
                      {copy(renameError)}
                    </p>
                  )}
                </form>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={loading || renamingId !== null}
                    onClick={() => onSelect(item.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <MessageSquare className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm">
                        {item.title || copy("Новая сессия")}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {new Date(item.updatedAt).toLocaleString(copy.locale, {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </span>
                      {hasDraft(item.id) && (
                        <span className="block text-xs font-medium text-muted-foreground">
                          {copy("Черновик")}
                        </span>
                      )}
                    </span>
                  </button>
                  <div className="mr-1 flex shrink-0 items-center gap-0.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="text-muted-foreground opacity-75 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                      aria-label={copy("Переименовать сессию")}
                      title={copy("Переименовать сессию")}
                      disabled={
                        loading ||
                        renamingId !== null ||
                        Boolean(item.busyUntil)
                      }
                      onClick={() => startRename(item)}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="text-muted-foreground opacity-75 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                      aria-label={copy("Удалить сессию")}
                      title={copy("Удалить сессию")}
                      disabled={
                        loading ||
                        renamingId !== null ||
                        Boolean(item.busyUntil)
                      }
                      onClick={() => {
                        setEditingId(null);
                        setRenameError(null);
                        setConfirmId(item.id);
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </>
              )}
              {confirmId === item.id && (
                <div className="w-full space-y-2 border-t p-3">
                  <p className="text-xs text-muted-foreground">
                    {copy("Удалить эту сессию и всю переписку?")}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={loading}
                      onClick={() => {
                        setConfirmId(null);
                        onDelete(item.id);
                      }}
                    >
                      {copy("Удалить сессию")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmId(null)}
                    >
                      {copy("Отмена")}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {more && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 w-full"
            disabled={loading}
            onClick={onMore}
          >
            {copy("Ещё сессии")}
          </Button>
        )}
      </div>
    </div>
  );
}
