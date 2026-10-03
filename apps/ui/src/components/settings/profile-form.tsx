"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@asmblyr/kit/ui/button";
import { Input } from "@asmblyr/kit/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/api-request";
import type { SessionUser } from "@/lib/session";

export function ProfileForm({ user }: { user: SessionUser }) {
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
          setMessage("Профиль сохранён");
          router.refresh();
        } catch (error) {
          setError(
            error instanceof Error
              ? error.message
              : "Не удалось сохранить профиль",
          );
        } finally {
          setPending(false);
        }
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="profile-name">Имя</Label>
        <Input
          id="profile-name"
          autoComplete="name"
          maxLength={120}
          value={name}
          disabled={pending}
          onChange={(event) => setName(event.target.value)}
          placeholder="Как к вам обращаться"
        />
        <p className="text-xs text-muted-foreground">
          Будет отображаться в меню пользователя.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="profile-email">Электронная почта</Label>
        <Input
          id="profile-email"
          value={user.email}
          readOnly
          autoComplete="email"
          className="bg-muted/40"
        />
        <p className="text-xs text-muted-foreground">
          Используется для входа. Изменение почты пока недоступно.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="profile-picture">Изображение профиля</Label>
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
          Необязательная публичная HTTPS-ссылка. Передаётся приложениям при
          входе через Asmblyr.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={pending}>
          {pending ? "Сохраняем…" : "Сохранить изменения"}
        </Button>
        {message && (
          <p
            role="status"
            className="text-sm text-muted-foreground"
          >
            {message}
          </p>
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
    </form>
  );
}
