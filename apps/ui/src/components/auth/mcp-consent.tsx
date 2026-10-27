"use client";

import { useEffect, useState } from "react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { apiRequest } from "@/lib/api-request";
import { useUiCopy } from "@/lib/ui-copy";

interface Authorization {
  name: string;
  redirectUri: string;
  scopes: string[];
  collections: { id: string; name: string; label: string }[];
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
  const [selected, setSelected] = useState<string[]>([]);
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
        { approved, write, collectionIds: selected },
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
        <p className="break-all text-sm text-muted-foreground">{email}</p>
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
      {!info && !error && <p role="status">{copy("Загрузка… ")}</p>}
      {info && (
        <>
          <div>
            <h2 className="break-words font-semibold">{info.name}</h2>
            <p className="mt-1 break-all text-xs text-muted-foreground">
              {new URL(info.redirectUri).origin}
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            {copy(
              "Клиент сможет читать схемы, записи и аналитику выбранных коллекций в пределах ваших текущих прав.",
            )}
          </p>
          <fieldset
            className="space-y-3"
            disabled={pending}
          >
            <legend className="mb-3 font-medium">
              {copy("Доступные коллекции")}
            </legend>
            {info.collections.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {copy(
                  "Нет доступных коллекций. Администратор должен разрешить MCP и выдать вам права чтения.",
                )}
              </p>
            )}
            {info.collections.map((collection) => (
              <label
                key={collection.id}
                className="flex cursor-pointer items-center gap-3 rounded-md border p-3"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(collection.id)}
                  onChange={(event) =>
                    setSelected((current) =>
                      event.target.checked
                        ? [...current, collection.id]
                        : current.filter((id) => id !== collection.id),
                    )
                  }
                />
                <span>{collection.label}</span>
              </label>
            ))}
          </fieldset>
          {info.scopes.includes("mcp:write") && (
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-1"
                checked={write}
                disabled={pending}
                onChange={(event) => setWrite(event.target.checked)}
              />
              <span className="text-sm">
                {copy(
                  "Разрешить создание и изменение записей, если это разрешено моими правами",
                )}
              </span>
            </label>
          )}
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
              disabled={pending || !selected.length}
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
