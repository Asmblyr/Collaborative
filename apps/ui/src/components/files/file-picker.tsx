"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Plus, Upload } from "lucide-react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { Input } from "@asmblyr-collaborative/kit/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { FilePreview } from "./file-preview";
import { fileSize, type FilePage, type StoredFile } from "./types";
import { useUiCopy } from "@/lib/ui-copy";

export function FilePicker({
  selected,
  multiple,
  disabled,
  container,
  onChoose,
  onBusy,
}: {
  selected: string[];
  multiple: boolean;
  disabled: boolean;
  container?: HTMLElement | null;
  onChoose: (files: StoredFile[]) => void;
  onBusy: (busy: boolean) => void;
}) {
  const copy = useUiCopy();

  const [open, setOpen] = useState(false),
    [query, setQuery] = useState("");
  const [page, setPage] = useState(1),
    [result, setResult] = useState<FilePage | null>(null);
  const [loading, setLoading] = useState(false),
    [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null),
    lock = useRef(false);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(
          `/api/files?${new URLSearchParams({ search: query, page: String(page), limit: "20" })}`,
          { signal: controller.signal },
        );
        if (!response.ok)
          throw new Error(copy("Не удалось загрузить библиотеку"));
        setResult((await response.json()) as FilePage);
      } catch (reason) {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error ? reason.message : copy("Ошибка загрузки"),
          );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, query, page, copy]);

  async function upload(files: File[]) {
    if (!result || lock.current || !files.length) return;
    if (files.length > (multiple ? Math.min(20, 100 - selected.length) : 1)) {
      setError(copy("Выбрано слишком много файлов"));
      return;
    }
    if (files.some((file) => file.size > result.meta.maxFileBytes)) {
      setError(
        copy("Размер файла — до {{value0}}", {
          value0: fileSize(result.meta.maxFileBytes, copy),
        }),
      );
      return;
    }
    lock.current = true;
    setUploading(true);
    onBusy(true);
    setError("");
    const completed: StoredFile[] = [];
    try {
      for (const file of files) {
        const response = await fetch("/api/files", {
          method: "POST",
          body: file,
          headers: {
            "content-type": "application/octet-stream",
            "x-file-name": encodeURIComponent(file.name),
            "x-file-type": file.type || "application/octet-stream",
          },
        });
        const body = await response.json();
        if (!response.ok)
          throw new Error(body.message || copy("Не удалось загрузить файл"));
        completed.push(body.data as StoredFile);
      }
      setOpen(false);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : copy("Ошибка загрузки"),
      );
    } finally {
      if (completed.length) onChoose(completed);
      lock.current = false;
      setUploading(false);
      onBusy(false);
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(value) => {
        if (!uploading) setOpen(value);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || uploading}
        >
          <Plus aria-hidden />
          {multiple ? copy("Добавить файлы") : copy("Выбрать файл")}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        container={container}
        align="start"
        className="w-[min(420px,calc(100vw-3rem))] space-y-3 p-3"
      >
        <Input
          aria-label={copy("Поиск файлов")}
          placeholder={copy("Найти файл…")}
          value={query}
          disabled={uploading}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(1);
          }}
        />
        <div
          className="max-h-72 overflow-auto"
          aria-busy={loading}
        >
          {loading ? (
            <p className="flex items-center gap-2 p-4 text-sm">
              <Loader2 className="size-4 animate-spin" />
              {copy("Загрузка… ")}
            </p>
          ) : (
            result?.data
              .filter((file) => file.status === "ready")
              .map((file) => (
                <Button
                  type="button"
                  key={file.id}
                  variant="ghost"
                  className="h-auto w-full justify-start gap-3 p-2 text-left"
                  disabled={
                    uploading ||
                    selected.includes(file.id) ||
                    (multiple && selected.length >= 100)
                  }
                  onClick={() => {
                    onChoose([file]);
                    setOpen(false);
                  }}
                >
                  <FilePreview
                    file={file}
                    compact
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{file.title}</span>
                    <span className="block text-xs font-normal text-muted-foreground">
                      {fileSize(file.size, copy)}
                    </span>
                  </span>
                  {selected.includes(file.id) && <Check className="size-4" />}
                </Button>
              ))
          )}
          {!loading && result && !result.data.length && (
            <p className="p-4 text-sm text-muted-foreground">
              {copy("Файлы не найдены ")}
            </p>
          )}
        </div>
        {result && result.meta.total > 20 && (
          <div className="flex items-center justify-between text-xs">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={page === 1 || loading || uploading}
              onClick={() => setPage(page - 1)}
            >
              {copy("Назад ")}
            </Button>
            <span>
              {page} / {Math.ceil(result.meta.total / 20)}
            </span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={page * 20 >= result.meta.total || loading || uploading}
              onClick={() => setPage(page + 1)}
            >
              {copy("Далее ")}
            </Button>
          </div>
        )}
        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={
            uploading ||
            !result?.meta.storageConfigured ||
            !result?.meta.canManage ||
            (multiple && selected.length >= 100)
          }
          onClick={() => input.current?.click()}
        >
          {uploading ? <Loader2 className="animate-spin" /> : <Upload />}
          {copy("Загрузить с устройства ")}
        </Button>
        <input
          ref={input}
          type="file"
          multiple={multiple}
          className="sr-only"
          tabIndex={-1}
          aria-label={copy("Загрузить вложения")}
          disabled={uploading}
          onChange={(event) => {
            void upload(Array.from(event.target.files ?? []));
            event.target.value = "";
          }}
        />
        {error && (
          <p
            role="alert"
            className="text-xs text-destructive"
          >
            {copy(error)}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
