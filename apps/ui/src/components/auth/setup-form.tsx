"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { Input } from "@asmblyr-collaborative/kit/ui/input";
import { Label } from "@/components/ui/label";
import { useUiCopy } from "@/lib/ui-copy";

export function SetupForm() {
  const copy = useUiCopy();

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
      setMessage(copy("Пароли не совпадают"));
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
            ? copy("Суперпользователь уже создан. Обновите страницу.")
            : response.status === 401
              ? copy("Неверный установочный секрет")
              : (result.message ?? copy("Не удалось завершить настройку")),
        );
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setMessage(copy("Не удалось связаться с сервером"));
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
        <Label htmlFor="setup-email">{copy("Электронная почта")}</Label>
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
        <Label htmlFor="setup-password">{copy("Пароль")}</Label>
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
        <p className="text-xs text-muted-foreground">
          {copy("Не менее 12 символов.")}
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="setup-confirmation">{copy("Повторите пароль")}</Label>
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
        <Label htmlFor="setup-token">{copy("Установочный секрет")}</Label>
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
          {copy("Возьмите значение ASMBLYR_SETUP_TOKEN из конфигурации Core. ")}
        </p>
      </div>
      {message && (
        <p
          role="alert"
          className="text-sm text-destructive"
        >
          {copy(message)}
        </p>
      )}
      <Button
        type="submit"
        disabled={pending}
        className="w-full"
      >
        {pending ? copy("Создаём…") : copy("Создать суперпользователя")}
      </Button>
    </form>
  );
}
