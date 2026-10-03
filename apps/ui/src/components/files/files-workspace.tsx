"use client";
import { useRef, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { Upload, FolderOpen, RefreshCw, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EditorDialog } from "@/components/collections/editor-dialog";
import { Button } from "@asmblyr/kit/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ItemPagination } from "@/components/items/item-pagination";
import { FileEditor } from "./file-editor";
import { FilePreview } from "./file-preview";
import { fileSize, fileStatus, type FilePage, type StoredFile } from "./types";

export function FilesWorkspace({
  result,
  query,
}: {
  result: FilePage;
  query: string;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const uploadLock = useRef(false);
  const [selected, setSelected] = useState<StoredFile | null>(null);
  const [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState("");
  const [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const disabled =
    Boolean(uploading) ||
    !result.meta.storageConfigured ||
    !result.meta.canManage;

  function navigate(page: number, limit = result.meta.limit) {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });
    if (query) params.set("q", query);
    router.push(`/files?${params}`, { scroll: false });
  }
  async function upload(chosen: File[]) {
    if (disabled || uploadLock.current || !chosen.length) return;
    setError("");
    setMessage("");
    if (chosen.length > 20) {
      setError("Выберите не более 20 файлов за раз.");
      return;
    }
    const oversized = chosen.find(
      (file) => file.size > result.meta.maxFileBytes,
    );
    if (oversized) {
      setError(
        `«${oversized.name}» больше ${fileSize(result.meta.maxFileBytes)}.`,
      );
      return;
    }
    uploadLock.current = true;
    let completed = 0;
    try {
      for (const file of chosen) {
        setUploading(`${completed + 1} из ${chosen.length} · ${file.name}`);
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
          const body = await response.json().catch(() => ({}));
          throw new Error(
            `${file.name}: ${body.message ?? "Не удалось загрузить файл"}`,
          );
        }
        completed++;
      }
      setMessage(`Загружено файлов: ${completed}`);
      if (result.meta.page !== 1) navigate(1);
    } catch (reason) {
      setError(
        `${reason instanceof Error ? reason.message : "Ошибка загрузки"}${completed ? ` Уже загружено: ${completed}.` : ""}`,
      );
    } finally {
      uploadLock.current = false;
      setUploading("");
      router.refresh();
    }
  }
  function drop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    void upload(Array.from(event.dataTransfer.files));
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Файлы"
        description="Изображения, документы и материалы вашей команды."
      >
        <Button
          variant="outline"
          size="icon"
          aria-label="Обновить файлы"
          onClick={() => router.refresh()}
        >
          <RefreshCw aria-hidden />
        </Button>
        <Button
          disabled={disabled}
          onClick={() => input.current?.click()}
        >
          {uploading ? (
            <Loader2
              className="animate-spin"
              aria-hidden
            />
          ) : (
            <Upload aria-hidden />
          )}
          Загрузить файлы
        </Button>
        <input
          ref={input}
          className="sr-only"
          tabIndex={-1}
          aria-label="Выберите файлы для загрузки"
          type="file"
          multiple
          disabled={disabled}
          onChange={(event) => {
            void upload(Array.from(event.target.files ?? []));
            event.target.value = "";
          }}
        />
      </PageHeader>
      {!result.meta.storageConfigured && (
        <p
          role="status"
          className="rounded-xl border bg-muted/40 p-4 text-sm text-muted-foreground"
        >
          Загрузка недоступна: хранилище ещё не подключено.
        </p>
      )}
      {uploading && (
        <p
          role="status"
          className="flex items-center gap-2 text-sm"
        >
          <Loader2 className="size-4 animate-spin" />
          Загружаем {uploading}
        </p>
      )}
      {message && (
        <p
          role="status"
          className="text-sm text-muted-foreground"
        >
          {message}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="text-sm text-destructive"
        >
          {error}
        </p>
      )}
      <section
        aria-label="Библиотека файлов"
        onDrop={drop}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node))
            setDragging(false);
        }}
        className={`overflow-hidden rounded-xl border transition-colors ${dragging ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "bg-card"}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3 text-xs text-muted-foreground">
          <span>
            {query
              ? `Результаты поиска: ${query}`
              : `Всего файлов: ${result.meta.total}`}
          </span>
          <span>
            Перетащите файлы сюда · до {fileSize(result.meta.maxFileBytes)}{" "}
            каждый
          </span>
        </div>
        {!result.data.length ? (
          <div className="flex min-h-80 flex-col items-center justify-center gap-3 px-6 py-14 text-center">
            <div className="mb-1 flex size-14 items-center justify-center rounded-2xl bg-muted">
              <FolderOpen className="size-6 text-muted-foreground" />
            </div>
            <h2 className="font-medium">
              {query ? "Файлы не найдены" : "Здесь будут ваши файлы"}
            </h2>
            <p className="max-w-sm text-sm text-muted-foreground">
              {query
                ? "Попробуйте другое название в поле поиска."
                : "Добавьте изображения и документы. У каждого файла будут своё название, описание и история изменений."}
            </p>
            {!query && (
              <Button
                className="mt-2"
                variant="outline"
                disabled={disabled}
                onClick={() => input.current?.click()}
              >
                <Upload aria-hidden />
                Выбрать файлы
              </Button>
            )}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5">Название</TableHead>
                <TableHead>Тип</TableHead>
                <TableHead>Размер</TableHead>
                <TableHead>Загружен</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.data.map((file) => (
                <TableRow
                  key={file.id}
                  className="cursor-pointer"
                  onClick={() => setSelected(file)}
                >
                  <TableCell className="pl-5">
                    <div className="flex items-center gap-3 py-1">
                      <FilePreview
                        file={file}
                        compact
                      />
                      <div className="min-w-0">
                        <button
                          className="max-w-[45vw] truncate text-left font-medium hover:underline sm:max-w-lg"
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelected(file);
                          }}
                        >
                          {file.title}
                        </button>
                        <p className="max-w-[45vw] truncate text-xs text-muted-foreground sm:max-w-lg">
                          {file.filename}
                        </p>
                      </div>
                      {file.status !== "ready" && (
                        <Badge
                          variant={
                            file.status === "failed"
                              ? "destructive"
                              : "secondary"
                          }
                        >
                          {fileStatus[file.status]}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {file.mimeType}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {fileSize(file.size)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {new Date(file.createdAt).toLocaleDateString("ru-RU")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
      {result.meta.total > 0 && (
        <ItemPagination
          page={{
            number: result.meta.page,
            size: result.meta.limit,
            total: String(result.meta.total),
            sort: "created_at",
            direction: "desc",
          }}
          pathname="/files"
          q={query}
          filter=""
          onPage={(page) => navigate(page)}
          onSize={(limit) => navigate(1, limit)}
        />
      )}
      <EditorDialog
        open={Boolean(selected)}
        title={selected?.title ?? "Файл"}
        eyebrow="Библиотека файлов"
        busy={busy}
        onClose={() => {
          if (!busy) setSelected(null);
        }}
      >
        {(_, close) =>
          selected && (
            <FileEditor
              key={selected.id}
              file={selected}
              readOnly={!result.meta.canManage}
              onBusy={setBusy}
              onChange={(file) => {
                setSelected(file);
                router.refresh();
              }}
              onDelete={() => {
                close();
                router.refresh();
              }}
            />
          )
        }
      </EditorDialog>
    </div>
  );
}
