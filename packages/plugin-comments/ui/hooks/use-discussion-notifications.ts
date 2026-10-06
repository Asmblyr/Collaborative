"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { RecordPanelProps } from "@asmblyr-collaborative/kit/ui";
import type { Comment } from "../../shared/comments.js";
import { createCommentsClient } from "../api/comments.ts";

export function useDiscussionNotifications(
  { record, request, targetId }: RecordPanelProps,
  revision: number,
) {
  const api = useMemo(
    () =>
      createCommentsClient(request, {
        collection: record.collection,
        item: record.id,
      }),
    [request, record.collection, record.id],
  );
  const [following, setFollowing] = useState<boolean | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [focus, setFocus] = useState<{
    target: string;
    revision: number;
    comment: Comment | null;
    missing: boolean;
  } | null>(null);
  const changing = useRef(false);
  const subscriptionVersion = useRef(0);
  useEffect(() => {
    const controller = new AbortController();
    const version = ++subscriptionVersion.current;
    api
      .following(controller.signal)
      .then((result) => {
        if (
          !controller.signal.aborted &&
          subscriptionVersion.current === version
        )
          setFollowing(result.enabled);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted && cause instanceof Error)
          setError(cause.message);
      });
    return () => controller.abort();
  }, [api, revision]);
  useEffect(() => {
    if (!targetId) return;
    const controller = new AbortController();
    api
      .get(targetId, controller.signal)
      .then((comment) => {
        if (!controller.signal.aborted)
          setFocus({ target: targetId, revision, comment, missing: false });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setFocus({
            target: targetId,
            revision,
            comment: null,
            missing: true,
          });
      });
    return () => controller.abort();
  }, [api, targetId, revision]);
  async function toggle(): Promise<void> {
    if (following === null || changing.current) return;
    changing.current = true;
    subscriptionVersion.current += 1;
    setPending(true);
    setError("");
    try {
      const result = await api.follow(!following);
      setFollowing(result.enabled);
    } catch (cause) {
      if (cause instanceof Error) setError(cause.message);
    } finally {
      changing.current = false;
      setPending(false);
    }
  }
  const currentFocus =
    focus && focus.target === targetId && focus.revision === revision
      ? focus
      : null;
  return {
    following,
    pending,
    error,
    focused: currentFocus?.comment ?? null,
    focusMissing: currentFocus?.missing ?? false,
    toggle,
  };
}
