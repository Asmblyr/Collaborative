"use client";

import { useEditorDraft } from "./editor-lifecycle";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@asmblyr/kit/ui/button";
import { Input } from "@asmblyr/kit/ui/input";
import { Label } from "@/components/ui/label";
import type { CollectionFolder } from "@/components/items/types";

export function FolderForm({
  folder,
  onSaved,
  onCancel,
}: {
  folder?: CollectionFolder;
  onSaved: () => void;
  onCancel: () => void;
}) {
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
      const response = await fetch(
        folder ? `/api/folders/${encodeURIComponent(folder.id)}` : "/api/folders",
        {
          method: folder ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name }),
        },
      );
      if (!response.ok) {
        const result = (await response.json()) as { message?: string };
        setMessage(result.message ?? "Не удалось сохранить папку");
        return;
      }
      onSaved();
      router.refresh();
    } catch {
      setMessage("Не удалось связаться с сервером");
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    if (
      !folder ||
      !window.confirm(`Удалить папку «${folder.name}»? Коллекции останутся без папки.`)
    )
      return;
    setPending(true);
    setMessage("");
    try {
      const response = await fetch(`/api/folders/${encodeURIComponent(folder.id)}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const result = (await response.json()) as { message?: string };
        setMessage(result.message ?? "Не удалось удалить папку");
        return;
      }
      onSaved();
      router.refresh();
    } catch {
      setMessage("Не удалось связаться с сервером");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="folder-name">Название папки</Label>
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
          Папка упорядочивает коллекции в интерфейсе. Права доступа задаются для самих коллекций.
        </p>
      )}
      {message && (
        <p role="status" className="text-sm text-destructive">
          {message}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending}>
          {folder ? "Сохранить" : "Создать папку"}
        </Button>
        <Button type="button" variant="ghost" disabled={pending} onClick={onCancel}>
          Отмена
        </Button>
        {folder && (
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={remove}
            className="ml-auto text-destructive hover:text-destructive"
          >
            Удалить папку
          </Button>
        )}
      </div>
    </form>
  );
}
