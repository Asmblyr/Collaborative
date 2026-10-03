"use client";

import { Button } from "@asmblyr/kit/ui/button";
import type { RecordPanelProps } from "@asmblyr/kit/ui";
import { useComments } from "../hooks/use-comments.ts";
import { useCommentComposer } from "../hooks/use-comment-composer.ts";
import { CommentComposer } from "./comment-composer.tsx";
import { CommentEntry } from "./comment-entry.tsx";

export function CommentsPanel(props: RecordPanelProps) {
  const comments = useComments(props);
  const composer = useCommentComposer({
    canCreate: comments.result?.canCreate ?? false,
    maxLength: comments.result?.maxLength ?? 10000,
    pending: comments.pending,
    createComment: comments.createComment,
    updateComment: comments.updateComment,
    onStateChange: props.onStateChange,
  });

  const total = Number(comments.result?.page.total ?? 0);
  const pageSize = comments.result?.page.size ?? 1;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const showComments = !comments.loading && comments.result !== null;

  return (
    <section
      aria-label="Комментарии к записи"
      className="space-y-5"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold">
            Обсуждение записи{comments.result ? ` · ${total}` : ""}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Комментарии видны тем, у кого есть доступ к записи. Сохраняются
            сразу.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={comments.reload}
          disabled={comments.loading || comments.pending}
        >
          Обновить
        </Button>
      </div>
      {[comments.loadError, comments.mutationError]
        .filter(Boolean)
        .map((error, index) => (
          <p
            key={index}
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          >
            {error}
          </p>
        ))}
      {composer.visible && (
        <CommentComposer
          text={composer.text}
          maxLength={comments.result?.maxLength ?? 10000}
          editing={composer.editing !== null}
          canSubmit={composer.canSubmit}
          pending={comments.pending}
          inputRef={composer.inputRef}
          onChange={composer.setText}
          onSubmit={composer.submit}
          onCancel={composer.reset}
        />
      )}
      {comments.loading && (
        <p
          role="status"
          className="py-8 text-center text-sm text-muted-foreground"
        >
          Загрузка комментариев…
        </p>
      )}
      {showComments && comments.result?.data.length === 0 && (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <p className="text-sm font-medium">Здесь пока тихо</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Первый комментарий начнёт обсуждение этой записи.
          </p>
        </div>
      )}
      {showComments && (
        <div className="space-y-3">
          {comments.result?.data.map((comment) => (
            <CommentEntry
              key={comment.id}
              comment={comment}
              editDisabled={!composer.canStartEdit}
              deleteDisabled={
                comments.pending || composer.editing?.id === comment.id
              }
              pending={comments.pending}
              onEdit={() => composer.startEdit(comment)}
              onDelete={() => comments.deleteComment(comment.id)}
            />
          ))}
        </div>
      )}
      {comments.result && pages > 1 && (
        <nav
          aria-label="Страницы комментариев"
          className="flex items-center justify-between gap-3"
        >
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={
              comments.page <= 1 || comments.loading || comments.pending
            }
            onClick={() => comments.changePage(comments.page - 1)}
          >
            Назад
          </Button>
          <span className="text-xs text-muted-foreground">
            Страница {comments.page} из {pages}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={
              comments.page >= pages || comments.loading || comments.pending
            }
            onClick={() => comments.changePage(comments.page + 1)}
          >
            Далее
          </Button>
        </nav>
      )}
    </section>
  );
}
