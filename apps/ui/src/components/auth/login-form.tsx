"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { Input } from "@asmblyr-collaborative/kit/ui/input";
import { Label } from "@/components/ui/label";
import { PasskeyLogin } from "./passkey-login";
import { useUiCopy } from "@/lib/ui-copy";

export function LoginForm({ next = "/" }: { next?: string }) {
  const copy = useUiCopy();

  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        setMessage(
          response.status === 401
            ? copy("Неверная почта или пароль")
            : (((await response.json()) as { message?: string }).message ??
                copy("Не удалось войти")),
        );
        return;
      }
      router.replace(next);
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
        <Label htmlFor="login-email">{copy("Электронная почта")}</Label>
        <Input
          id="login-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={pending}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="login-password">{copy("Пароль")}</Label>
        <Input
          id="login-password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={pending}
        />
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
        className="w-full"
        disabled={pending}
      >
        {pending ? copy("Входим…") : copy("Войти")}
      </Button>
      <PasskeyLogin next={next} />
    </form>
  );
}
