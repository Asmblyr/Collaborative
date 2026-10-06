"use client";

import { useEffect, useState } from "react";
import { Link2 } from "lucide-react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/api-request";
import type { LinkedIdentity, LoginProvider } from "@/lib/sso";
import { useUiCopy } from "@/lib/ui-copy";

export function IdentitiesPanel({ providers }: { providers: LoginProvider[] }) {
  const copy = useUiCopy();

  const [identities, setIdentities] = useState<LinkedIdentity[] | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void apiRequest<LinkedIdentity[]>("/api/users/me/identities")
      .then((data) => {
        if (active) setIdentities(data);
      })
      .catch(() => {
        if (active)
          setError(
            copy("Не удалось загрузить способы входа. Обновите страницу."),
          );
      });
    return () => {
      active = false;
    };
  }, [copy]);

  async function unlink(id: string) {
    setPending(true);
    setError("");
    try {
      await apiRequest(`/api/users/me/identities/${id}`, "DELETE");
      setIdentities(
        (current) => current?.filter((identity) => identity.id !== id) ?? null,
      );
      setConfirm(null);
    } catch {
      setError(
        copy(
          "Не удалось отключить провайдера. Должен остаться хотя бы один доступный способ входа.",
        ),
      );
    } finally {
      setPending(false);
    }
  }

  const entries = [
    ...providers.map((provider) => ({
      ...provider,
      identity: identities?.find((row) => row.provider === provider.id),
    })),
    ...(identities ?? [])
      .filter(
        (row) => !providers.some((provider) => provider.id === row.provider),
      )
      .map((identity) => ({
        id: identity.provider,
        label: identity.label,
        identity,
      })),
  ];
  return (
    <section className="mt-8 space-y-4 border-t pt-6">
      <div>
        <h2 className="font-semibold">{copy("Подключённые аккаунты")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {copy(
            "Добавьте ещё один способ входа в свой аккаунт. Почта и права доступа останутся прежними. ",
          )}
        </p>
      </div>
      {error && (
        <p
          role="alert"
          className="text-sm text-destructive"
        >
          {copy(error)}
        </p>
      )}
      {identities === null && !error && (
        <p className="text-sm text-muted-foreground">{copy("Загрузка…")}</p>
      )}
      {identities && !entries.length && (
        <p className="text-sm text-muted-foreground">
          {copy("Провайдеры входа пока не настроены. ")}
        </p>
      )}
      {identities &&
        entries.map(({ id, label, identity }) => (
          <div
            key={id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"
          >
            <div className="flex items-center gap-3">
              <Link2 className="size-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{label}</p>
                {identity && (
                  <Badge
                    variant="secondary"
                    className="mt-1"
                  >
                    {identity.available
                      ? copy("Подключён")
                      : copy("Провайдер отключён")}
                  </Badge>
                )}
              </div>
            </div>
            {identity ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => setConfirm(identity.id)}
              >
                {copy("Отключить ")}
              </Button>
            ) : (
              <form
                action={`/sign/sso/${id}`}
                method="post"
              >
                <input
                  type="hidden"
                  name="intent"
                  value="link"
                />
                <Button
                  variant="outline"
                  size="sm"
                  type="submit"
                  disabled={pending}
                >
                  {copy("Подключить ")}
                </Button>
              </form>
            )}
          </div>
        ))}
      {confirm && (
        <div className="space-y-3 rounded-lg bg-muted p-4">
          <p className="text-sm">
            {copy(
              "Отключить этот способ входа? Аккаунт Asmblyr и открытые сессии сохранятся. ",
            )}
          </p>
          <div className="flex gap-2">
            <Button
              variant="destructive"
              size="sm"
              disabled={pending}
              onClick={() => unlink(confirm)}
            >
              {copy("Отключить ")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => setConfirm(null)}
            >
              {copy("Отмена ")}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
