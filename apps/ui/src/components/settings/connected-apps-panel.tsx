"use client";

import { useEffect, useState } from "react";
import { AppWindow, Unplug } from "lucide-react";
import { Button } from "@asmblyr/kit/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/api-request";

interface ConnectedApplication {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  audience: string;
  scopes: string[];
  approvedAt: string;
  lastUsedAt: string | null;
}

const scopeLabels: Record<string, string> = {
  openid: "Идентификатор аккаунта",
  email: "Электронная почта",
  profile: "Имя и изображение профиля",
};

export function ConnectedAppsPanel() {
  const [apps, setApps] = useState<ConnectedApplication[] | null>(null);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let active = true;
    void apiRequest<ConnectedApplication[]>("/api/users/me/oauth-apps")
      .then((data) => {
        if (active) setApps(data);
      })
      .catch(() => {
        if (active) setError("Не удалось загрузить приложения");
      });
    return () => {
      active = false;
    };
  }, []);

  async function reload() {
    setError("");
    try {
      setApps(
        await apiRequest<ConnectedApplication[]>("/api/users/me/oauth-apps"),
      );
    } catch {
      setError("Не удалось загрузить приложения");
    }
  }

  async function revoke(id: string) {
    setPending(true);
    setError("");
    try {
      await apiRequest(`/api/users/me/oauth-apps/${id}`, "DELETE");
      setApps((current) => current?.filter((app) => app.id !== id) ?? null);
      setConfirm(null);
    } catch {
      setError("Не удалось отозвать доступ. Попробуйте ещё раз.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="space-y-5">
      <div>
        <h2 className="font-semibold">Подключённые приложения</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Сервисы, которым вы разрешили вход через Asmblyr. Повторный вход
          использует сохранённое согласие.
        </p>
      </div>
      {error && (
        <div
          role="alert"
          className="text-sm text-destructive"
        >
          {error}{" "}
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={reload}
          >
            Повторить
          </Button>
        </div>
      )}
      {apps === null && !error && (
        <p
          role="status"
          className="text-sm text-muted-foreground"
        >
          Загрузка…
        </p>
      )}
      {apps?.length === 0 && (
        <div className="rounded-xl border border-dashed p-7 text-center">
          <AppWindow className="mx-auto mb-3 size-6 text-muted-foreground" />
          <p className="text-sm font-medium">
            Пока нет подключённых приложений
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Они появятся после первого подтверждения входа.
          </p>
        </div>
      )}
      {apps?.map((app) => (
        <article
          key={app.id}
          className="space-y-4 rounded-xl border p-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                <AppWindow className="size-4" />
              </div>
              <div className="min-w-0">
                <h3 className="break-words text-sm font-semibold">
                  {app.name}
                </h3>
                {app.description && (
                  <p className="mt-1 break-words text-sm text-muted-foreground">
                    {app.description}
                  </p>
                )}
                {!app.enabled && (
                  <Badge
                    variant="secondary"
                    className="mt-2"
                  >
                    Отключено администратором
                  </Badge>
                )}
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => setConfirm(app.id)}
            >
              <Unplug className="size-3.5" />
              Отозвать доступ
            </Button>
          </div>
          <div
            className="flex flex-wrap gap-1.5"
            aria-label="Предоставленные разрешения"
          >
            {app.scopes.map((scope) => (
              <Badge
                key={scope}
                variant="secondary"
                className="max-w-full whitespace-normal break-all font-normal"
              >
                {scopeLabels[scope] ?? scope}
              </Badge>
            ))}
          </div>
          <div className="space-y-1 text-xs text-muted-foreground">
            {app.audience && (
              <p className="break-all">Получатель: {app.audience}</p>
            )}
            <p>
              Доступ разрешён:{" "}
              {new Date(app.approvedAt).toLocaleString("ru-RU")}
            </p>
            <p>
              Последний вход:{" "}
              {app.lastUsedAt
                ? new Date(app.lastUsedAt).toLocaleString("ru-RU")
                : "ещё не завершён"}
            </p>
          </div>
          {confirm === app.id && (
            <div className="space-y-3 rounded-lg bg-muted p-3">
              <p className="text-sm">
                При следующем входе {app.name} снова запросит разрешение. Уже
                выданный токен может действовать ещё до 5 минут; собственная
                сессия сервиса может завершиться позже.
              </p>
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={pending}
                  onClick={() => revoke(app.id)}
                >
                  {pending ? "Отзываем…" : "Отозвать"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() => setConfirm(null)}
                >
                  Отмена
                </Button>
              </div>
            </div>
          )}
        </article>
      ))}
    </section>
  );
}
