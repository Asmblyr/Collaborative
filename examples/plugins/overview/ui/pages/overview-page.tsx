"use client";

import { Button } from "@asmblyr/kit/ui/button";
import type { PluginPageProps } from "@asmblyr/kit/ui";
import { useOverview } from "../hooks/use-overview.ts";

const timeFormat = new Intl.DateTimeFormat("ru", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

export function OverviewPage({ request }: PluginPageProps) {
  const { data, loading, error, reload } = useOverview(request);
  const name = data?.viewer.displayName ?? "Участник";

  return (
    <main className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="sr-only">Обзор</h1>
          <p className="text-sm text-muted-foreground">
            Ваша стартовая страница
          </p>
        </div>
        <Button
          variant="outline"
          disabled={loading}
          onClick={reload}
        >
          {loading ? "Обновление…" : "Обновить"}
        </Button>
      </header>

      {error && (
        <p
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {loading && !data && (
        <p
          role="status"
          className="py-12 text-center text-sm text-muted-foreground"
        >
          Загружаем обзор…
        </p>
      )}
      {data && (
        <>
          <section
            className="rounded-2xl border bg-card p-6 sm:p-8"
            aria-labelledby="overview-greeting"
          >
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Рабочее пространство
            </p>
            <h2
              id="overview-greeting"
              className="text-2xl font-semibold tracking-tight"
            >
              Добро пожаловать, {name}
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Здесь можно собрать сводку, быстрые действия и инструменты
              команды. Пока на странице отображается информация о вашем
              подключении.
            </p>
          </section>

          <dl className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border bg-card p-5">
              <dt className="text-sm text-muted-foreground">
                Текущий пользователь
              </dt>
              <dd className="mt-2 text-lg font-medium">{name}</dd>
              <dd className="mt-1 break-all text-xs text-muted-foreground">
                {data.viewer.id}
              </dd>
            </div>
            <div className="rounded-xl border bg-card p-5">
              <dt className="text-sm text-muted-foreground">Подключение</dt>
              <dd className="mt-2 flex items-center gap-2 text-lg font-medium">
                <span
                  aria-hidden="true"
                  className="size-2 rounded-full bg-emerald-500"
                />
                Авторизовано
              </dd>
              <dd className="mt-1 text-xs text-muted-foreground">
                Последний ответ:{" "}
                <time dateTime={data.checkedAt}>
                  {timeFormat.format(new Date(data.checkedAt))}
                </time>
              </dd>
            </div>
          </dl>
        </>
      )}
    </main>
  );
}
