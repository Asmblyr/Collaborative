"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiRequest } from "@/lib/api-request";
import { localizedRequestError } from "@/lib/http-request";
import { readFilter, type FilterGroup } from "./item-filter-options";
import { useUiCopy } from "@/lib/ui-copy";

export interface FilterPreset {
  id: string;
  name: string;
  filter: FilterGroup | null;
  available: boolean;
  updatedAt: string;
}

export interface LegacyFilterPreset {
  id: string;
  name: string;
  filter: FilterGroup;
}

function readLegacyPresets(key: string): LegacyFilterPreset[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((entry): entry is LegacyFilterPreset =>
        Boolean(
          entry &&
            typeof entry === "object" &&
            typeof entry.id === "string" &&
            typeof entry.name === "string" &&
            entry.name.length <= 60 &&
            entry.filter &&
            typeof entry.filter === "object" &&
            ["and", "or"].includes(entry.filter.logic) &&
            Array.isArray(entry.filter.children),
        ),
      )
      .slice(0, 30);
  } catch {
    return [];
  }
}

export function useFilterPresets({
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
  const [presets, setPresets] = useState<FilterPreset[]>([]);
  const [legacy, setLegacy] = useState<LegacyFilterPreset[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) {
        setLegacy(readLegacyPresets(legacyKey));
      }
    });
    apiRequest<FilterPreset[]>(endpoint, "GET", undefined, controller.signal)
      .then((data) => {
        setPresets(data);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setMessage(
            localizedRequestError(error, copy, "Не удалось загрузить фильтры"),
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [endpoint, legacyKey, copy]);

  function resolveCurrentFilter(): FilterGroup | null {
    try {
      const filter = current();
      if (filter.children.length === 0) {
        setMessage(copy("Добавьте хотя бы одно условие"));
        return null;
      }
      return filter;
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : copy("Проверьте условия фильтра"),
      );
      return null;
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = name.trim();
    if (!title || title.length > 60) {
      setMessage(copy("Введите название до 60 символов"));
      return;
    }
    const filter = resolveCurrentFilter();
    if (!filter) {
      return;
    }

    setPending(true);
    setMessage("");
    try {
      const data = await apiRequest<FilterPreset>(endpoint, "POST", {
        name: title,
        filter,
      });
      setPresets((saved) => [data, ...saved]);
      setName("");
    } catch (error) {
      setMessage(
        localizedRequestError(error, copy, "Не удалось сохранить фильтр"),
      );
    } finally {
      setPending(false);
    }
  }

  async function update(preset: FilterPreset) {
    const filter = resolveCurrentFilter();
    if (!filter) {
      return;
    }

    setPending(true);
    setMessage("");
    try {
      const data = await apiRequest<FilterPreset>(
        `${endpoint}/${preset.id}`,
        "PUT",
        {
          name: preset.name,
          filter,
        },
      );
      setPresets((saved) =>
        saved.map((entry) => (entry.id === data.id ? data : entry)),
      );
    } catch (error) {
      setMessage(
        localizedRequestError(error, copy, "Не удалось обновить фильтр"),
      );
    } finally {
      setPending(false);
    }
  }

  async function remove(preset: FilterPreset) {
    setPending(true);
    setMessage("");
    try {
      await apiRequest<void>(`${endpoint}/${preset.id}`, "DELETE");
      setPresets((saved) => saved.filter((entry) => entry.id !== preset.id));
      setConfirmDeleteId(null);
    } catch (error) {
      setMessage(
        localizedRequestError(error, copy, "Не удалось удалить фильтр"),
      );
    } finally {
      setPending(false);
    }
  }

  async function importLegacy(preset: LegacyFilterPreset) {
    setPending(true);
    setMessage("");
    try {
      const data = await apiRequest<FilterPreset>(endpoint, "POST", {
        name: preset.name,
        filter: preset.filter,
      });
      const remaining = readLegacyPresets(legacyKey).filter(
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
        localizedRequestError(error, copy, "Не удалось перенести фильтр"),
      );
    } finally {
      setPending(false);
    }
  }

  function open(preset: FilterPreset) {
    try {
      onLoad(readFilter(JSON.stringify(preset.filter)));
      setMessage("");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : copy("Фильтр недоступен"),
      );
    }
  }

  return {
    presets,
    legacy,
    name,
    setName,
    loading,
    pending,
    confirmDeleteId,
    setConfirmDeleteId,
    message,
    save,
    update,
    remove,
    importLegacy,
    open,
  };
}
