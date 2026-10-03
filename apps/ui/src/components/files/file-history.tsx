"use client";
import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api-request";

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
};

export function FileHistory({ id }: { id: string }) {
  const [events, setEvents] = useState<Event[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    apiRequest<Event[]>(`/api/files/${id}/events`)
      .then((data) => {
        if (active) setEvents(data);
      })
      .catch(() => {
        if (active) setError("Не удалось загрузить историю");
      });
    return () => {
      active = false;
    };
  }, [id]);
  if (error)
    return (
      <p
        role="alert"
        className="text-sm text-destructive"
      >
        {error}
      </p>
    );
  if (!events)
    return <p className="text-sm text-muted-foreground">Загрузка…</p>;
  return (
    <div className="space-y-4">
      {!events.length && (
        <p className="text-sm text-muted-foreground">Изменений пока нет.</p>
      )}
      {events.map((event) => (
        <article
          key={event.id}
          className="space-y-2 rounded-lg border p-4 text-sm"
        >
          <div className="font-medium">{names[event.action]}</div>
          <time className="text-xs text-muted-foreground">
            {new Date(event.createdAt).toLocaleString("ru-RU")}
          </time>
          <p className="break-all text-xs text-muted-foreground">
            Автор: {event.actorId}
          </p>
          {Object.entries(event.changes).map(([key, value]) => (
            <div
              key={key}
              className="break-words"
            >
              <span className="text-muted-foreground">
                {fields[key] ?? key}:{" "}
              </span>
              {value &&
              typeof value === "object" &&
              "before" in value &&
              "after" in value ? (
                <>
                  <span className="text-muted-foreground line-through">
                    {String(value.before || "—")}
                  </span>{" "}
                  → {String(value.after || "—")}
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
          Показаны последние 100 событий.
        </p>
      )}
    </div>
  );
}
