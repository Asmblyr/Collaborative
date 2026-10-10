"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Puzzle, Search } from "lucide-react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { useTranslations } from "@asmblyr-collaborative/kit/ui/i18n";
import { Input } from "@asmblyr-collaborative/kit/ui/input";
import { PageHeader } from "@/components/layout/page-header";
import { SettingsReadOnlyNotice } from "@/components/admin/settings/read-only-notice";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PluginEditorDialog } from "./plugin-editor-dialog";
import type { ExtensionEntry } from "@asmblyr-collaborative/contracts";
import type { PluginSettingsEntry } from "./types";
import { useUiCopy } from "@/lib/ui-copy";

export function PluginsWorkspace({
  readOnly = false,
  plugins,
  registry,
}: {
  readOnly?: boolean;
  plugins: PluginSettingsEntry[];
  registry: ExtensionEntry[];
}) {
  const copy = useUiCopy();
  const { translate } = useTranslations();
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState<"title" | "version" | "status">("title");

  const rows = registry;
  const selection = rows.find((entry) => entry.id === selectedId) ?? null;
  const categories = [
    ...new Set(
      rows.flatMap((entry) => (entry.category ? [entry.category] : [])),
    ),
  ].sort();
  const visible = useMemo(
    () =>
      rows
        .filter(
          (entry) =>
            !search ||
            `${entry.title} ${entry.packageName} ${entry.description ?? ""}`
              .toLowerCase()
              .includes(search.toLowerCase()),
        )
        .filter((entry) => !status || entry.status === status)
        .filter((entry) => !category || entry.category === category)
        .sort((left, right) =>
          String(left[sort]).localeCompare(String(right[sort]), undefined, {
            numeric: sort === "version",
          }),
        ),
    [rows, search, status, category, sort],
  );
  const counts = {
    installed: rows.length,
    available: null,
    active: rows.filter((entry) => entry.loaded).length,
    disabled: rows.filter((entry) => entry.status === "disabled").length,
    failed: rows.filter((entry) =>
      ["incompatible", "failed"].includes(entry.status),
    ).length,
    updates: null,
  };

  return (
    <section className="space-y-6">
      <PageHeader
        title={copy("Расширения")}
        description={copy(
          "Установленные доверенные пакеты, их состояние, зависимости и разрешения.",
        )}
      />
      <SettingsReadOnlyNotice readOnly={readOnly} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {(
          [
            ["Установлено", counts.installed],
            ["Доступно", counts.available],
            ["Активно", counts.active],
            ["Отключено", counts.disabled],
            ["Проблемы", counts.failed],
            ["Обновления", counts.updates],
          ] as const
        ).map(([label, count]) => (
          <div
            key={label}
            className="rounded-xl border p-4"
          >
            <p className="text-xs text-muted-foreground">{copy(label)}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {count ?? "—"}
            </p>
            {(label === "Обновления" || label === "Доступно") && (
              <p className="text-xs text-muted-foreground">
                {copy("Каталог не подключён")}
              </p>
            )}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-3">
        <label className="relative min-w-52 flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <span className="sr-only">{copy("Поиск расширений")}</span>
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={copy("Поиск расширений")}
            className="pl-9"
          />
        </label>
        <label
          className="sr-only"
          htmlFor="extension-status"
        >
          {copy("Статус")}
        </label>
        <select
          id="extension-status"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="rounded-md border bg-background px-3 text-sm"
        >
          <option value="">{copy("Все статусы")}</option>
          <option value="healthy">{copy("Активно")}</option>
          <option value="disabled">{copy("Отключено")}</option>
          <option value="restart_required">{copy("Нужен перезапуск")}</option>
          <option value="incompatible">{copy("Проблемы")}</option>
          <option value="failed">{copy("Ошибка запуска")}</option>
        </select>
        {categories.length > 0 && (
          <>
            <label
              className="sr-only"
              htmlFor="extension-category"
            >
              {copy("Категория")}
            </label>
            <select
              id="extension-category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="rounded-md border bg-background px-3 text-sm"
            >
              <option value="">{copy("Все категории")}</option>
              {categories.map((value) => (
                <option
                  key={value}
                  value={value}
                >
                  {value}
                </option>
              ))}
            </select>
          </>
        )}
        <label
          className="sr-only"
          htmlFor="extension-sort"
        >
          {copy("Сортировка")}
        </label>
        <select
          id="extension-sort"
          value={sort}
          onChange={(event) =>
            setSort(event.target.value as "title" | "version" | "status")
          }
          className="rounded-md border bg-background px-3 text-sm"
        >
          <option value="title">{copy("По названию")}</option>
          <option value="version">{copy("По версии")}</option>
          <option value="status">{copy("По статусу")}</option>
        </select>
      </div>
      {visible.length ? (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{copy("Расширение")}</TableHead>
                <TableHead>{copy("Версия")}</TableHead>
                <TableHead>{copy("Статус")}</TableHead>
                <TableHead>{copy("Требуется")}</TableHead>
                <TableHead>{copy("В процессе")}</TableHead>
                <TableHead>{copy("Издатель")}</TableHead>
                <TableHead>
                  <span className="sr-only">{copy("Открыть")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>
                    <Button
                      type="button"
                      variant="link"
                      className="h-auto max-w-full justify-start p-0 text-left font-medium"
                      onClick={() => setSelectedId(entry.id)}
                    >
                      <Puzzle
                        className="mr-2 size-4 shrink-0"
                        aria-hidden="true"
                      />
                      {entry.namespace
                        ? translate(
                            `plugin.${entry.namespace}`,
                            "settings.title",
                            entry.title,
                          )
                        : entry.title}
                    </Button>
                    <p className="mt-1 max-w-md truncate text-xs text-muted-foreground">
                      {entry.description ?? entry.packageName}
                    </p>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {entry.version}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {copy(
                        entry.status === "restart_required"
                          ? "Нужен перезапуск"
                          : entry.status === "disabled"
                            ? "Отключено"
                            : entry.status === "incompatible"
                              ? "Проблемы"
                              : entry.status === "failed"
                                ? "Ошибка запуска"
                                : "Активно",
                      )}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {copy(
                      entry.desiredState === "enabled"
                        ? "Включено"
                        : "Отключено",
                    )}
                  </TableCell>
                  <TableCell>
                    {copy(
                      entry.actualState === "enabled"
                        ? "Активно"
                        : entry.actualState === "failed"
                          ? "Ошибка"
                          : "Неактивно",
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {entry.publisher?.name ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={copy("Открыть расширение {{value0}}", {
                        value0: entry.title,
                      })}
                      onClick={() => setSelectedId(entry.id)}
                    >
                      <ArrowUpRight className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
          {copy(
            rows.length
              ? "Расширения не найдены."
              : "Нет настроенных расширений.",
          )}
        </p>
      )}
      <PluginEditorDialog
        key={selectedId ?? "closed"}
        readOnly={readOnly}
        entry={selection}
        dependents={
          selection
            ? rows
                .filter(
                  (candidate) =>
                    candidate.desiredState === "enabled" &&
                    selection.packageName in candidate.dependencies,
                )
                .map((candidate) => candidate.title)
            : []
        }
        plugin={
          plugins.find((plugin) => plugin.name === selection?.packageName) ??
          null
        }
        onClose={() => setSelectedId(null)}
        onEntryChange={() => router.refresh()}
        onSettingsChange={() => router.refresh()}
      />
    </section>
  );
}
