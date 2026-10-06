"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, BellOff, CheckCheck } from "lucide-react";
import { useTranslations } from "@asmblyr-collaborative/kit/ui/i18n";
import type { NotificationItem } from "@asmblyr-collaborative/contracts";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { navigateWithEditorGuard } from "@/components/collections/use-editor-navigation-guard";
import { useUiCopy } from "@/lib/ui-copy";
import { useNotifications } from "./use-notifications";
import { notificationHref } from "./location";

export function NotificationBell({
  collections,
}: {
  collections: readonly { name: string; displayName?: string | null }[];
}) {
  const copy = useUiCopy();
  const { locale } = useTranslations();
  const inbox = useNotifications();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const unread = inbox.result?.unread ?? 0;
  const date = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  function select(item: NotificationItem) {
    navigateWithEditorGuard(() => {
      void inbox.read(item.id).then((success) => {
        if (!success) return;
        setOpen(false);
        router.push(notificationHref(item), { scroll: false });
      });
    });
  }
  return (
    <Popover
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (value) void inbox.refresh();
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative size-8 shrink-0"
          aria-label={`${copy("Уведомления")}${unread ? ` · ${unread}` : ""}`}
          title={copy("Уведомления")}
        >
          <Bell className="size-4" />
          {unread > 0 && (
            <span
              aria-hidden="true"
              className="absolute -right-1 -top-1 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground"
            >
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        aria-label={copy("Уведомления")}
        className="w-[min(24rem,calc(100vw-2rem))] p-0"
      >
        <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <h2 className="text-sm font-semibold">{copy("Уведомления")}</h2>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={!unread || inbox.pending}
            onClick={() => void inbox.read()}
          >
            <CheckCheck className="size-3.5" />
            {copy("Прочитать все")}
          </Button>
        </div>
        {inbox.error && (
          <div
            role="alert"
            className="flex items-center justify-between gap-2 border-b px-4 py-3 text-xs text-destructive"
          >
            {copy("Не удалось обновить уведомления")}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void inbox.refresh()}
              disabled={inbox.pending}
            >
              {copy("Повторить")}
            </Button>
          </div>
        )}
        {!inbox.result && !inbox.error && (
          <p
            role="status"
            className="px-4 py-10 text-center text-sm text-muted-foreground"
          >
            {copy("Загрузка уведомлений…")}
          </p>
        )}
        {inbox.result?.total === 0 && (
          <div className="space-y-2 px-6 py-10 text-center">
            <BellOff className="mx-auto mb-3 size-6 text-muted-foreground/70" />
            <p className="text-sm font-medium">
              {copy("Пока нет уведомлений")}
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {copy(
                "Следите за обсуждением записи — новые комментарии появятся здесь.",
              )}
            </p>
          </div>
        )}
        {inbox.result && inbox.result.total > 0 && (
          <div className="max-h-[min(28rem,65dvh)] overflow-y-auto overscroll-contain p-1">
            <ul className="space-y-0.5">
              {inbox.result.data.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`flex w-full gap-3 rounded-lg px-3 py-3 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${item.readAt ? "" : "bg-primary/5"}`}
                    disabled={inbox.pending}
                    onClick={() => select(item)}
                  >
                    <span
                      aria-hidden="true"
                      className={`mt-1 flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${item.readAt ? "bg-muted text-muted-foreground" : "bg-primary/15 text-primary"}`}
                    >
                      {(item.actorName || copy("Участник")).slice(0, 1)}
                    </span>
                    <span className="min-w-0 flex-1 space-y-1">
                      <span className="flex items-center gap-2 text-xs font-medium">
                        {item.actorName || copy("Участник")}
                        {!item.readAt && (
                          <span
                            className="size-1.5 shrink-0 rounded-full bg-primary"
                            aria-label={copy("Непрочитанное")}
                          />
                        )}
                      </span>
                      <span className="line-clamp-2 block break-words text-sm leading-snug">
                        {item.preview}
                      </span>
                      <span className="flex flex-wrap gap-x-2 text-[11px] text-muted-foreground">
                        <span
                          className="truncate"
                          title={item.item}
                        >
                          {collections.find(
                            (collection) => collection.name === item.collection,
                          )?.displayName ||
                            item.collectionDisplayName ||
                            item.collection}{" "}
                          · #
                          {item.item.length > 16
                            ? `${item.item.slice(0, 12)}…`
                            : item.item}
                        </span>
                        <time dateTime={item.createdAt}>
                          {date.format(new Date(item.createdAt))}
                        </time>
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {inbox.result.data.length < inbox.result.total && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={inbox.showMore}
              >
                {copy("Показать ещё")}
              </Button>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
