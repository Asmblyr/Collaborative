"use client";

import { ArrowLeft, MessageSquare, Trash2 } from "lucide-react";
import { useState } from "react";
import type { AssistantConversation } from "@asmblyr-collaborative/contracts";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { useUiCopy } from "@/lib/ui-copy";

export function AssistantHistory({
  items,
  selectedId,
  loading,
  error,
  more,
  hasDraft,
  onBack,
  onSelect,
  onDelete,
  onMore,
}: {
  items: AssistantConversation[];
  selectedId?: string;
  loading: boolean;
  error: string | null;
  more: boolean;
  hasDraft(id: string): boolean;
  onBack(): void;
  onSelect(id: string): void;
  onDelete(id: string): void;
  onMore(): void;
}) {
  const copy = useUiCopy();
  const [confirmId, setConfirmId] = useState<string | null>(null);
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
        {items.map((item) => (
          <div
            key={item.id}
            className={
              "group flex flex-wrap items-center rounded-lg " +
              (selectedId === item.id ? "bg-accent" : "hover:bg-muted/60")
            }
          >
            <button
              type="button"
              disabled={loading}
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
            <Button
              variant="ghost"
              size="icon-sm"
              className="mr-1 shrink-0 text-muted-foreground"
              aria-label={copy("Удалить сессию")}
              disabled={loading || Boolean(item.busyUntil)}
              onClick={() => setConfirmId(item.id)}
            >
              <Trash2 className="size-3.5" />
            </Button>
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
        ))}
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
