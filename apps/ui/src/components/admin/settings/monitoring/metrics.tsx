"use client";
import type { MonitoringMetrics } from "@asmblyr-collaborative/contracts";
import { Badge } from "@/components/ui/badge";
import { useUiCopy } from "@/lib/ui-copy";

export function MonitoringMeasurements({
  value,
  error,
}: {
  value: MonitoringMetrics;
  error: boolean;
}) {
  const copy = useUiCopy();
  const milliseconds = (number: number) =>
    `${new Intl.NumberFormat(copy.locale, { maximumFractionDigits: 2 }).format(number)} ${copy("мс")}`;
  return (
    <section
      className="space-y-4"
      aria-labelledby="monitoring-metrics-title"
    >
      <div className="space-y-1">
        <h2
          id="monitoring-metrics-title"
          className="text-base font-medium"
        >
          {copy("Производительность ядра")}
        </h2>
        <p className="text-xs leading-5 text-muted-foreground">
          {copy(
            "Текущий экземпляр ядра · последние 15 минут · до 2 000 измерений на маршрут. Статистика разных экземпляров здесь не объединяется.",
          )}
        </p>
      </div>
      {error && (
        <p
          role="alert"
          className="text-sm text-destructive"
        >
          {copy(
            "Не удалось обновить измерения. Показаны последние полученные данные.",
          )}
        </p>
      )}
      {value.issue && (
        <p
          role="alert"
          className="text-sm text-destructive"
        >
          {copy(
            "Мониторинг недоступен. Проверьте настройки и защиту сохранённых DSN; остальные функции продолжают работать.",
          )}
        </p>
      )}
      {!value.enabled ? (
        <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
          {copy(
            "Сбор производительности API выключен. Включите его в настройках мониторинга.",
          )}
        </div>
      ) : (
        <>
          {value.runtime && (
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                [copy("Память процесса"), `${value.runtime.rssMb} MB`],
                [
                  copy("Задержка event loop · p99"),
                  milliseconds(value.runtime.eventLoopP99Ms),
                ],
                [
                  copy("Ожидание соединения с БД"),
                  String(value.runtime.poolPending),
                ],
              ].map(([title, detail]) => (
                <div
                  key={title}
                  className="rounded-xl border bg-card p-4"
                >
                  <p className="text-xs text-muted-foreground">{title}</p>
                  <p className="mt-2 text-lg font-semibold tabular-nums">
                    {detail}
                  </p>
                </div>
              ))}
            </div>
          )}
          {!value.routes.length ? (
            <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
              {copy(
                "Измерений пока нет. Откройте коллекцию или выполните запрос к API.",
              )}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border bg-card">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">
                  {copy("Задержки API по маршрутам")}
                </caption>
                <thead className="border-b text-xs text-muted-foreground">
                  <tr>
                    {[
                      "Маршрут",
                      "Измерений",
                      "Ошибки 5xx",
                      "p50",
                      "p95",
                      "p99",
                    ].map((text) => (
                      <th
                        key={text}
                        scope="col"
                        className="whitespace-nowrap px-4 py-3 font-medium"
                      >
                        {copy(text)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {value.routes.map((route) => (
                    <tr
                      key={route.route}
                      className="border-b last:border-0"
                    >
                      <th
                        scope="row"
                        className="whitespace-nowrap px-4 py-3 text-xs font-normal"
                      >
                        <code>{route.route}</code>
                      </th>
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                        {route.samples}{" "}
                        {route.limited && (
                          <Badge variant="outline">
                            {copy("Лимит выборки")}
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 tabular-nums">{route.errors}</td>
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                        {milliseconds(route.p50Ms)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                        {route.samples >= 20 ? milliseconds(route.p95Ms) : "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                        {route.samples >= 100 ? milliseconds(route.p99Ms) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs leading-5 text-muted-foreground">
            {copy(
              "p95 — 95% измеренных запросов быстрее этого значения; p99 — 99%. p95 показывается от 20 измерений, p99 — от 100. При лимите учитываются последние 2 000 запросов маршрута. Время streaming-запроса включает передачу всего ответа.",
            )}
          </p>
          <p className="text-xs leading-5 text-muted-foreground">
            {copy(
              "Память и очередь БД показывают текущее состояние процесса. p99 event loop — с момента включения сбора, с точностью таймера 20 мс.",
            )}
          </p>
          {value.routesLimited && (
            <p className="text-xs text-muted-foreground">
              {copy(
                "Достигнут лимит 128 маршрутов. Часть маршрутов не включена в локальную статистику.",
              )}
            </p>
          )}
        </>
      )}
    </section>
  );
}
