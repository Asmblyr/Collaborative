"use client";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@asmblyr/kit/ui/button";
import { Input } from "@asmblyr/kit/ui/input";
import { Label } from "@/components/ui/label";
export function InvitationForm() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [fromLink, setFromLink] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const value = new URLSearchParams(window.location.hash.slice(1)).get(
      "token",
    );
    if (value) {
      queueMicrotask(() => {
        setToken(value);
        setFromLink(true);
      });
    }
    window.history.replaceState(null, "", window.location.pathname);
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) {
      return;
    }
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/auth/invitations/claim", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!response.ok) {
        setMessage(
          "Ссылка недействительна или срок истёк. Попросите администратора выдать новую.",
        );
        return;
      }
      setToken("");
      router.replace("/settings?tab=security");
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
      {!fromLink && (
        <div className="space-y-2">
          <Label htmlFor="invite-token">Код из ссылки</Label>
          <Input
            id="invite-token"
            type="password"
            autoComplete="off"
            required
            value={token}
            onChange={(event) => setToken(event.target.value)}
            disabled={pending}
          />
        </div>
      )}
      {token.startsWith("asm_rec_") && (
        <p className="text-sm text-muted-foreground">
          Восстановление завершит старые сеансы и сбросит способы входа. После
          входа добавьте новый passkey или пароль.
        </p>
      )}
      <p className="text-sm text-muted-foreground">
        После входа настройте passkey или пароль, чтобы возвращаться в аккаунт.
      </p>
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
        disabled={pending || !token}
      >
        {pending ? "Входим…" : "Принять приглашение и войти"}
      </Button>
    </form>
  );
}
