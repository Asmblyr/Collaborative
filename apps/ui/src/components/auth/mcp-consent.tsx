"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { apiRequest } from "@/lib/api-request";
import { useUiCopy } from "@/lib/ui-copy";

function callbackOriginLabel(redirectUri: string): string {
  try {
    const parsed = new URL(redirectUri);
    if (parsed.origin && parsed.origin !== "null") {
      return parsed.origin;
    }
    return parsed.host
      ? `${parsed.protocol}//${parsed.host}${parsed.pathname}`
      : `${parsed.protocol}${parsed.pathname}`;
  } catch {
    return redirectUri;
  }
}

interface Authorization {
  name: string;
  redirectUri: string;
  scopes: string[];
}

export function McpConsent({
  request,
  email,
}: {
  request: string;
  email: string;
}) {
  const copy = useUiCopy();
  const [info, setInfo] = useState<Authorization | null>(null);
  const [write, setWrite] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    void apiRequest<Authorization>(
      `/api/mcp/authorizations/${encodeURIComponent(request)}`,
    )
      .then((result) => {
        if (active) {
          setInfo(result);
        }
      })
      .catch(() => {
        if (active) {
          setError(true);
        }
      });
    return () => {
      active = false;
    };
  }, [request]);

  async function decide(approved: boolean) {
    if (!info || pending) {
      return;
    }
    setPending(true);
    setError(false);
    try {
      const result = await apiRequest<{ redirectUri: string }>(
        `/api/mcp/authorizations/${encodeURIComponent(request)}`,
        "POST",
        { approved, write },
      );
      const target = new URL(result.redirectUri);
      const expected = new URL(info.redirectUri);
      if (
        target.origin !== expected.origin ||
        target.pathname !== expected.pathname
      ) {
        throw new Error("Invalid callback");
      }
      window.location.assign(target.href);
    } catch {
      setError(true);
      setPending(false);
    }
  }

  return (
    <section className="w-full space-y-5 rounded-2xl border bg-card p-6">
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">
          {copy("Подключение MCP-клиента")}
        </h1>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="break-all text-sm text-muted-foreground">{email}</p>
          <Link
            href={`/login?reauth=1&next=${encodeURIComponent(`/mcp/authorize?request=${encodeURIComponent(request)}`)}`}
            className="text-xs font-medium text-primary underline-offset-4 hover:underline"
          >
            {copy("Сменить аккаунт")}
          </Link>
        </div>
      </div>
      {error && (
        <p
          role="alert"
          className="text-sm text-destructive"
        >
          {copy(
            "Не удалось подтвердить подключение. Ссылка могла истечь. Попробуйте подключиться заново.",
          )}
        </p>
      )}
      {!info && !error && <p role="status">{copy("Загрузка…")}</p>}
      {info && (
        <>
          <div>
            <h2 className="break-words font-semibold">{info.name}</h2>
            <p className="mt-1 break-all text-xs text-muted-foreground">
              {callbackOriginLabel(info.redirectUri)}
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            {copy(
              "Коллекции и действия расширений доступны по текущим правам вашего аккаунта. Новые разрешения и ограничения применяются автоматически.",
            )}
          </p>
          <fieldset
            className="space-y-3"
            disabled={pending}
          >
            <legend className="mb-3 font-medium">
              {copy("Права подключения")}
            </legend>
            {[false, ...(info.scopes.includes("mcp:write") ? [true] : [])].map(
              (mode) => (
                <label
                  key={String(mode)}
                  className="flex cursor-pointer items-center gap-3 rounded-md border p-3"
                >
                  <input
                    type="radio"
                    name="mcp-access"
                    checked={write === mode}
                    onChange={() => setWrite(mode)}
                  />
                  <span>
                    {mode ? copy("Чтение и запись") : copy("Только чтение")}
                  </span>
                </label>
              ),
            )}
          </fieldset>
          <p className="text-xs text-muted-foreground">
            {copy(
              "Подключение действует до 30 дней и прекращается при отзыве исходного сеанса. Отозвать его можно в настройках → Приложения.",
            )}
          </p>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => decide(false)}
            >
              {copy("Отмена")}
            </Button>
            <Button
              disabled={pending}
              onClick={() => decide(true)}
            >
              {pending ? copy("Подключение…") : copy("Разрешить")}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
