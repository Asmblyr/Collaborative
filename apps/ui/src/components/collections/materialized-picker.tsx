"use client";

import { useEffect, useState } from "react";
import type { MaterializedViewCandidate } from "@asmblyr-collaborative/contracts";
import { Database } from "lucide-react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { Input } from "@asmblyr-collaborative/kit/ui/input";
import { apiRequest } from "@/lib/api-request";
import { useUiCopy } from "@/lib/ui-copy";

export function MaterializedPicker({
  onSelect,
}: {
  onSelect: (view: MaterializedViewCandidate) => void;
}) {
  const copy = useUiCopy();
  const [views, setViews] = useState<MaterializedViewCandidate[] | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    apiRequest<MaterializedViewCandidate[]>("/api/materialized-views")
      .then((data) => {
        if (active) {
          setViews(data);
        }
      })
      .catch(() => {
        if (active) {
          setError(copy("Не удалось загрузить представления"));
        }
      });
    return () => {
      active = false;
    };
  }, [retry, copy]);
  const reasons = {
    "unsupported-name": copy("Неподдерживаемое имя"),
    "unsupported-fields": copy("Есть неподдерживаемые поля"),
    "missing-key": copy("Нет подходящего уникального ключа"),
    "not-populated": copy("Представление ещё не заполнено"),
  };
  const visible = views?.filter((view) =>
    view.name.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {copy(
          "Выберите готовое представление PostgreSQL. Данные доступны только для просмотра.",
        )}
      </p>
      <Input
        aria-label={copy("Найти представление")}
        placeholder={copy("Найти представление…")}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {error ? (
        <div
          role="alert"
          className="space-y-2"
        >
          <p className="text-sm text-destructive">{error}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setError("");
              setViews(null);
              setRetry((n) => n + 1);
            }}
          >
            {copy("Повторить")}
          </Button>
        </div>
      ) : views === null ? (
        <p
          role="status"
          className="text-sm text-muted-foreground"
        >
          {copy("Загрузка…")}
        </p>
      ) : visible?.length ? (
        <div className="divide-y rounded-lg border">
          {visible.map((view) => (
            <Button
              key={view.name}
              variant="ghost"
              className="h-auto w-full justify-start gap-3 rounded-none px-3 py-3 text-left"
              disabled={view.connected || Boolean(view.problem)}
              onClick={() => onSelect(view)}
            >
              <Database
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <span className="min-w-0">
                <span className="block truncate font-mono text-sm">
                  {view.name}
                </span>
                <span className="block text-xs font-normal text-muted-foreground">
                  {view.connected
                    ? copy("Уже подключено")
                    : view.problem
                      ? reasons[view.problem]
                      : copy("Полей: {{value0}}", {
                          value0: view.fields.length,
                        })}
                </span>
              </span>
            </Button>
          ))}
        </div>
      ) : (
        <p
          role="status"
          className="text-sm text-muted-foreground"
        >
          {copy("Доступных представлений не найдено")}
        </p>
      )}
    </div>
  );
}
