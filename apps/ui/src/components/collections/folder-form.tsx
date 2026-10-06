"use client";

import { useEditorDraft } from "./editor-lifecycle";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { Input } from "@asmblyr-collaborative/kit/ui/input";
import { Label } from "@/components/ui/label";
import type { CollectionFolder } from "@/components/items/types";
import { useUiCopy } from "@/lib/ui-copy";
import { requestErrorMessage, requestJson } from "@/lib/http-request";

export function FolderForm({
  folder,
  onSaved,
  onCancel,
}: {
  folder?: CollectionFolder;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const copy = useUiCopy();

  const router = useRouter();
  const [name, setName] = useState(folder?.name ?? "");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  useEditorDraft({ name }, pending);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    try {
      await requestJson(
        folder
          ? `/api/folders/${encodeURIComponent(folder.id)}`
          : "/api/folders",
        folder ? "PATCH" : "POST",
        { name },
      );
      onSaved();
      router.refresh();
    } catch (cause) {
      setMessage(copy(requestErrorMessage(cause)));
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    if (
      !folder ||
      !window.confirm(
        copy("Удалить папку «{{value0}}»? Коллекции останутся без папки.", {
          value0: folder.name,
        }),
      )
    )
      return;
    setPending(true);
    setMessage("");
    try {
      await requestJson(
        `/api/folders/${encodeURIComponent(folder.id)}`,
        "DELETE",
      );
      onSaved();
      router.refresh();
    } catch (cause) {
      setMessage(copy(requestErrorMessage(cause)));
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-6"
    >
      <div className="space-y-2">
        <Label htmlFor="folder-name">{copy("Название папки")}</Label>
        <Input
          id="folder-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={120}
          required
          disabled={pending}
          autoFocus
        />
      </div>
      {folder && (
        <p className="text-sm text-muted-foreground">
          {copy(
            "Папка упорядочивает коллекции в интерфейсе. Права доступа задаются для самих коллекций. ",
          )}
        </p>
      )}
      {message && (
        <p
          role="status"
          className="text-sm text-destructive"
        >
          {copy(message)}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="submit"
          disabled={pending}
        >
          {folder ? copy("Сохранить") : copy("Создать папку")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={onCancel}
        >
          {copy("Отмена ")}
        </Button>
        {folder && (
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={remove}
            className="ml-auto text-destructive hover:text-destructive"
          >
            {copy("Удалить папку ")}
          </Button>
        )}
      </div>
    </form>
  );
}
