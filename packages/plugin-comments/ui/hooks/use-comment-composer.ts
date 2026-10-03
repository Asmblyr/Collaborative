"use client";

import { useEffect, useRef, useState } from "react";
import type { RecordPanelProps } from "@asmblyr/kit/ui";
import { type Comment } from "../../shared/comments.ts";

interface ComposerOptions {
  canCreate: boolean;
  maxLength: number;
  pending: boolean;
  createComment(text: string): Promise<boolean>;
  updateComment(id: string, text: string): Promise<boolean>;
  onStateChange: RecordPanelProps["onStateChange"];
}

/** Owns the draft and every rule that can enable or submit the form. */
export function useCommentComposer({
  canCreate,
  maxLength,
  pending,
  createComment,
  updateComment,
  onStateChange,
}: ComposerOptions) {
  const [text, setText] = useState("");
  const [editing, setEditing] = useState<Comment | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const body = text.trim();
  const dirty = text !== (editing?.body ?? "");
  const allowed = editing ? editing.canEdit : canCreate;
  const canSubmit =
    allowed && !pending && dirty && body.length > 0 && body.length <= maxLength;
  const canStartEdit = !pending && !dirty && editing === null;

  useEffect(() => {
    onStateChange({ dirty, busy: pending });
  }, [dirty, pending, onStateChange]);

  function reset() {
    setText("");
    setEditing(null);
  }

  async function submit() {
    if (!canSubmit) {
      return;
    }
    const saved = editing
      ? await updateComment(editing.id, body)
      : await createComment(body);
    if (saved) {
      reset();
    }
  }

  function startEdit(comment: Comment) {
    if (!canStartEdit || !comment.canEdit) {
      return;
    }
    setEditing(comment);
    setText(comment.body);
    inputRef.current?.focus();
  }

  return {
    text,
    editing,
    inputRef,
    canSubmit,
    canStartEdit,
    visible: canCreate || editing !== null || text.length > 0,
    setText,
    reset,
    submit,
    startEdit,
  };
}
