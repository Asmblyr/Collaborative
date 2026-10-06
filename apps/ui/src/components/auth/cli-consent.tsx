"use client";
import { useState } from "react";
import { Code2 } from "lucide-react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { useUiCopy } from "@/lib/ui-copy";
export function CliConsent({
  input,
  email,
}: {
  input: {
    redirectUri: string;
    challenge: string;
    state: string;
  };
  email: string;
}) {
  const copy = useUiCopy();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  function callback(): URL | null {
    try {
      const url = new URL(input.redirectUri);
      return url.protocol === "http:" &&
        url.hostname === "127.0.0.1" &&
        url.port &&
        url.pathname === "/callback" &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash &&
        url.href === input.redirectUri &&
        /^[A-Za-z0-9_-]{43}$/.test(input.state) &&
        /^[A-Za-z0-9_-]{43}$/.test(input.challenge)
        ? url
        : null;
    } catch {
      return null;
    }
  }
  const valid = Boolean(callback());
  async function approve() {
    if (pending || !valid) {
      return;
    }
    setPending(true);
    setError(false);
    try {
      const response = await fetch("/api/auth/cli/authorize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!response.ok) {
        throw new Error("Authorization failed");
      }
      const { data } = await response.json();
      const target = new URL(data.redirectTo);
      const expected = callback();
      if (
        !expected ||
        target.origin !== expected.origin ||
        target.pathname !== expected.pathname ||
        target.searchParams.get("state") !== input.state
      ) {
        throw new Error("Invalid callback");
      }
      window.location.assign(target.href);
    } catch {
      setError(true);
      setPending(false);
    }
  }
  function cancel() {
    const url = callback();
    if (!url) {
      return;
    }
    url.searchParams.set("state", input.state);
    url.searchParams.set("error", "access_denied");
    window.location.assign(url.href);
  }
  return (
    <section className="w-full space-y-5 rounded-2xl border bg-card p-6 shadow-sm">
      <Code2 className="size-6 text-primary" />
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">{copy("Подключить SDK")}</h1>
        <p className="text-sm text-muted-foreground">{email}</p>
      </div>
      <p className="text-sm text-muted-foreground">
        {copy(
          "Разрешить CLI получить структуру доступных коллекций и контракты плагинов для генерации типов. Доступ действует 10 минут и не позволяет читать или изменять записи.",
        )}
      </p>
      {!valid && (
        <p
          role="alert"
          className="text-sm text-destructive"
        >
          {copy(
            "Ссылка подключения недействительна. Запустите команду заново.",
          )}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="text-sm text-destructive"
        >
          {copy("Не удалось подключить SDK. Попробуйте ещё раз.")}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={pending || !valid}
          onClick={cancel}
        >
          {copy("Отмена")}
        </Button>
        <Button
          size="sm"
          disabled={pending || !valid}
          onClick={approve}
        >
          {pending ? copy("Подключение…") : copy("Разрешить")}
        </Button>
      </div>
    </section>
  );
}
