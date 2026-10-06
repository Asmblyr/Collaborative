"use client";
import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api-request";
import { useUiCopy } from "@/lib/ui-copy";
import { originalCopy, type UiCopy } from "@/lib/ui-copy-types";

interface Event {
  id: string;
  action: "create" | "update" | "delete";
  actorId: string;
  createdAt: string;
  changes: Record<string, unknown>;
}
const names = {
  create: "Файл загружен",
  update: "Метаданные изменены",
  delete: "Файл удалён",
};
const fields: Record<string, string> = {
  title: "Название",
  description: "Описание",
  filename: "Имя файла",
  size: "Размер",
  mimeType: "Тип",
  visibility: "Доступ по ссылке",
};
function historyValue(
  key: string,
  value: unknown,
  copy: UiCopy = originalCopy,
): string {
  if (key === "visibility") {
    return value === "public"
      ? copy("Любой, у кого есть ссылка")
      : copy("Только с авторизацией");
  }
  return String(value || "—");
}

export function FileHistory({ id }: { id: string }) {
  const copy = useUiCopy();

  const [events, setEvents] = useState<Event[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    apiRequest<Event[]>(`/api/files/${id}/events`)
      .then((data) => {
        if (active) setEvents(data);
      })
      .catch(() => {
        if (active) setError(copy("Не удалось загрузить историю"));
      });
    return () => {
      active = false;
    };
  }, [id, copy]);
  if (error)
    return (
      <p
        role="alert"
        className="text-sm text-destructive"
      >
        {copy(error)}
      </p>
    );
  if (!events)
    return <p className="text-sm text-muted-foreground">{copy("Загрузка…")}</p>;
  return (
    <div className="space-y-4">
      {!events.length && (
        <p className="text-sm text-muted-foreground">
          {copy("Изменений пока нет.")}
        </p>
      )}
      {events.map((event) => (
        <article
          key={event.id}
          className="space-y-2 rounded-lg border p-4 text-sm"
        >
          <div className="font-medium">{copy(names[event.action])}</div>
          <time className="text-xs text-muted-foreground">
            {new Date(event.createdAt).toLocaleString("ru-RU")}
          </time>
          <p className="break-all text-xs text-muted-foreground">
            {copy("Автор: ")}
            {event.actorId}
          </p>
          {Object.entries(event.changes).map(([key, value]) => (
            <div
              key={key}
              className="break-words"
            >
              <span className="text-muted-foreground">
                {copy(fields[key] ?? key)}:{" "}
              </span>
              {value &&
              typeof value === "object" &&
              "before" in value &&
              "after" in value ? (
                <>
                  <span className="text-muted-foreground line-through">
                    {historyValue(key, value.before, copy)}
                  </span>{" "}
                  → {historyValue(key, value.after, copy)}
                </>
              ) : (
                String(value)
              )}
            </div>
          ))}
        </article>
      ))}
      {events.length === 100 && (
        <p className="text-xs text-muted-foreground">
          {copy("Показаны последние 100 событий. ")}
        </p>
      )}
    </div>
  );
}
