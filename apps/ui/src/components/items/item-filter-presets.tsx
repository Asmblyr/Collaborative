"use client";

import { useEffect, useState, type FormEvent } from "react";
import { BookmarkPlus, RotateCw, Trash2, Upload } from "lucide-react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { Input } from "@asmblyr-collaborative/kit/ui/input";
import {
  filterCount,
  readFilter,
  type FilterGroup,
} from "./item-filter-options";
import { useUiCopy } from "@/lib/ui-copy";
import { originalCopy, type UiCopy } from "@/lib/ui-copy-types";

interface Preset {
  id: string;
  name: string;
  filter: FilterGroup | null;
  available: boolean;
  updatedAt: string;
}

interface LegacyPreset {
  id: string;
  name: string;
  filter: FilterGroup;
}

function readLegacy(key: string): LegacyPreset[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (entry): entry is LegacyPreset =>
          entry &&
          typeof entry === "object" &&
          typeof entry.id === "string" &&
          typeof entry.name === "string" &&
          entry.name.length <= 60 &&
          entry.filter &&
          typeof entry.filter === "object" &&
          ["and", "or"].includes(entry.filter.logic) &&
          Array.isArray(entry.filter.children),
      )
      .slice(0, 30);
  } catch {
    return [];
  }
}

async function responseMessage(
  response: Response,
  copy: UiCopy = originalCopy,
): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string };
    if (body.message) return body.message;
  } catch {
    /* Keep the fallback below. */
  }
  return copy("Не удалось выполнить запрос");
}

