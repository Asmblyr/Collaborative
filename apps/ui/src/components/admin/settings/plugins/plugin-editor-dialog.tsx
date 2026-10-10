"use client";

import { useEffect, useState } from "react";
import { PortalContainerContext } from "@asmblyr-collaborative/kit/ui/portal-container";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { useTranslations } from "@asmblyr-collaborative/kit/ui/i18n";
import { EditorDialog } from "@/components/collections/editor-dialog";
import { Badge } from "@/components/ui/badge";
import { PluginSettingsForm } from "./settings-form";
import { ExtensionHistory } from "./extension-history";
import { capabilityLabels, type PluginSettingsEntry } from "./types";
import type {
  ExtensionEntry,
  ExtensionHistoryEntry,
} from "@asmblyr-collaborative/contracts";
import { useUiCopy } from "@/lib/ui-copy";

export function PluginEditorDialog({
  readOnly = false,
  entry,
  dependents,
  plugin,
  onClose,
  onEntryChange,
  onSettingsChange,
}: {
  readOnly?: boolean;
  entry: ExtensionEntry | null;
  dependents: string[];
  plugin: PluginSettingsEntry | null;
  onClose: () => void;
  onEntryChange: (entry: ExtensionEntry) => void;
  onSettingsChange: () => void;
}) {
  const copy = useUiCopy();
  const { translate } = useTranslations();
  const [history, setHistory] = useState<ExtensionHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const entryId = entry?.id;
  useEffect(() => {
    if (!entryId) {
      return;
    }
    const controller = new AbortController();
    void fetch(`/api/settings/extension-registry/${entryId}/history`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.message ?? "Activity unavailable");
        }
        setHistory(result.data);
        setHistoryLoading(false);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) {
          setHistoryError(
            cause instanceof Error ? cause.message : "Activity unavailable",
          );
          setHistoryLoading(false);
        }
      });
    return () => controller.abort();
  }, [entryId]);

  async function change(enabled: boolean) {
    if (!entry || readOnly || busy) {
      return;
    }
    const action = enabled ? "enable" : "disable";
    const warning =
      !enabled && dependents.length
        ? `\n${copy("Зависят от этого расширения")}: ${dependents.join(", ")}.`
        : "";
    const prompt = copy(
      enabled
        ? "Включить расширение после перезапуска Core?"
        : "Отключить расширение после перезапуска Core?",
    );
    if (!window.confirm(`${prompt}${warning}`)) {
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(
        `/api/settings/extension-registry/${entry.id}/${action}`,
        { method: "POST" },
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(
          result.message ?? copy("Не удалось изменить состояние расширения"),
        );
      }
      onEntryChange(result.data);
      setMessage(
        copy(
          result.data.restartRequired
            ? "Изменение сохранено. Перезапустите Core."
            : "Состояние сохранено.",
        ),
      );
      const activity = await fetch(
        `/api/settings/extension-registry/${entry.id}/history`,
      );
      if (activity.ok) {
        const updated = await activity.json();
        setHistory(updated.data);
      }
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : copy("Операция недоступна"),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <EditorDialog
      open={entry !== null}
      title={
        entry
          ? entry.namespace
            ? translate(
                `plugin.${entry.namespace}`,
                "settings.title",
                entry.title,
              )
            : entry.title
          : copy("Расширение")
      }
      eyebrow={copy("Центр расширений")}
      size="wide"
      contentKey={entry?.id}
      busy={busy}
      onClose={onClose}
    >
      {(container) =>
        entry && (
          <PortalContainerContext.Provider value={container}>
            <div className="space-y-7">
              <section className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  {entry.packageName}
                </p>
                <p className="text-sm text-muted-foreground">
                  {entry.description ?? copy("Описание не указано.")}
                </p>
                <div className="flex flex-wrap items-center gap-2 text-xs">
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
                  <span>
                    {copy("Версия")} {entry.version}
                  </span>
                  {entry.publisher && <span>· {entry.publisher.name}</span>}
                </div>
                <p className="text-sm">
                  {copy("Требуется")}:{" "}
                  {copy(
                    entry.desiredState === "enabled" ? "Включено" : "Отключено",
                  )}{" "}
                  · {copy("В этом Core")}:{" "}
                  {copy(
                    entry.actualState === "enabled"
                      ? "Активно"
                      : entry.actualState === "failed"
                        ? "Ошибка"
                        : "Неактивно",
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  Core instance: {entry.instanceId}
                </p>
                {entry.lastError && (
                  <p
                    role="alert"
                    className="text-sm text-destructive"
                  >
                    {copy("Ошибка загрузки")}: {entry.lastError}
                  </p>
                )}
                {dependents.length > 0 && (
                  <p className="text-sm text-amber-700">
                    {copy("Зависят от этого расширения")}:{" "}
                    {dependents.join(", ")}
                  </p>
                )}
                {entry.restartRequired && (
                  <p
                    role="status"
                    className="text-sm text-muted-foreground"
                  >
                    {copy(
                      "Текущий процесс продолжает прежний режим до перезапуска Core.",
                    )}
                  </p>
                )}
                {entry.issues.map((issue) => (
                  <p
                    role="alert"
                    key={issue}
                    className="text-sm text-destructive"
                  >
                    {issue}
                  </p>
                ))}
              </section>
              <section className="space-y-3 border-t pt-5">
                <h3 className="text-sm font-medium">{copy("Управление")}</h3>
                <div className="flex flex-wrap gap-2">
                  {!readOnly && entry.actions.enable && (
                    <Button
                      type="button"
                      disabled={busy}
                      onClick={() => void change(true)}
                    >
                      {busy ? copy("Сохранение…") : copy("Включить")}
                    </Button>
                  )}
                  {!readOnly && entry.actions.disable && (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void change(false)}
                    >
                      {busy ? copy("Сохранение…") : copy("Отключить")}
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {copy(
                    "Установка и обновление пакета выполняются доверенным процессом развёртывания.",
                  )}
                </p>
                {error && (
                  <p
                    role="alert"
                    className="text-sm text-destructive"
                  >
                    {error}
                  </p>
                )}
                {message && (
                  <p
                    role="status"
                    className="text-sm text-muted-foreground"
                  >
                    {message}
                  </p>
                )}
              </section>
              <section className="space-y-3 border-t pt-5">
                <h3 className="text-sm font-medium">
                  {copy("Версии и совместимость")}
                </h3>
                <p className="text-sm">
                  {copy("Установлена версия")} {entry.version}.{" "}
                  {entry.latestAvailableVersion
                    ? `${copy("Доступна версия")} ${entry.latestAvailableVersion}.`
                    : copy("Внешний каталог версий не подключён.")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {copy("Collaborative")}:{" "}
                  {entry.compatibility?.collaborative ?? "*"} · Node:{" "}
                  {entry.compatibility?.node ?? "*"}
                </p>
              </section>
              <section className="space-y-3 border-t pt-5">
                <h3 className="text-sm font-medium">{copy("Зависимости")}</h3>
                {Object.keys(entry.dependencies).length ? (
                  <ul className="list-inside list-disc text-sm">
                    {Object.entries(entry.dependencies).map(([name, range]) => (
                      <li key={name}>
                        {name} {range}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {copy("Обязательных зависимостей нет.")}
                  </p>
                )}
                {Object.keys(entry.optionalDependencies).length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {copy("Необязательные")}:{" "}
                    {Object.entries(entry.optionalDependencies)
                      .map(([name, range]) => `${name} ${range}`)
                      .join(", ")}
                  </p>
                )}
              </section>
              <section className="space-y-3 border-t pt-5">
                <h3 className="text-sm font-medium">{copy("Разрешения")}</h3>
                <div className="flex flex-wrap gap-2">
                  {entry.capabilities.map((capability) => (
                    <Badge
                      key={capability}
                      variant="secondary"
                    >
                      {copy(capabilityLabels[capability] ?? capability)}
                    </Badge>
                  ))}
                </div>
                {!entry.capabilities.length && (
                  <p className="text-sm text-muted-foreground">
                    {copy("Дополнительные возможности не запрошены.")}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  {copy(
                    "Разрешения утверждаются в конфигурации проекта до запуска Core.",
                  )}
                </p>
              </section>
              <section className="space-y-3 border-t pt-5">
                <h3 className="text-sm font-medium">{copy("Конфигурация")}</h3>
                {plugin?.settings && entry.loaded ? (
                  <PluginSettingsForm
                    readOnly={readOnly}
                    key={entry.id}
                    initial={plugin.settings}
                    onChange={onSettingsChange}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {copy("Настройки недоступны для этого расширения.")}
                  </p>
                )}
              </section>
              <section className="space-y-3 border-t pt-5">
                <h3 className="text-sm font-medium">
                  {copy("Состояние и диагностика")}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {entry.issues.length
                    ? entry.issues.join("; ")
                    : copy(
                        entry.loaded
                          ? "Код расширения загружен в текущем процессе."
                          : "Код расширения не загружен в текущем процессе.",
                      )}
                </p>
              </section>
              <ExtensionHistory
                history={history}
                error={historyError}
                loading={historyLoading}
              />
            </div>
          </PortalContainerContext.Provider>
        )
      }
    </EditorDialog>
  );
}
