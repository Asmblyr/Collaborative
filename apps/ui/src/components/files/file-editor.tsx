"use client";
import { useState } from "react";
import { Download, Trash2 } from "lucide-react";
import { Button } from "@asmblyr/kit/ui/button";
import { Input } from "@asmblyr/kit/ui/input";
import { Textarea } from "@asmblyr/kit/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@asmblyr/kit/ui/tabs";
import { apiRequest } from "@/lib/api-request";
import { FilePreview } from "./file-preview";
import { FileHistory } from "./file-history";
import { fileSize, fileStatus, type StoredFile } from "./types";

export function FileEditor({
  file,
  onChange,
  onDelete,
  onBusy,
  readOnly = false,
}: {
  file: StoredFile;
  onChange: (file: StoredFile) => void;
  onDelete: () => void;
  onBusy: (value: boolean) => void;
  readOnly?: boolean;
}) {
  const [title, setTitle] = useState(file.title),
    [description, setDescription] = useState(file.description);
  const [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [confirm, setConfirm] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);
  async function mutate(remove: boolean) {
    if (readOnly) {
      return;
    }
    setPending(true);
    onBusy(true);
    setError("");
    try {
      if (remove) {
        await apiRequest(`/api/files/${file.id}`, "DELETE");
        onDelete();
      } else {
        const saved = await apiRequest<StoredFile>(
          `/api/files/${file.id}`,
          "PATCH",
          { title, description },
        );
        onChange(saved);
        setHistoryKey((n) => n + 1);
      }
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Не удалось сохранить файл",
      );
      if (remove) {
        try {
          onChange(await apiRequest<StoredFile>(`/api/files/${file.id}`));
        } catch {
          /* Keep retry available. */
        }
      }
    } finally {
      setPending(false);
      onBusy(false);
    }
  }
  return (
    <Tabs
      defaultValue="details"
      className="gap-6"
    >
      <TabsList>
        <TabsTrigger value="details">Файл</TabsTrigger>
        <TabsTrigger value="history">История</TabsTrigger>
      </TabsList>
      <TabsContent
        value="details"
        className="space-y-6"
      >
        <FilePreview file={file} />
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            void mutate(false);
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="file-title">Название</Label>
            <Input
              id="file-title"
              value={title}
              maxLength={255}
              required
              disabled={pending || readOnly || file.status !== "ready"}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="file-description">Описание</Label>
            <Textarea
              id="file-description"
              value={description}
              maxLength={4000}
              rows={3}
              disabled={pending || readOnly || file.status !== "ready"}
              placeholder="Добавьте контекст для команды"
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Имя файла</dt>
            <dd className="min-w-0 break-all">{file.filename}</dd>
            <dt className="text-muted-foreground">Тип</dt>
            <dd className="break-all">{file.mimeType}</dd>
            <dt className="text-muted-foreground">Размер</dt>
            <dd>{fileSize(file.size)}</dd>
            <dt className="text-muted-foreground">Загружен</dt>
            <dd>{new Date(file.createdAt).toLocaleString("ru-RU")}</dd>
            <dt className="text-muted-foreground">Статус</dt>
            <dd>{fileStatus[file.status]}</dd>
          </dl>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={
                pending ||
                readOnly ||
                file.status !== "ready" ||
                (title === file.title && description === file.description)
              }
            >
              {pending ? "Сохраняем…" : "Сохранить"}
            </Button>
            {file.status === "ready" && (
              <Button
                asChild
                variant="outline"
              >
                <a
                  href={`/api/files/${file.id}/content`}
                  download
                >
                  <Download aria-hidden />
                  Скачать
                </a>
              </Button>
            )}
          </div>
        </form>
        {!readOnly && (
          <div className="border-t pt-5">
            {!confirm ? (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive"
                disabled={pending}
                onClick={() => setConfirm(true)}
              >
                <Trash2 aria-hidden />
                Удалить файл
              </Button>
            ) : (
              <div className="space-y-3 rounded-lg border border-destructive/30 p-4">
                <p className="text-sm">
                  Удалить «{file.filename}»? Файл будет удалён из хранилища без
                  возможности восстановления.
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="destructive"
                    disabled={pending}
                    onClick={() => void mutate(true)}
                  >
                    Удалить
                  </Button>
                  <Button
                    variant="outline"
                    disabled={pending}
                    onClick={() => setConfirm(false)}
                  >
                    Отмена
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
        {error && (
          <p
            role="alert"
            className="text-sm text-destructive"
          >
            {error}
          </p>
        )}
      </TabsContent>
      <TabsContent value="history">
        <FileHistory
          key={historyKey}
          id={file.id}
        />
      </TabsContent>
    </Tabs>
  );
}
