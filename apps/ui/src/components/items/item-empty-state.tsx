"use client";

import { Database, SearchX } from "lucide-react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { useUiCopy } from "@/lib/ui-copy";

export function ItemEmptyState({
  filtered,
  outOfRange,
  onCreate,
  onReset,
  onFirstPage,
}: {
  filtered: boolean;
  outOfRange: boolean;
  onCreate?: () => void;
  onReset: () => void;
  onFirstPage: () => void;
}) {
  const copy = useUiCopy();

  const Icon = filtered ? SearchX : Database;
  return (
    <div className="flex h-full min-h-72 flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-muted">
        <Icon
          aria-hidden="true"
          className="size-6 text-muted-foreground"
        />
      </div>
      <h2 className="text-base font-medium">
        {outOfRange
          ? copy("На этой странице нет записей")
          : filtered
            ? copy("Ничего не найдено")
            : copy("Пока нет записей")}
      </h2>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
        {outOfRange
          ? copy(
              "Вернитесь на первую страницу, чтобы увидеть актуальные записи.",
            )
          : filtered
            ? copy("Попробуйте другой запрос или сбросьте условия отбора.")
            : onCreate
              ? copy("Создайте первую запись — она появится здесь.")
              : copy("В этой коллекции пока нет данных для просмотра.")}
      </p>
      <div className="mt-5">
        {outOfRange ? (
          <Button
            variant="outline"
            onClick={onFirstPage}
          >
            {copy("На первую страницу ")}
          </Button>
        ) : filtered ? (
          <Button
            variant="outline"
            onClick={onReset}
          >
            {copy("Сбросить поиск и фильтры ")}
          </Button>
        ) : (
          onCreate && (
            <Button onClick={onCreate}>{copy("Создать первую запись")}</Button>
          )
        )}
      </div>
    </div>
  );
}
