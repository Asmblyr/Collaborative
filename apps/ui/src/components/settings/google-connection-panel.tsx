"use client";
import { useEffect, useState } from "react";
import type { PersonalConnectionStatus } from "@asmblyr-collaborative/contracts";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/api-request";
import { useUiCopy } from "@/lib/ui-copy";
import { ASSISTANT_SETTINGS_CHANGED } from "../assistant/assistant-types";

export function GoogleConnectionPanel({ feedback }: { feedback?: string }) {
  const copy = useUiCopy();
  const [status, setStatus] = useState<PersonalConnectionStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/connections/google", {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error();
        }
        const result = (await response.json()) as {
          data: PersonalConnectionStatus;
        };
        setStatus(result.data);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setMessage(copy("Подключение Google недоступно."));
        }
      });
    return () => controller.abort();
  }, [copy]);
  async function connect() {
    setBusy(true);
    setMessage("");
    try {
      const result = await apiRequest<{ url: string }>(
        "/connections/google/start",
        "POST",
        {},
      );
      const url = new URL(result.url);
      if (url.origin !== "https://accounts.google.com") {
        throw new Error();
      }
      window.location.assign(url.href);
    } catch {
      setMessage(copy("Не удалось начать подключение Google."));
      setBusy(false);
    }
  }
  async function disconnect() {
    setBusy(true);
    setMessage("");
    try {
      const result = await apiRequest<{ revoked: boolean }>(
        "/api/connections/google",
        "DELETE",
      );
      setStatus(
        await apiRequest<PersonalConnectionStatus>("/api/connections/google"),
      );
      if (!result.revoked) {
        setMessage(
          copy(
            "Подключение удалено. Отзовите разрешение также в настройках аккаунта Google.",
          ),
        );
      }
      window.dispatchEvent(new Event(ASSISTANT_SETTINGS_CHANGED));
    } catch {
      setMessage(copy("Не удалось отключить Google."));
    } finally {
      setBusy(false);
    }
  }
  let statusLabel = "Не подключено";
  if (status?.unavailable) {
    statusLabel = "Временно недоступно";
  } else if (status?.connected) {
    statusLabel = "Подключено";
  } else if (status?.reconnect) {
    statusLabel = "Нужно подключить заново";
  }
  return (
    <section className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">Google Workspace</h3>
        <Badge variant="secondary">{copy(statusLabel)}</Badge>
      </div>
      {status?.email && <p className="break-all text-sm">{status.email}</p>}
      <p className="text-xs leading-5 text-muted-foreground">
        {copy(
          "Личный доступ к Google Drive и Sheets: чтение и запись. Запрошенные данные передаются AI-провайдеру. Ассистент читает по запросу, а изменения выполняются после вашего подтверждения.",
        )}
      </p>
      {!status?.enabled && status && (
        <p className="text-xs text-muted-foreground">
          {copy(
            "Администратор должен включить Google Workspace в настройках подключений.",
          )}
        </p>
      )}
      {status?.unavailable && (
        <p className="text-xs text-muted-foreground">
          {copy(
            "Подключение временно недоступно. Сохранённый аккаунт можно отключить.",
          )}
        </p>
      )}
      {message && (
        <p
          role="status"
          className="text-xs"
        >
          {message}
        </p>
      )}
      {feedback === "failed" && (
        <p
          role="alert"
          className="text-xs text-destructive"
        >
          {copy(
            "Google не подключён. Проверьте разрешения, список тестовых пользователей и адрес callback.",
          )}
        </p>
      )}
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={busy || !status?.enabled || status.unavailable}
          onClick={() => void connect()}
        >
          {copy(
            status?.reconnect || status?.connected
              ? "Подключить заново"
              : "Подключить Google",
          )}
        </Button>
        {(status?.connected || status?.reconnect) && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void disconnect()}
          >
            {copy("Отключить")}
          </Button>
        )}
      </div>
    </section>
  );
}
