"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { Input } from "@asmblyr-collaborative/kit/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/api-request";
import type { SessionUser } from "@/lib/session";
import { useUiCopy } from "@/lib/ui-copy";

export function ProfileForm({ user }: { user: SessionUser }) {
  const copy = useUiCopy();

  const router = useRouter();
  const [name, setName] = useState(user.displayName ?? "");
  const [pictureUrl, setPictureUrl] = useState(user.pictureUrl ?? "");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  return (
    <form
      className="space-y-6"
      onSubmit={async (event) => {
        event.preventDefault();
        if (pending) return;
        setPending(true);
        setMessage("");
        setError("");
        try {
          await apiRequest("/api/users/me", "PATCH", {
            displayName: name,
            pictureUrl,
          });
          setMessage(copy("Профиль сохранён"));
          router.refresh();
        } catch (error) {
          setError(
            error instanceof Error
              ? error.message
              : copy("Не удалось сохранить профиль"),
          );
        } finally {
          setPending(false);
        }
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="profile-name">{copy("Имя")}</Label>
        <Input
          id="profile-name"
          autoComplete="name"
          maxLength={120}
          value={name}
          disabled={pending}
          onChange={(event) => setName(event.target.value)}
          placeholder={copy("Как к вам обращаться")}
        />
        <p className="text-xs text-muted-foreground">
          {copy("Будет отображаться в меню пользователя. ")}
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="profile-email">{copy("Электронная почта")}</Label>
        <Input
          id="profile-email"
          value={user.email}
          readOnly
          autoComplete="email"
          className="bg-muted/40"
        />
        <p className="text-xs text-muted-foreground">
          {copy("Используется для входа. Изменение почты пока недоступно. ")}
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="profile-picture">{copy("Изображение профиля")}</Label>
        <Input
          id="profile-picture"
          type="url"
          maxLength={2048}
          value={pictureUrl}
          disabled={pending}
          onChange={(event) => setPictureUrl(event.target.value)}
          placeholder="https://example.com/avatar.jpg"
        />
        <p className="text-xs text-muted-foreground">
          {copy(
            "Необязательная публичная HTTPS-ссылка. Передаётся приложениям при входе через Asmblyr. ",
          )}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={pending}>
          {pending ? copy("Сохраняем…") : copy("Сохранить изменения")}
        </Button>
        {message && (
          <p
            role="status"
            className="text-sm text-muted-foreground"
          >
            {copy(message)}
          </p>
        )}
      </div>
      {error && (
        <p
          role="alert"
          className="text-sm text-destructive"
        >
          {copy(error)}
        </p>
      )}
    </form>
  );
}
