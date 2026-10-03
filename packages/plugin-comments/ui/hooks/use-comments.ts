"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RecordPanelProps } from "@asmblyr/kit/ui";
import type { CommentPage } from "../../shared/comments.js";
import { createCommentsClient } from "../api/comments.ts";

export function useComments({
  record,
  request,
}: Pick<RecordPanelProps, "record" | "request">) {
  const api = useMemo(
    () =>
      createCommentsClient(request, {
        collection: record.collection,
        item: record.id,
      }),
    [request, record.collection, record.id],
  );
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<CommentPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [mutationError, setMutationError] = useState("");
  const [revision, setRevision] = useState(0);
  const operationInProgress = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    api
      .list(page, controller.signal)
      .then((response) => {
        if (controller.signal.aborted) return;
        setResult(response);
        setLoadError("");
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setLoadError(
          cause instanceof Error
            ? cause.message
            : "Не удалось загрузить комментарии",
        );
        setResult(null);
        setLoading(false);
      });
    return () => controller.abort();
  }, [api, page, revision]);

  const reload = useCallback(() => {
    setLoadError("");
    setLoading(true);
    setRevision((value) => value + 1);
  }, []);

  async function save(
    operation: () => Promise<unknown>,
    nextPage: number,
  ): Promise<boolean> {
    if (operationInProgress.current) return false;
    operationInProgress.current = true;
    setPending(true);
    setMutationError("");
    try {
      await operation();
      setPage(nextPage);
      reload();
      return true;
    } catch (cause) {
      setMutationError(
        cause instanceof Error
          ? cause.message
          : "Не удалось изменить комментарий",
      );
      return false;
    } finally {
      operationInProgress.current = false;
      setPending(false);
    }
  }

  function createComment(text: string): Promise<boolean> {
    return save(() => api.create(text), 1);
  }

  function updateComment(id: string, text: string): Promise<boolean> {
    return save(() => api.update(id, text), page);
  }

  function deleteComment(id: string): Promise<boolean> {
    const removesLastOnPage = page > 1 && result?.data.length === 1;
    return save(() => api.delete(id), removesLastOnPage ? page - 1 : page);
  }

  function changePage(next: number) {
    setLoading(true);
    setPage(next);
  }

  return {
    result,
    loading,
    pending,
    loadError,
    mutationError,
    page,
    changePage,
    reload,
    createComment,
    updateComment,
    deleteComment,
  };
}
