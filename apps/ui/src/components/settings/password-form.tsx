"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@asmblyr/kit/ui/button";
import { Input } from "@asmblyr/kit/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/api-request";

export function PasswordForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  return (
    <form
      className="space-y-5"
      onSubmit={async (event) => {
        event.preventDefault();
        if (pending) return;
        const form = event.currentTarget;
        const data = new FormData(form);
        if (data.get("newPassword") !== data.get("confirm")) {
          setError("Новые пароли не совпадают");
          return;
        }
        setPending(true);
        setError("");
        try {
          await apiRequest("/api/users/me/password", "POST", {
            currentPassword: data.get("currentPassword"),
            newPassword: data.get("newPassword"),
          });
          form.reset();
          router.replace("/login");
          router.refresh();
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Не удалось изменить пароль";
          setError(
            message === "Invalid credentials"
              ? "Текущий пароль неверен или сеанс истёк."
              : message === "Choose a different password"
                ? "Новый пароль должен отличаться от текущего."
                : message,
          );
          setPending(false);
        }
      }}
    >
      <fieldset
        disabled={pending}
        className="space-y-5"
      >
        <div className="space-y-2">
          <Label htmlFor="current-password">Текущий пароль</Label>
          <Input
            id="current-password"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
            maxLength={1024}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="new-password">Новый пароль</Label>
          <Input
            id="new-password"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            maxLength={1024}
          />
          <p className="text-xs text-muted-foreground">Не менее 12 символов.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm-password">Повторите новый пароль</Label>
          <Input
            id="confirm-password"
            name="confirm"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            maxLength={1024}
          />
        </div>
      </fieldset>
      <p className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
        После смены пароля все сеансы будут завершены. Войдите снова с новым
        паролем.
      </p>
      {error && (
        <p
          role="alert"
          className="text-sm text-destructive"
        >
          {error}
        </p>
      )}
      <Button disabled={pending}>
        {pending ? "Меняем пароль…" : "Изменить пароль"}
      </Button>
    </form>
  );
}
