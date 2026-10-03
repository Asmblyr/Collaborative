"use client";

import { useState } from "react";
import { Copy, KeyRound } from "lucide-react";
import { Button } from "@asmblyr/kit/ui/button";
import { Input } from "@asmblyr/kit/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@asmblyr/kit/ui/select";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/api-request";
import type { ServiceKey } from "./types";

const date = (value: string) => new Date(value).toLocaleDateString("ru-RU");

export function ServiceKeys({
  readOnly = false,
  accountId,
  active,
  initialKeys,
  portalContainer,
  onBusy,
}: {
  readOnly?: boolean;
  accountId: string;
  active: boolean;
  initialKeys: ServiceKey[];
  portalContainer: HTMLDialogElement | null;
  onBusy: (busy: boolean) => void;
}) {
  const [keys, setKeys] = useState(initialKeys);
  const [name, setName] = useState("");
  const [days, setDays] = useState("90");
  const [secret, setSecret] = useState("");
  const [copied, setCopied] = useState(false);
  const [pending, setPending] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (readOnly || pending || secret) {
      return;
    }
    setPending(true);
    onBusy(true);
    setError("");
    try {
      const result = await apiRequest<ServiceKey & { secret: string }>(
        `/api/service-accounts/${accountId}/keys`,
        "POST",
        { name, expiresInDays: Number(days) },
      );
      const { secret: issued, ...metadata } = result;
      setKeys((current) => [metadata, ...current]);
      setSecret(issued);
      setCopied(false);
      setName("");
      // Keep the dialog open until the user acknowledges the one-time credential.
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Не удалось создать ключ",
      );
      onBusy(false);
    } finally {
      setPending(false);
    }
  }

  async function revoke(id: string) {
    if (readOnly || pending) {
      return;
    }
    setPending(true);
    onBusy(true);
    setError("");
    try {
      await apiRequest(
        `/api/service-accounts/${accountId}/keys/${id}`,
        "DELETE",
      );
      setKeys((current) =>
        current.map((key) =>
          key.id === id ? { ...key, revokedAt: new Date().toISOString() } : key,
        ),
      );
      setConfirm(null);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Не удалось отозвать ключ",
      );
    } finally {
      setPending(false);
      onBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <p className="text-sm leading-6 text-muted-foreground">
        Создайте ключ для приложения или автоматизации. Несколько ключей
        позволяют заменить старый без перерыва в работе.
      </p>
      {secret ? (
        <section
          className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4"
          aria-label="Новый сервисный ключ"
        >
          <h3 className="font-semibold">Сохраните ключ сейчас</h3>
          <p className="text-sm text-muted-foreground">
            После закрытия этого блока увидеть его повторно нельзя.
          </p>
          <Input
            readOnly
            value={secret}
            aria-label="Сервисный ключ"
            className="font-mono text-xs"
            onFocus={(event) => event.target.select()}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(secret);
                  setCopied(true);
                } catch {
                  setError(
                    "Не удалось скопировать. Выделите и сохраните ключ вручную.",
                  );
                }
              }}
            >
              <Copy className="size-4" />
              {copied ? "Скопировано" : "Копировать"}
            </Button>
            <Button
              type="button"
              onClick={() => {
                setSecret("");
                onBusy(false);
              }}
            >
              Ключ сохранён
            </Button>
          </div>
        </section>
      ) : active && !readOnly ? (
        <form
          onSubmit={create}
          className="space-y-4 rounded-xl border p-4"
        >
          <h3 className="flex items-center gap-2 font-medium">
            <KeyRound className="size-4" />
            Новый ключ
          </h3>
          <div className="space-y-2">
            <Label htmlFor="key-name">Название ключа</Label>
            <Input
              id="key-name"
              placeholder="Например, production"
              required
              maxLength={120}
              value={name}
              disabled={pending}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-2">
              <Label htmlFor="key-expiry">Срок действия</Label>
              <Select
                value={days}
                onValueChange={setDays}
                disabled={pending}
              >
                <SelectTrigger id="key-expiry">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent container={portalContainer}>
                  {[7, 30, 90, 180, 365].map((value) => (
                    <SelectItem
                      key={value}
                      value={String(value)}
                    >
                      {value} дней
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button disabled={pending}>
              {pending ? "Создаём…" : "Создать ключ"}
            </Button>
          </div>
        </form>
      ) : !active && !readOnly ? (
        <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
          Аккаунт отключён. Включите его, чтобы выпускать новые ключи.
        </p>
      ) : null}
      {error && (
        <p
          role="alert"
          className="text-sm text-destructive"
        >
          {error}
        </p>
      )}
      <div className="space-y-3">
        <h3 className="text-sm font-medium">
          Ключи аккаунта{" "}
          <span className="text-muted-foreground">· {keys.length}</span>
        </h3>
        {keys.length === 0 && (
          <p className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">
            Пока нет ключей
          </p>
        )}
        {keys.map((key) => {
          const expired = new Date(key.expiresAt) <= new Date();
          return (
            <section
              key={key.id}
              className="space-y-3 rounded-xl border p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="break-all text-sm font-medium">{key.name}</h4>
                <Badge variant="secondary">
                  {key.revokedAt ? "Отозван" : expired ? "Истёк" : "Действует"}
                </Badge>
              </div>
              <code className="text-xs text-muted-foreground">
                {key.prefix}…
              </code>
              <div className="space-y-1 text-xs text-muted-foreground">
                <p>
                  Создан {date(key.createdAt)} · до {date(key.expiresAt)}
                </p>
                <p>
                  Последний обмен на токен:{" "}
                  {key.lastUsedAt ? date(key.lastUsedAt) : "ещё не использован"}
                </p>
              </div>
              {!readOnly && !key.revokedAt && !expired && (
                <div className="flex flex-wrap items-center gap-2">
                  {confirm === key.id ? (
                    <>
                      <p className="w-full text-xs text-destructive">
                        Выданные по этому ключу токены сразу перестанут
                        работать.
                      </p>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={pending || Boolean(secret)}
                        onClick={() => revoke(key.id)}
                      >
                        Подтвердить отзыв
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => setConfirm(null)}
                      >
                        Отмена
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending || Boolean(secret)}
                      onClick={() => setConfirm(key.id)}
                    >
                      Отозвать ключ
                    </Button>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>
      <details className="rounded-lg border p-4 text-sm">
        <summary className="cursor-pointer font-medium">
          Как подключить приложение
        </summary>
        <div className="mt-3 space-y-3 text-muted-foreground">
          <p>
            Отправьте ключ в Core: <code>POST /auth/service-token</code>
          </p>
          <pre className="overflow-x-auto rounded bg-muted p-3 text-xs">
            {'{ "key": "<сервисный ключ>" }'}
          </pre>
          <p>
            В ответе придёт <code>accessToken</code> со сроком до 15 минут.
            Передавайте его в <code>Authorization: Bearer …</code>. По истечении
            срока получите новый токен тем же способом.
          </p>
        </div>
      </details>
    </div>
  );
}
