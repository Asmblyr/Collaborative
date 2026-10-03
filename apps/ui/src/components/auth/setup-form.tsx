"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@asmblyr/kit/ui/button";
import { Input } from "@asmblyr/kit/ui/input";
import { Label } from "@/components/ui/label";

export function SetupForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [setupToken, setSetupToken] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirmation) {
      setMessage("Пароли не совпадают");
      return;
    }
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/auth/setup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, setupToken }),
      });
      if (!response.ok) {
        const result = (await response.json()) as { message?: string };
        setMessage(
          response.status === 409
            ? "Суперпользователь уже создан. Обновите страницу."
            : response.status === 401
              ? "Неверный установочный секрет"
              : (result.message ?? "Не удалось завершить настройку"),
        );
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setMessage("Не удалось связаться с сервером");
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-5"
    >
      <div className="space-y-2">
        <Label htmlFor="setup-email">Электронная почта</Label>
        <Input
          id="setup-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={pending}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="setup-password">Пароль</Label>
        <Input
          id="setup-password"
          type="password"
          autoComplete="new-password"
          minLength={12}
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={pending}
        />
        <p className="text-xs text-muted-foreground">Не менее 12 символов.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="setup-confirmation">Повторите пароль</Label>
        <Input
          id="setup-confirmation"
          type="password"
          autoComplete="new-password"
          minLength={12}
          required
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          disabled={pending}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="setup-token">Установочный секрет</Label>
        <Input
          id="setup-token"
          type="password"
          autoComplete="off"
          required
          value={setupToken}
          onChange={(event) => setSetupToken(event.target.value)}
          disabled={pending}
        />
        <p className="text-xs text-muted-foreground">
          Возьмите значение ASMBLYR_SETUP_TOKEN из конфигурации Core.
        </p>
      </div>
      {message && (
        <p
          role="alert"
          className="text-sm text-destructive"
        >
          {message}
        </p>
      )}
      <Button
        type="submit"
        disabled={pending}
        className="w-full"
      >
        {pending ? "Создаём…" : "Создать суперпользователя"}
      </Button>
    </form>
  );
}
