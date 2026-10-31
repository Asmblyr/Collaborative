"use client";

import { BookmarkPlus, RotateCw, Trash2, Upload } from "lucide-react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { Input } from "@asmblyr-collaborative/kit/ui/input";
import { filterCount, type FilterGroup } from "./item-filter-options";
import { useFilterPresets } from "./use-filter-presets";
import { useUiCopy } from "@/lib/ui-copy";

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
  const state = useFilterPresets({ collection, legacyKey, current, onLoad });
  const dateLocale = copy.locale === "en" ? "en-US" : "ru-RU";

  return (
    <div className="space-y-4 pt-3">
      <div>
        <h4 className="text-sm font-medium">{copy("Мои фильтры")}</h4>
        <p className="text-xs text-muted-foreground">
          {copy("Сохраняются в аккаунте и доступны в других браузерах.")}
        </p>
      </div>
      <form
        onSubmit={state.save}
        className="flex flex-wrap gap-2"
      >
        <Input
          aria-label={copy("Название фильтра")}
          placeholder={copy("Название нового фильтра")}
          maxLength={60}
          className="min-w-40 flex-1"
          value={state.name}
          onChange={(event) => state.setName(event.target.value)}
        />
        <Button
          type="submit"
          size="sm"
          disabled={state.pending || state.loading}
        >
          <BookmarkPlus aria-hidden="true" /> {copy("Сохранить текущий")}
        </Button>
      </form>
      {state.loading ? (
        <p className="text-xs text-muted-foreground">
          {copy("Загрузка фильтров…")}
        </p>
      ) : state.presets.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {copy("Пока нет сохранённых фильтров.")}
        </p>
      ) : (
        <ul className="space-y-2">
          {state.presets.map((preset) => (
            <li
              key={preset.id}
              className="flex items-center gap-2 rounded-lg border bg-background p-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{preset.name}</p>
                <p className="text-xs text-muted-foreground">
                  {preset.available && preset.filter
                    ? copy.plural(
                        filterCount(preset.filter),
                        {
                          one: "{{count}} условие · {{value1}}",
                          few: "{{count}} условия · {{value1}}",
                          many: "{{count}} условий · {{value1}}",
                        },
                        {
                          value1: new Date(preset.updatedAt).toLocaleDateString(
                            dateLocale,
                          ),
                        },
                      )
                    : copy("Недоступен после изменения полей или прав")}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={state.pending || !preset.available || !preset.filter}
                onClick={() => state.open(preset)}
              >
                {copy("Открыть")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={state.pending}
                aria-label={copy(
                  "Обновить фильтр {{value0}} текущими условиями",
                  { value0: preset.name },
                )}
                onClick={() => void state.update(preset)}
              >
                <RotateCw aria-hidden="true" /> {copy("Обновить")}
              </Button>
              {state.confirmDeleteId === preset.id ? (
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    disabled={state.pending}
                    onClick={() => void state.remove(preset)}
                  >
                    {copy("Удалить?")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={state.pending}
                    onClick={() => state.setConfirmDeleteId(null)}
                  >
                    {copy("Нет")}
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  disabled={state.pending}
                  aria-label={copy("Удалить фильтр {{value0}}", {
                    value0: preset.name,
                  })}
                  onClick={() => state.setConfirmDeleteId(preset.id)}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {state.legacy.length > 0 && (
        <details className="rounded-lg border p-3 text-sm">
          <summary className="cursor-pointer">
            {copy("Фильтры из этого браузера (")}
            {state.legacy.length})
          </summary>
          <p className="my-2 text-xs text-muted-foreground">
            {copy(
              "Перенесите их в аккаунт по одному. До переноса они останутся в браузере.",
            )}
          </p>
          <ul className="space-y-2">
            {state.legacy.map((preset) => (
              <li
                key={preset.id}
                className="flex items-center justify-between gap-2"
              >
                <span className="min-w-0 truncate">{preset.name}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={state.pending}
                  onClick={() => void state.importLegacy(preset)}
                >
                  <Upload aria-hidden="true" /> {copy("Перенести")}
                </Button>
              </li>
            ))}
          </ul>
        </details>
      )}
      {state.message && (
        <p
          role="alert"
          className="text-xs text-destructive"
        >
          {state.message}
        </p>
      )}
    </div>
  );
}
