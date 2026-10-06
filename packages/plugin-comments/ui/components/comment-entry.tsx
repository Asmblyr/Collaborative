"use client";

import { usePluginTranslations } from "@asmblyr-collaborative/kit/ui/i18n";

import { useEffect, useRef, useState } from "react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import type { Comment } from "../../shared/comments.js";

function dateLabel(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function CommentEntry({
  comment,
  editDisabled,
  deleteDisabled,
  pending,
  onEdit,
  onDelete,
  highlighted = false,
}: {
  comment: Comment;
  editDisabled: boolean;
  deleteDisabled: boolean;
  pending: boolean;
  onEdit(): void;
  onDelete(): Promise<boolean>;
  highlighted?: boolean;
}) {
  const { t, locale } = usePluginTranslations("comments");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const element = useRef<HTMLElement>(null);
  useEffect(() => {
    if (highlighted) {
      element.current?.scrollIntoView({ block: "nearest" });
      element.current?.focus({ preventScroll: true });
    }
  }, [highlighted]);
  let author = t("author.unknown");
  if (comment.author)
    author =
      comment.author.name ??
      `${comment.author.kind === "service" ? t("author.service") : t("author.member")} · ${comment.author.id.slice(0, 8)}`;
  if (comment.isOwn)
    author = comment.author?.name
      ? t("author.own", undefined, { name: comment.author.name })
      : t("author.you");
  return (
    <article
      ref={element}
      tabIndex={highlighted ? -1 : undefined}
      className={`rounded-xl border bg-card p-4 outline-none ${highlighted ? "border-primary/50 bg-primary/5 ring-2 ring-primary/20" : ""}`}
    >
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium"
          >
            {comment.isOwn ? t("author.me") : author.slice(0, 1)}
          </span>
          <div>
            <p
              className="text-sm font-medium"
              title={comment.author?.id}
            >
              {author}
            </p>
            <time
              dateTime={comment.createdAt}
              className="text-xs text-muted-foreground"
            >
              {dateLabel(comment.createdAt, locale)}
            </time>
            {comment.updatedAt !== comment.createdAt && (
              <span
                className="ml-1 text-xs text-muted-foreground"
                title={dateLabel(comment.updatedAt, locale)}
              >
                {t("edited")}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-1">
          {comment.canEdit && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={editDisabled}
              onClick={onEdit}
            >
              {t("edit")}
            </Button>
          )}
          {comment.canDelete && !confirmDelete && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={deleteDisabled}
              onClick={() => setConfirmDelete(true)}
            >
              {t("delete")}
            </Button>
          )}
        </div>
      </header>
      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
        {comment.body}
      </p>
      {confirmDelete && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
          <p className="mr-auto text-sm">{t("delete.confirm")}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => setConfirmDelete(false)}
          >
            {t("cancel")}
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={deleteDisabled}
            onClick={async () => {
              if (await onDelete()) setConfirmDelete(false);
            }}
          >
            {t("delete")}
          </Button>
        </div>
      )}
    </article>
  );
}
