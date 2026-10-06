"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Download, X } from "lucide-react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { apiRequest } from "@/lib/api-request";
import { arrayDraft } from "@/components/items/item-input-values";
import { FilePicker } from "./file-picker";
import { FilePreview } from "./file-preview";
import { fileSize, type StoredFile } from "./types";
import { useUiCopy } from "@/lib/ui-copy";

export function FileField({
  value,
  multiple,
  disabled = false,
  canChoose = false,
  container,
  onChange,
  onBusy = () => {},
}: {
  value: string;
  multiple: boolean;
  disabled?: boolean;
  canChoose?: boolean;
  container?: HTMLElement | null;
  onChange?: (value: string) => void;
  onBusy?: (busy: boolean) => void;
}) {
  const copy = useUiCopy();

  const ids = multiple ? arrayDraft(value) : value ? [value] : [];
  const key = ids.join(",");
  const [metadata, setMetadata] = useState<Map<string, StoredFile>>(
    () => new Map(),
  );
  const [settledKey, setSettledKey] = useState(""),
    [error, setError] = useState("");
  const loading = Boolean(key && key !== settledKey);
  const [uploading, setUploading] = useState(false);
  useEffect(() => {
    if (!key) return;
    let active = true;
    apiRequest<StoredFile[]>(
      `/api/files/resolve?ids=${encodeURIComponent(key)}`,
    )
      .then((result) => {
        if (active) {
          setMetadata(
            (previous) =>
              new Map([
                ...previous,
                ...result.map((f): [string, StoredFile] => [f.id, f]),
              ]),
          );
          setError("");
        }
      })
      .catch(() => {
        if (active) setError(copy("Не удалось загрузить сведения о вложениях"));
      })
      .finally(() => {
        if (active) setSettledKey(key);
      });
    return () => {
      active = false;
    };
  }, [key, copy]);
  const update = (next: string[]) =>
    onChange?.(multiple ? JSON.stringify(next) : (next[0] ?? ""));
  const editable = Boolean(onChange) && !disabled && !uploading;
  return (
    <div
      className="space-y-3"
      aria-busy={loading || uploading}
    >
      {ids.length > 0 && (
        <div className="space-y-2">
          {ids.map((id, index) => {
            const file = metadata.get(id);
            return (
              <div
                key={id}
                className="flex items-center gap-3 rounded-lg border p-2"
              >
                {file && (
                  <FilePreview
                    file={file}
                    compact
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">
                    {file?.title || copy("Вложение")}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {file ? fileSize(file.size, copy) : id}
                  </p>
                </div>
                {file?.status === "ready" && (
                  <Button
                    asChild
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                  >
                    <a
                      href={`/api/files/${id}/content`}
                      download
                      aria-label={copy("Скачать {{value0}}", {
                        value0: file.title,
                      })}
                    >
                      <Download />
                    </a>
                  </Button>
                )}
                {editable && multiple && (
                  <div className="flex">
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      disabled={index === 0}
                      aria-label={copy("Переместить файл выше")}
                      onClick={() => {
                        const next = [...ids];
                        [next[index - 1], next[index]] = [
                          next[index],
                          next[index - 1],
                        ];
                        update(next);
                      }}
                    >
                      <ArrowUp />
                    </Button>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      disabled={index === ids.length - 1}
                      aria-label={copy("Переместить файл ниже")}
                      onClick={() => {
                        const next = [...ids];
                        [next[index + 1], next[index]] = [
                          next[index],
                          next[index + 1],
                        ];
                        update(next);
                      }}
                    >
                      <ArrowDown />
                    </Button>
                  </div>
                )}
                {editable && (
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label={copy("Отвязать файл")}
                    onClick={() => update(ids.filter((entry) => entry !== id))}
                  >
                    <X />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
      {!ids.length && (
        <p className="text-sm text-muted-foreground">{copy("Нет вложений")}</p>
      )}
      {canChoose && onChange && (
        <FilePicker
          multiple={multiple}
          selected={ids}
          disabled={!editable}
          container={container}
          onBusy={(busy) => {
            setUploading(busy);
            onBusy(busy);
          }}
          onChoose={(files) => {
            setMetadata(
              (previous) =>
                new Map([
                  ...previous,
                  ...files.map((f): [string, StoredFile] => [f.id, f]),
                ]),
            );
            update(
              multiple
                ? [...new Set([...ids, ...files.map((f) => f.id)])]
                : [files[0].id],
            );
          }}
        />
      )}
      {error && (
        <p
          role="alert"
          className="text-xs text-destructive"
        >
          {copy(error)}
        </p>
      )}
      {ids.length === 1 && metadata.get(ids[0])?.previewable && (
        <FilePreview file={metadata.get(ids[0])!} />
      )}
    </div>
  );
}
