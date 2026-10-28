"use client";

import { useEffect, useState } from "react";
import { Copy, Unplug } from "lucide-react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { apiRequest } from "@/lib/api-request";
import { useUiCopy } from "@/lib/ui-copy";

interface McpConnections {
  url: string;
  connections: {
    id: string;
    name: string;
    scopes: string[];
    lastUsedAt: string | null;
    expiresAt: string;
  }[];
}

export function McpConnectionsPanel() {
  const copy = useUiCopy();
  const [data, setData] = useState<McpConnections | null>(null);
  const [error, setError] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    void apiRequest<McpConnections>("/api/users/me/mcp-connections")
      .then((result) => {
        if (active) {
          setData(result);
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
  }, []);

  async function revoke(id: string) {
    setPending(id);
    setError(false);
    try {
      await apiRequest(`/api/users/me/mcp-connections/${id}`, "DELETE");
      setData((current) =>
        current
          ? {
              ...current,
              connections: current.connections.filter(
                (connection) => connection.id !== id,
              ),
            }
          : current,
      );
    } catch {
      setError(true);
    } finally {
      setPending(null);
    }
  }

  async function copyUrl() {
    if (!data) {
      return;
    }
    try {
      await navigator.clipboard.writeText(data.url);
      setCopied(true);
    } catch {
      setError(true);
    }
  }

  return (
    <section className="space-y-4 border-b pb-6">
      <div>
        <h2 className="font-semibold">{copy("Внешние ассистенты · MCP")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {copy(
            "Добавьте этот адрес в MCP-клиент и войдите через Collaborative. Выберите только режим доступа: чтение или чтение и запись.",
          )}
        </p>
      </div>
      {error && (
        <p
          role="alert"
          className="text-sm text-destructive"
        >
          {copy(
            "Не удалось обновить MCP-подключения. Обновите страницу и попробуйте ещё раз.",
          )}
        </p>
      )}
      {!data && !error && <p role="status">{copy("Загрузка… ")}</p>}
      {data && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded-md bg-muted px-3 py-2 text-sm">
              {data.url}
            </code>
            <Button
              variant="outline"
              size="sm"
              onClick={copyUrl}
            >
              <Copy className="size-4" />
              {copied ? copy("Скопировано") : copy("Скопировать адрес")}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            {copy(
              "Коллекции и действия расширений доступны по текущим правам вашего аккаунта. Новые разрешения и ограничения применяются автоматически.",
            )}
          </p>
          {data.connections.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {copy(
                "MCP-клиенты пока не подключены. После первого входа они появятся здесь.",
              )}
            </p>
          )}
          <div className="space-y-3">
            {data.connections.map((connection) => (
              <div
                key={connection.id}
                className="flex flex-wrap items-start justify-between gap-4 rounded-lg border p-4"
              >
                <div className="min-w-0 space-y-1">
                  <h3 className="font-medium break-words">{connection.name}</h3>
                  <p className="text-sm">
                    {connection.scopes.includes("mcp:write")
                      ? copy("Чтение и запись")
                      : copy("Только чтение")}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {copy("По текущим правам аккаунта и расширений")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {copy("Доступ до {{date}}", {
                      date: new Date(connection.expiresAt).toLocaleString(
                        copy.locale,
                      ),
                    })}
                  </p>
                  {connection.lastUsedAt && (
                    <p className="text-xs text-muted-foreground">
                      {copy("Последнее использование: {{date}}", {
                        date: new Date(connection.lastUsedAt).toLocaleString(
                          copy.locale,
                        ),
                      })}
                    </p>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending !== null}
                  onClick={() => revoke(connection.id)}
                >
                  <Unplug className="size-4" />
                  {copy("Отозвать доступ")}
                </Button>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
