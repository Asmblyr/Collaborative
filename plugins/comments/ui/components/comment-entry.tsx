"use client";

import { useState } from "react";
import { Button } from "@asmblyr/kit/ui/button";
import type { Comment } from "../../shared/comments.js";

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("ru", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}

export function CommentEntry({
  comment,
  editDisabled,
  deleteDisabled,
  pending,
  onEdit,
  onDelete,
}: {
  comment: Comment;
  editDisabled: boolean;
  deleteDisabled: boolean;
  pending: boolean;
  onEdit(): void;
  onDelete(): Promise<boolean>;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  let author = "Автор неизвестен";
  if (comment.author)
    author =
      comment.author.name ??
      `${comment.author.kind === "service" ? "Сервис" : "Участник"} · ${comment.author.id.slice(0, 8)}`;
  if (comment.isOwn) author = comment.author?.name ? `${comment.author.name} · вы` : "Вы";
  return (
    <article className="rounded-xl border bg-card p-4">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium"
          >
            {comment.isOwn ? "Я" : author.slice(0, 1)}
          </span>
          <div>
            <p className="text-sm font-medium" title={comment.author?.id}>
              {author}
            </p>
            <time dateTime={comment.createdAt} className="text-xs text-muted-foreground">
              {dateLabel(comment.createdAt)}
            </time>
            {comment.updatedAt !== comment.createdAt && (
              <span
                className="ml-1 text-xs text-muted-foreground"
                title={dateLabel(comment.updatedAt)}
              >
                · изменён
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
              Изменить
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
              Удалить
            </Button>
          )}
        </div>
      </header>
      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{comment.body}</p>
      {confirmDelete && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
          <p className="mr-auto text-sm">Удалить комментарий?</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => setConfirmDelete(false)}
          >
            Отмена
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
            Удалить
          </Button>
        </div>
      )}
    </article>
  );
}
