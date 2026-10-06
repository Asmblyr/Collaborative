"use client";

import { useState } from "react";
import { Copy, KeyRound } from "lucide-react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { Input } from "@asmblyr-collaborative/kit/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@asmblyr-collaborative/kit/ui/select";
import { ServiceKeyCard } from "./service-key-card";
import { apiRequest } from "@/lib/api-request";
import type { ServiceKey } from "./types";
import { useUiCopy } from "@/lib/ui-copy";

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
  const copy = useUiCopy();
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
        error instanceof Error
          ? error.message
          : copy("Не удалось создать ключ"),
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
        error instanceof Error
          ? error.message
          : copy("Не удалось отозвать ключ"),
      );
    } finally {
      setPending(false);
      onBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <p className="text-sm leading-6 text-muted-foreground">
        {copy(
          "Создайте ключ для приложения или автоматизации. Несколько ключей позволяют заменить старый без перерыва в работе. ",
        )}
      </p>
      {secret ? (
        <section
          className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4"
          aria-label={copy("Новый сервисный ключ")}
        >
          <h3 className="font-semibold">{copy("Сохраните ключ сейчас")}</h3>
          <p className="text-sm text-muted-foreground">
            {copy("После закрытия этого блока увидеть его повторно нельзя. ")}
          </p>
          <Input
            readOnly
            value={secret}
            aria-label={copy("Сервисный ключ")}
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
                    copy(
                      "Не удалось скопировать. Выделите и сохраните ключ вручную.",
                    ),
                  );
                }
              }}
            >
              <Copy className="size-4" />
              {copied ? copy("Скопировано") : copy("Копировать")}
            </Button>
            <Button
              type="button"
              onClick={() => {
                setSecret("");
                onBusy(false);
              }}
            >
              {copy("Ключ сохранён ")}
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
            {copy("Новый ключ ")}
          </h3>
          <div className="space-y-2">
            <Label htmlFor="key-name">{copy("Название ключа")}</Label>
            <Input
              id="key-name"
              placeholder={copy("Например, production")}
              required
              maxLength={120}
              value={name}
              disabled={pending}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-2">
              <Label htmlFor="key-expiry">{copy("Срок действия")}</Label>
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
                      {value} {copy(" дней ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button disabled={pending}>
              {pending ? copy("Создаём…") : copy("Создать ключ")}
            </Button>
          </div>
        </form>
      ) : !active && !readOnly ? (
        <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
          {copy(
            "Аккаунт отключён. Включите его, чтобы выпускать новые ключи. ",
          )}
        </p>
      ) : null}
      {error && (
        <p
          role="alert"
          className="text-sm text-destructive"
        >
          {copy(error)}
        </p>
      )}
      <div className="space-y-3">
        <h3 className="text-sm font-medium">
          {copy("Ключи аккаунта")}{" "}
          <span className="text-muted-foreground">· {keys.length}</span>
        </h3>
        {keys.length === 0 && (
          <p className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">
            {copy("Пока нет ключей ")}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          {copy(
            "Счётчик учитывает запросы с токенами ключа с момента включения статистики. Получение токена не учитывается.",
          )}
        </p>
        {keys.map((key) => (
          <ServiceKeyCard
            key={key.id}
            serviceKey={key}
            readOnly={readOnly}
            pending={pending}
            secretVisible={Boolean(secret)}
            confirming={confirm === key.id}
            onConfirm={(value) => setConfirm(value ? key.id : null)}
            onRevoke={() => void revoke(key.id)}
          />
        ))}
      </div>
      <details className="rounded-lg border p-4 text-sm">
        <summary className="cursor-pointer font-medium">
          {copy("Как подключить приложение ")}
        </summary>
        <div className="mt-3 space-y-3 text-muted-foreground">
          <p>
            {copy("Отправьте ключ в Core: ")}
            <code>POST /auth/service-token</code>
          </p>
          <pre className="overflow-x-auto rounded bg-muted p-3 text-xs">
            {copy('{ "key": "<сервисный ключ>" }')}
          </pre>
          <p>
            {copy("В ответе придёт ")}
            <code>accessToken</code>{" "}
            {copy(" со сроком до 15 минут. Передавайте его в ")}
            <code>Authorization: Bearer …</code>
            {copy(
              ". По истечении срока получите новый токен тем же способом. ",
            )}
          </p>
        </div>
      </details>
    </div>
  );
}
