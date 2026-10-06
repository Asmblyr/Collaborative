"use client";

import { usePluginTranslations } from "@asmblyr-collaborative/kit/ui/i18n";

import { Button } from "@asmblyr-collaborative/kit/ui/button";
import type { RecordPanelProps } from "@asmblyr-collaborative/kit/ui";
import { useComments } from "../hooks/use-comments.ts";
import { useCommentComposer } from "../hooks/use-comment-composer.ts";
import { CommentComposer } from "./comment-composer.tsx";
import { CommentEntry } from "./comment-entry.tsx";
import { useDiscussionNotifications } from "../hooks/use-discussion-notifications.ts";

export function CommentsPanel(props: RecordPanelProps) {
  const { t } = usePluginTranslations("comments");
  const comments = useComments(props);
  const notices = useDiscussionNotifications(props, comments.revision);
  const composer = useCommentComposer({
    canCreate: comments.result?.canCreate ?? false,
    maxLength: comments.result?.maxLength ?? 10000,
    pending: comments.pending || notices.pending,
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
      aria-label={t("panel.label")}
      className="space-y-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">
            {t("panel.heading")}
            {comments.result ? ` · ${total}` : ""}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("panel.hint")}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-pressed={notices.following === true}
            title={t("follow.hint")}
            disabled={
              notices.following === null || notices.pending || comments.pending
            }
            onClick={() => void notices.toggle()}
          >
            {notices.following ? t("following") : t("follow")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={comments.reload}
            disabled={comments.loading || comments.pending}
          >
            {t("refresh")}
          </Button>
        </div>
      </div>
      {[comments.loadError, comments.mutationError, notices.error]
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
      {notices.focusMissing && (
        <p
          role="status"
          className="text-sm text-muted-foreground"
        >
          {t("focus.missing")}
        </p>
      )}
      {showComments &&
        notices.focused &&
        !comments.result?.data.some(
          (comment) => comment.id === notices.focused?.id,
        ) && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              {t("focus.title")}
            </p>
            <CommentEntry
              comment={notices.focused}
              highlighted={props.active !== false}
              editDisabled={!composer.canStartEdit}
              deleteDisabled={
                comments.pending || composer.editing?.id === notices.focused.id
              }
              pending={comments.pending}
              onEdit={() =>
                notices.focused && composer.startEdit(notices.focused)
              }
              onDelete={() =>
                notices.focused
                  ? comments.deleteComment(notices.focused.id)
                  : Promise.resolve(false)
              }
            />
          </div>
        )}
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
          {t("loading")}
        </p>
      )}
      {showComments && comments.result?.data.length === 0 && (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <p className="text-sm font-medium">{t("empty.title")}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("empty.hint")}
          </p>
        </div>
      )}
      {showComments && (
        <div className="space-y-3">
          {comments.result?.data.map((comment) => (
            <CommentEntry
              key={comment.id}
              comment={comment}
              highlighted={
                props.active !== false && comment.id === props.targetId
              }
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
          aria-label={t("pages.label")}
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
            {t("pages.previous")}
          </Button>
          <span className="text-xs text-muted-foreground">
            {t("pages.counter", undefined, { page: comments.page, pages })}
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
            {t("pages.next")}
          </Button>
        </nav>
      )}
    </section>
  );
}
