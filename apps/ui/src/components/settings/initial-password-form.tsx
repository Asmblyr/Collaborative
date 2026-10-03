"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@asmblyr/kit/ui/button";
import { Input } from "@asmblyr/kit/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/api-request";
export function InitialPasswordForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  return (
    <form
      className="space-y-3"
      onSubmit={async (event) => {
        event.preventDefault();
        if (pending) {
          return;
        }
        const form = event.currentTarget;
        const values = new FormData(form);
        if (values.get("password") !== values.get("confirm")) {
          setError("Пароли не совпадают");
          return;
        }
        setPending(true);
        setError("");
        try {
          await apiRequest("/api/users/me/password/setup", "POST", {
            password: values.get("password"),
          });
          form.reset();
          router.refresh();
        } catch (failure) {
          setError(
            failure instanceof Error
              ? failure.message
              : "Не удалось задать пароль",
          );
        } finally {
          setPending(false);
        }
      }}
    >
      <p className="text-sm text-muted-foreground">
        Пароль необязателен, если используете passkey или SSO.
      </p>
      <div className="space-y-2">
        <Label htmlFor="initial-password">Пароль</Label>
        <Input
          id="initial-password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={1024}
          required
          disabled={pending}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="initial-confirm">Повторите пароль</Label>
        <Input
          id="initial-confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={1024}
          required
          disabled={pending}
        />
      </div>
      {error && (
        <p
          role="alert"
          className="text-sm text-destructive"
        >
          {error}
        </p>
      )}
      <Button
        variant="outline"
        disabled={pending}
      >
        Добавить пароль
      </Button>
    </form>
  );
}
