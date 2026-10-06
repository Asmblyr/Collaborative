"use client";

import { useRef, useState } from "react";
import { Upload, UserRound, X } from "lucide-react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { FilePicker } from "@/components/files/file-picker";
import { userAvatarUrl } from "@/lib/user-profile";
import { useUiCopy } from "@/lib/ui-copy";

export function ProfileAvatar({
  avatarId,
  pictureUrl,
  canUpload,
  canChoose,
  disabled,
  onChange,
  onBusy,
  container,
}: {
  avatarId: string | null;
  pictureUrl: string | null;
  canUpload: boolean;
  canChoose: boolean;
  disabled: boolean;
  onChange(id: string | null): void;
  onBusy(value: boolean): void;
  container?: HTMLElement | null;
}) {
  const copy = useUiCopy();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<string | undefined>();
  async function upload(file: File) {
    if (file.size > 2 * 1024 * 1024) {
      setError(copy("Изображение должно быть не больше 2 МБ"));
      return;
    }
    onBusy(true);
    setError("");
    try {
      const response = await fetch("/api/users/me/avatar", {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "x-file-name": encodeURIComponent(file.name),
          "x-file-type": file.type,
        },
        body: file,
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message || copy("Не удалось загрузить аватар"));
      }
      onChange(result.data.id);
      const reader = new FileReader();
      reader.onload = () =>
        setPreview(
          typeof reader.result === "string" ? reader.result : undefined,
        );
      reader.readAsDataURL(file);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : copy("Не удалось загрузить аватар"),
      );
    } finally {
      onBusy(false);
    }
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <Avatar className="size-14">
          <AvatarImage
            src={
              avatarId && preview
                ? preview
                : userAvatarUrl({ avatarId, pictureUrl })
            }
            alt=""
            referrerPolicy="no-referrer"
          />
          <AvatarFallback>
            <UserRound
              aria-hidden="true"
              className="size-6"
            />
          </AvatarFallback>
        </Avatar>
        {canUpload && (
          <>
            <input
              ref={input}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              className="hidden"
              disabled={disabled}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) {
                  void upload(file);
                }
              }}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={() => input.current?.click()}
            >
              <Upload className="size-4" />
              {copy("Загрузить аватар")}
            </Button>
          </>
        )}
        {canChoose && (
          <FilePicker
            selected={avatarId ? [avatarId] : []}
            multiple={false}
            disabled={disabled}
            container={container}
            onBusy={onBusy}
            onChoose={(files) => {
              if (!files[0]) {
                return;
              }
              if (!files[0].previewable) {
                setError(copy("Выберите изображение"));
                return;
              }
              setPreview(undefined);
              onChange(files[0].id);
            }}
          />
        )}
        {avatarId && (
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            disabled={disabled}
            aria-label={copy("Убрать аватар")}
            onClick={() => {
              setPreview(undefined);
              onChange(null);
            }}
          >
            <X />
          </Button>
        )}
      </div>
      {error && (
        <p
          role="alert"
          className="text-sm text-destructive"
        >
          {error}
        </p>
      )}
    </div>
  );
}
