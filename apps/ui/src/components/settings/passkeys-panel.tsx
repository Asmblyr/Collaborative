"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  startRegistration,
  type PublicKeyCredentialCreationOptionsJSON,
} from "@simplewebauthn/browser";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { Input } from "@asmblyr-collaborative/kit/ui/input";
import { Label } from "@/components/ui/label";
import { requestJson as apiRequest } from "@/lib/http-request";
import { useUiCopy } from "@/lib/ui-copy";

interface Passkey {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
}
export function PasskeysPanel() {
  const copy = useUiCopy();

  const [keys, setKeys] = useState<Passkey[]>([]);
  const [name, setName] = useState(copy("Мой passkey"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void apiRequest<{ data: Passkey[] }>("/api/users/me/passkeys", "GET")
      .then((result) => {
        if (active) {
          setKeys(result.data);
        }
      })
      .catch(() => {
        if (active) {
          setError(copy("Не удалось загрузить passkey"));
        }
      });
    return () => {
      active = false;
    };
  }, [copy]);
  async function act(action: () => Promise<void>) {
    if (busy) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : copy("Не удалось сохранить passkey"),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="mt-7 space-y-3 border-t pt-6">
      <h3 className="font-medium">Passkey</h3>
      <p className="text-sm text-muted-foreground">
        {copy(
          "Вход с подтверждением на устройстве — отпечатком, лицом или PIN. Для изменения способов входа нужен вход за последние пять минут. ",
        )}
      </p>
      <ul className="divide-y">
        {keys.map((key) => (
          <li
            key={key.id}
            className="flex items-center justify-between gap-3 py-2"
          >
            <span className="text-sm">{key.name}</span>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() =>
                act(async () => {
                  await apiRequest(
                    `/api/users/me/passkeys/${encodeURIComponent(key.id)}`,
                    "DELETE",
                  );
                  setKeys((current) =>
                    current.filter((item) => item.id !== key.id),
                  );
                })
              }
            >
              {copy("Удалить ")}
            </Button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-2">
          <Label htmlFor="passkey-name">{copy("Название")}</Label>
          <Input
            id="passkey-name"
            value={name}
            maxLength={120}
            disabled={busy}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <Button
          variant="outline"
          disabled={busy || !name.trim()}
          onClick={() =>
            act(async () => {
              const options = await apiRequest<{
                challengeId: string;
                options: PublicKeyCredentialCreationOptionsJSON;
              }>("/api/users/me/passkeys/options", "POST", {});
              const response = await startRegistration({
                optionsJSON: options.options,
              });
              const result = await apiRequest<{ data: Passkey[] }>(
                "/api/users/me/passkeys",
                "POST",
                { challengeId: options.challengeId, response, name },
              );
              setKeys(result.data);
            })
          }
        >
          {busy ? copy("Ожидаем устройство…") : copy("Добавить passkey")}
        </Button>
      </div>
      {error && (
        <p
          role="alert"
          className="text-sm text-destructive"
        >
          {copy(error)}
        </p>
      )}
      <Button
        size="sm"
        variant="link"
        asChild
      >
        <Link href="/login?reauth=1&next=%2Fsettings%3Ftab%3Dsecurity">
          {copy("Подтвердить вход заново ")}
        </Link>
      </Button>
    </section>
  );
}
