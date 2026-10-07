"use client";

import { useEffect, useState } from "react";
import type { ProfileDisplaySource } from "@asmblyr-collaborative/contracts";
import { ChevronRight } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@asmblyr-collaborative/kit/ui/select";
import { apiRequest } from "@/lib/api-request";
import { useUiCopy } from "@/lib/ui-copy";

export function ProfileDisplaySourcePicker({
  path,
  onChange,
  disabled,
  container,
}: {
  path: string[];
  onChange(path: string[], label?: string): void;
  disabled: boolean;
  container: HTMLElement | null;
}) {
  const copy = useUiCopy();
  const [levels, setLevels] = useState<ProfileDisplaySource[][]>([]);
  const [error, setError] = useState("");
  const key = JSON.stringify(path);
  useEffect(() => {
    let active = true;
    async function load() {
      const selected = JSON.parse(key) as string[];
      const next: ProfileDisplaySource[][] = [];
      for (let level = 0; level < 3; level++) {
        const prefix = selected.slice(0, level).join(".");
        const options = await apiRequest<ProfileDisplaySource[]>(
          `/api/users/profile-display/sources?path=${encodeURIComponent(prefix)}`,
        );
        next.push(options);
        const chosen = options.find((entry) => entry.name === selected[level]);
        if (chosen?.type !== "relation") {
          break;
        }
      }
      if (active) {
        setLevels(next);
        setError("");
      }
    }
    void load().catch(() => {
      if (active) {
        setError(copy("Не удалось загрузить поля"));
      }
    });
    return () => {
      active = false;
    };
  }, [key, copy]);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {levels.map((options, level) => (
          <div
            key={level}
            className="flex min-w-0 max-w-full items-center gap-2"
          >
            {level > 0 && (
              <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
            )}
            <Select
              value={path[level] ?? ""}
              disabled={disabled}
              onValueChange={(name) =>
                onChange(
                  [...path.slice(0, level), name],
                  options.find((entry) => entry.name === name)?.label,
                )
              }
            >
              <SelectTrigger
                className="w-full min-w-36 max-w-64"
                aria-label={`${copy("Источник значения")} ${level + 1}`}
              >
                <SelectValue placeholder={copy("Выберите поле…")} />
              </SelectTrigger>
              <SelectContent container={container}>
                {path[level] &&
                  !options.some((option) => option.name === path[level]) && (
                    <SelectItem
                      value={path[level]}
                      disabled
                    >
                      {copy("Поле недоступно")}
                    </SelectItem>
                  )}
                {options.map((option) => (
                  <SelectItem
                    key={option.name}
                    value={option.name}
                  >
                    {option.label}
                    {option.type === "relation" ? " →" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>
      {levels[0]?.length === 0 && (
        <p className="text-xs text-muted-foreground">
          {copy(
            "Сначала добавьте свои поля в системную коллекцию пользователей.",
          )}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="text-xs text-destructive"
        >
          {error}
        </p>
      )}
    </div>
  );
}
