"use client";

import { useRef, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { showToast } from "@/components/ui/toast";
import { fileSize, type FilePage } from "./types";
import { useUiCopy } from "@/lib/ui-copy";

export function useFileUploads({
  meta,
  onFirstPage,
}: {
  meta: FilePage["meta"];
  onFirstPage: () => void;
}) {
  const copy = useUiCopy();
  const router = useRouter();
  const uploadLock = useRef(false);

  const [uploading, setUploading] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);

  const disabled =
    Boolean(uploading) || !meta.storageConfigured || !meta.canManage;

  async function upload(chosen: File[]) {
    if (disabled || uploadLock.current || !chosen.length) {
      return;
    }
    setError("");
    setMessage("");

    if (chosen.length > 20) {
      setError(copy("Выберите не более 20 файлов за раз."));
      return;
    }

    const oversized = chosen.find((file) => file.size > meta.maxFileBytes);
    if (oversized) {
      setError(
        copy("«{{value0}}» больше {{value1}}.", {
          value0: oversized.name,
          value1: fileSize(meta.maxFileBytes, copy),
        }),
      );
      return;
    }

    uploadLock.current = true;
    let completed = 0;

    try {
      for (const file of chosen) {
        setUploading(
          copy("{{value0}} из {{value1}} · {{value2}}", {
            value0: completed + 1,
            value1: chosen.length,
            value2: file.name,
          }),
        );
        const response = await fetch("/api/files", {
          method: "POST",
          body: file,
          headers: {
            "content-type": "application/octet-stream",
            "x-file-name": encodeURIComponent(file.name),
            "x-file-type": file.type || "application/octet-stream",
          },
        });
        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as {
            message?: string;
          };
          throw new Error(
            copy("{{value0}}: {{value1}}", {
              value0: file.name,
              value1: body.message ?? copy("Не удалось загрузить файл"),
            }),
          );
        }
        completed += 1;
      }

      const uploadedText = copy("Загружено файлов: {{value0}}", {
        value0: completed,
      });
      setMessage(uploadedText);
      showToast(uploadedText, "success");
      if (meta.page !== 1) {
        onFirstPage();
      }
    } catch (reason) {
      setError(
        copy("{{value0}}{{value1}}", {
          value0:
            reason instanceof Error ? reason.message : copy("Ошибка загрузки"),
          value1: completed
            ? ` ${copy("Уже загружено: {{value0}}.", { value0: completed })}`
            : "",
        }),
      );
    } finally {
      uploadLock.current = false;
      setUploading("");
      router.refresh();
    }
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    void upload(Array.from(event.dataTransfer.files));
  }

  function handleDragOver(event: DragEvent) {
    event.preventDefault();
    if (!disabled) {
      setDragging(true);
    }
  }

  function handleDragLeave(event: DragEvent<HTMLElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node)) {
      setDragging(false);
    }
  }

  return {
    uploading,
    message,
    error,
    dragging,
    disabled,
    upload,
    handleDrop,
    handleDragOver,
    handleDragLeave,
  };
}