export function ItemFilterPresets({
  collection,
  legacyKey,
  current,
  onLoad,
}: {
  collection: string;
  legacyKey: string;
  current: () => FilterGroup;
  onLoad: (group: FilterGroup) => void;
}) {
  const copy = useUiCopy();

  const endpoint = `/api/filter-presets/${encodeURIComponent(collection)}`;
  const [presets, setPresets] = useState<Preset[]>([]);
  const [legacy, setLegacy] = useState<LegacyPreset[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) setLegacy(readLegacy(legacyKey));
    });
    fetch(endpoint, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(await responseMessage(response, copy));
        return response.json() as Promise<{ data: Preset[] }>;
      })
      .then((result) => setPresets(result.data))
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setMessage(
            error instanceof Error
              ? error.message
              : copy("Не удалось загрузить фильтры"),
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [endpoint, legacyKey, copy]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = name.trim();
    if (!title || title.length > 60)
      return setMessage(copy("Введите название до 60 символов"));
    let filter: FilterGroup;
    try {
      filter = current();
      if (filter.children.length === 0)
        throw new Error(copy("Добавьте хотя бы одно условие"));
    } catch (error) {
      return setMessage(
        error instanceof Error
          ? error.message
          : copy("Проверьте условия фильтра"),
      );
    }
    setPending(true);
    setMessage("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: title, filter }),
      });
      if (!response.ok) throw new Error(await responseMessage(response, copy));
      const { data } = (await response.json()) as { data: Preset };
      setPresets((saved) => [data, ...saved]);
      setName("");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : copy("Не удалось сохранить фильтр"),
      );
    } finally {
      setPending(false);
    }
  }

  async function update(preset: Preset) {
    let filter: FilterGroup;
    try {
      filter = current();
      if (filter.children.length === 0)
        throw new Error(copy("Добавьте хотя бы одно условие"));
    } catch (error) {
      return setMessage(
        error instanceof Error
          ? error.message
          : copy("Проверьте условия фильтра"),
      );
    }
    setPending(true);
    setMessage("");
    try {
      const response = await fetch(`${endpoint}/${preset.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: preset.name, filter }),
      });
      if (!response.ok) throw new Error(await responseMessage(response, copy));
      const { data } = (await response.json()) as { data: Preset };
      setPresets((saved) =>
        saved.map((entry) => (entry.id === data.id ? data : entry)),
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : copy("Не удалось обновить фильтр"),
      );
    } finally {
      setPending(false);
    }
  }

  async function remove(preset: Preset) {
    setPending(true);
    setMessage("");
    try {
      const response = await fetch(`${endpoint}/${preset.id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error(await responseMessage(response, copy));
      setPresets((saved) => saved.filter((entry) => entry.id !== preset.id));
      setConfirmDeleteId(null);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : copy("Не удалось удалить фильтр"),
      );
    } finally {
      setPending(false);
    }
  }

  async function importLegacy(preset: LegacyPreset) {
    setPending(true);
    setMessage("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: preset.name, filter: preset.filter }),
      });
      if (!response.ok) throw new Error(await responseMessage(response, copy));
      const { data } = (await response.json()) as { data: Preset };
      const remaining = readLegacy(legacyKey).filter(
        (entry) => entry.id !== preset.id,
      );
      setPresets((saved) => [data, ...saved]);
      try {
        localStorage.setItem(legacyKey, JSON.stringify(remaining));
        setLegacy(remaining);
      } catch {
        setMessage(
          copy(
            "Фильтр сохранён в аккаунте, но локальную копию не удалось убрать из браузера",
          ),
        );
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : copy("Не удалось перенести фильтр"),
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4 pt-3">
      <div>
        <h4 className="text-sm font-medium">{copy("Мои фильтры")}</h4>
        <p className="text-xs text-muted-foreground">
          {copy("Сохраняются в аккаунте и доступны в других браузерах. ")}
        </p>
      </div>
      <form
        onSubmit={save}
        className="flex flex-wrap gap-2"
      >
        <Input
          aria-label={copy("Название фильтра")}
          placeholder={copy("Название нового фильтра")}
          maxLength={60}
          className="min-w-40 flex-1"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <Button
          type="submit"
          size="sm"
          disabled={pending || loading}
        >
          <BookmarkPlus aria-hidden="true" /> {copy(" Сохранить текущий ")}
        </Button>
      </form>
      {loading ? (
        <p className="text-xs text-muted-foreground">
          {copy("Загрузка фильтров…")}
        </p>
      ) : presets.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {copy("Пока нет сохранённых фильтров. ")}
        </p>
      ) : (
        <ul className="space-y-2">
          {presets.map((preset) => (
            <li
              key={preset.id}
              className="flex items-center gap-2 rounded-lg border bg-background p-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{preset.name}</p>
                <p className="text-xs text-muted-foreground">
                  {preset.available && preset.filter
                    ? copy("{{value0}} условий · {{value1}}", {
                        value0: filterCount(preset.filter),
                        value1: new Date(preset.updatedAt).toLocaleDateString(
                          "ru-RU",
                        ),
                      })
                    : copy("Недоступен после изменения полей или прав")}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={pending || !preset.available || !preset.filter}
                onClick={() => {
                  try {
                    onLoad(readFilter(JSON.stringify(preset.filter)));
                    setMessage("");
                  } catch (error) {
                    setMessage(
                      error instanceof Error
                        ? error.message
                        : copy("Фильтр недоступен"),
                    );
                  }
                }}
              >
                {copy("Открыть ")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={pending}
                aria-label={copy(
                  "Обновить фильтр {{value0}} текущими условиями",
                  { value0: preset.name },
                )}
                onClick={() => void update(preset)}
              >
                <RotateCw aria-hidden="true" /> {copy(" Обновить ")}
              </Button>
              {confirmDeleteId === preset.id ? (
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    disabled={pending}
                    onClick={() => void remove(preset)}
                  >
                    {copy("Удалить? ")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => setConfirmDeleteId(null)}
                  >
                    {copy("Нет ")}
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  disabled={pending}
                  aria-label={copy("Удалить фильтр {{value0}}", {
                    value0: preset.name,
                  })}
                  onClick={() => setConfirmDeleteId(preset.id)}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {legacy.length > 0 && (
        <details className="rounded-lg border p-3 text-sm">
          <summary className="cursor-pointer">
            {copy("Фильтры из этого браузера (")}
            {legacy.length})
          </summary>
          <p className="my-2 text-xs text-muted-foreground">
            {copy(
              "Перенесите их в аккаунт по одному. До переноса они останутся в браузере. ",
            )}
          </p>
          <ul className="space-y-2">
            {legacy.map((preset) => (
              <li
                key={preset.id}
                className="flex items-center justify-between gap-2"
              >
                <span className="min-w-0 truncate">{preset.name}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => void importLegacy(preset)}
                >
                  <Upload aria-hidden="true" /> {copy(" Перенести ")}
                </Button>
              </li>
            ))}
          </ul>
        </details>
      )}
      {message && (
        <p
          role="alert"
          className="text-xs text-destructive"
        >
          {copy(message)}
        </p>
      )}
    </div>
  );
}
