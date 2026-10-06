"use client";

import { useState } from "react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@asmblyr-collaborative/kit/ui/select";
import { Label } from "@/components/ui/label";
import type { StoredFile } from "./types";
import { useUiCopy } from "@/lib/ui-copy";

export function FileVisibility({
  file,
  value,
  disabled,
  onChange,
}: {
  file: StoredFile;
  value: "private" | "public";
  disabled: boolean;
  onChange(value: "private" | "public"): void;
}) {
  const copy = useUiCopy();

  const [message, setMessage] = useState("");
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(
        new URL(`/api/public/files/${file.id}/content`, window.location.origin)
          .href,
      );
      setMessage(copy("Ссылка скопирована"));
    } catch {
      setMessage(copy("Не удалось скопировать ссылку"));
    }
  }
  return (
    <div className="space-y-2">
      <Label htmlFor="file-visibility">{copy("Доступ по ссылке")}</Label>
      <Select
        value={value}
        disabled={disabled}
        onValueChange={(next) => onChange(next as "private" | "public")}
      >
        <SelectTrigger
          id="file-visibility"
          className="h-9 w-full"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="private">
            {copy("Только с авторизацией")}
          </SelectItem>
          <SelectItem value="public">
            {copy("Любой, у кого есть ссылка")}
          </SelectItem>
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        {copy(
          "Изменение действует после сохранения. Отзыв ссылки прекращает новые скачивания; уже скачанный файл остаётся у получателя. ",
        )}
      </p>
      {file.visibility === "public" && file.status === "ready" && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => void copyLink()}
        >
          {copy("Копировать публичную ссылку ")}
        </Button>
      )}
      {message && (
        <p
          role="status"
          className="text-xs text-muted-foreground"
        >
          {copy(message)}
        </p>
      )}
    </div>
  );
}
