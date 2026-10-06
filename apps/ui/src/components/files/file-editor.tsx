"use client";
import { useState } from "react";
import { Download, Trash2 } from "lucide-react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { Input } from "@asmblyr-collaborative/kit/ui/input";
import { Textarea } from "@asmblyr-collaborative/kit/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@asmblyr-collaborative/kit/ui/tabs";
import { apiRequest } from "@/lib/api-request";
import { FilePreview } from "./file-preview";
import { FileHistory } from "./file-history";
import { FileVisibility } from "./file-visibility";
import { fileSize, fileStatus, type StoredFile } from "./types";
import { useUiCopy } from "@/lib/ui-copy";

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
  const copy = useUiCopy();

  const [title, setTitle] = useState(file.title),
    [description, setDescription] = useState(file.description);
  const [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [confirm, setConfirm] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);
  const [visibility, setVisibility] = useState<"private" | "public">(
    file.visibility ?? "private",
  );
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
          { title, description, visibility },
        );
        onChange(saved);
        setHistoryKey((n) => n + 1);
      }
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : copy("Не удалось сохранить файл"),
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
        <TabsTrigger value="details">{copy("Файл")}</TabsTrigger>
        <TabsTrigger value="history">{copy("История")}</TabsTrigger>
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
            <Label htmlFor="file-title">{copy("Название")}</Label>
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
            <Label htmlFor="file-description">{copy("Описание")}</Label>
            <Textarea
              id="file-description"
              value={description}
              maxLength={4000}
              rows={3}
              disabled={pending || readOnly || file.status !== "ready"}
              placeholder={copy("Добавьте контекст для команды")}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <FileVisibility
            file={file}
            value={visibility}
            disabled={pending || readOnly || file.status !== "ready"}
            onChange={setVisibility}
          />
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            <dt className="text-muted-foreground">{copy("Имя файла")}</dt>
            <dd className="min-w-0 break-all">{file.filename}</dd>
            <dt className="text-muted-foreground">{copy("Тип")}</dt>
            <dd className="break-all">{file.mimeType}</dd>
            <dt className="text-muted-foreground">{copy("Размер")}</dt>
            <dd>{fileSize(file.size, copy)}</dd>
            <dt className="text-muted-foreground">{copy("Загружен")}</dt>
            <dd>
              {new Date(file.createdAt).toLocaleString(
                copy.locale === "en" ? "en-US" : "ru-RU",
              )}
            </dd>
            <dt className="text-muted-foreground">{copy("Статус")}</dt>
            <dd>{copy(fileStatus[file.status])}</dd>
          </dl>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={
                pending ||
                readOnly ||
                file.status !== "ready" ||
                (title === file.title &&
                  description === file.description &&
                  visibility === (file.visibility ?? "private"))
              }
            >
              {pending ? copy("Сохраняем…") : copy("Сохранить")}
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
                  {copy("Скачать ")}
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
                {copy("Удалить файл ")}
              </Button>
            ) : (
              <div className="space-y-3 rounded-lg border border-destructive/30 p-4">
                <p className="text-sm">
                  {copy("Удалить «")}
                  {file.filename}
                  {copy(
                    "»? Файл будет удалён из хранилища без возможности восстановления. ",
                  )}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="destructive"
                    disabled={pending}
                    onClick={() => void mutate(true)}
                  >
                    {copy("Удалить ")}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={pending}
                    onClick={() => setConfirm(false)}
                  >
                    {copy("Отмена ")}
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
            {copy(error)}
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
