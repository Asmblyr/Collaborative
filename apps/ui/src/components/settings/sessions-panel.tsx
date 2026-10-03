"use client";
import { useEffect, useState } from "react";
import { Monitor } from "lucide-react";
import { Button } from "@asmblyr/kit/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/api-request";

interface Session {
  id: string;
  clientLabel: string;
  current: boolean;
  createdAt: string;
  refreshedAt: string | null;
}
export function SessionsPanel() {
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  async function load() {
    setError("");
    try {
      setSessions(await apiRequest<Session[]>("/api/users/me/sessions", "GET"));
    } catch {
      setError("Не удалось загрузить сессии");
    }
  }
  useEffect(() => {
    let active = true;
    void apiRequest<Session[]>("/api/users/me/sessions")
      .then((result) => {
        if (active) setSessions(result);
      })
      .catch(() => {
        if (active) setError("Не удалось загрузить сессии");
      });
    return () => {
      active = false;
    };
  }, []);
  async function revoke(id: string) {
    setPending(true);
    setError("");
    try {
      await apiRequest(`/api/users/me/sessions/${id}`, "DELETE");
      setSessions(
        (current) =>
          current?.filter((session) =>
            id === "others" ? session.current : session.id !== id,
          ) ?? null,
      );
      setConfirm(null);
    } catch {
      setError("Не удалось завершить сессию");
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="mt-8 space-y-4 border-t pt-6">
      <div>
        <h2 className="font-semibold">Активные сессии</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Устройства определяются приблизительно по браузеру при входе.
        </p>
      </div>
      {sessions === null && !error && (
        <p className="text-sm text-muted-foreground">Загрузка…</p>
      )}
      {error && (
        <div
          role="alert"
          className="text-sm text-destructive"
        >
          {error}{" "}
          <Button
            size="sm"
            variant="ghost"
            onClick={load}
          >
            Повторить
          </Button>
        </div>
      )}
      {sessions?.map((session) => (
        <div
          key={session.id}
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"
        >
          <div className="flex gap-3">
            <Monitor className="mt-1 size-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">
                {session.clientLabel === "Unknown client"
                  ? "Неизвестное устройство"
                  : session.clientLabel}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Вход: {new Date(session.createdAt).toLocaleString("ru-RU")}
              </p>
              {session.refreshedAt && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Обновление сессии:{" "}
                  {new Date(session.refreshedAt).toLocaleString("ru-RU")}
                </p>
              )}
            </div>
          </div>
          {session.current ? (
            <Badge variant="secondary">Текущая</Badge>
          ) : (
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => setConfirm(session.id)}
            >
              Завершить
            </Button>
          )}
        </div>
      ))}
      {(sessions?.filter((session) => !session.current).length ?? 0) > 0 && (
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => setConfirm("others")}
        >
          Завершить остальные сессии
        </Button>
      )}
      {confirm && (
        <div className="space-y-3 rounded-lg bg-muted p-4">
          <p className="text-sm">
            {confirm === "others"
              ? "На остальных устройствах потребуется войти заново."
              : "На этом устройстве потребуется войти заново."}
          </p>
          <div className="flex gap-2">
            <Button
              variant="destructive"
              size="sm"
              disabled={pending}
              onClick={() => revoke(confirm)}
            >
              Подтвердить
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
    </section>
  );
}
