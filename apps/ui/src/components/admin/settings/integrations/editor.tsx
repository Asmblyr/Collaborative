"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type {
  IntegrationSection,
  IntegrationValues,
  IntegrationsSnapshot,
  IntegrationSecret,
} from "@asmblyr-collaborative/contracts";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { PortalContainerContext } from "@asmblyr-collaborative/kit/ui/portal-container";
import { EditorDialog } from "@/components/collections/editor-dialog";
import { ASSISTANT_SETTINGS_CHANGED } from "@/components/assistant/assistant-types";
import { MONITORING_SETTINGS_CHANGED } from "@/lib/monitoring/controller";
import { apiRequest } from "@/lib/api-request";
import { HttpError } from "@/lib/http-request";
import { useUiCopy } from "@/lib/ui-copy";
import { ConnectionFields } from "./connection-fields";
import { SecretFields } from "./secret-fields";
import { integrationTitles } from "./titles";
import { MonitoringFields } from "../monitoring/fields";
import type { MonitoringTab } from "../monitoring/target-fields";

const errors: Record<string, string> = {
  integration_sentry_server_dsn_missing:
    "Укажите DSN на вкладке «Сервер» или отключите сбор для сервера.",
  integration_sentry_browser_dsn_missing:
    "Укажите DSN на вкладке «Интерфейс» или отключите сбор для интерфейса.",
  integration_sentry_dsn_invalid:
    "Укажите Sentry DSN: HTTPS, публичный ключ и ID проекта, без пароля и параметров запроса.",
  integration_environment_locked:
    "Подключение настроено через env. Измените конфигурацию сервера.",
  integration_revision_conflict:
    "Настройки уже изменены. Закройте редактор и обновите страницу.",
  integration_storage_has_files:
    "В хранилище уже есть файлы. Сначала перенесите их перед сменой бакета или провайдера.",
  integration_credentials_missing: "Укажите ключи подключения.",
  integration_identity_missing: "На сервере не настроен файл токена федерации.",
  integration_disabled: "Включите подключение для проверки.",
  integration_value_invalid:
    "Проверьте обязательные поля и параметры провайдера.",
  integration_url_invalid:
    "Используйте адрес HTTPS без логина, пароля и параметров запроса.",
  integration_secret_invalid: "Введите непустой ключ без переносов строк.",
};

export function IntegrationEditor({
  section,
  snapshot,
  onClose,
  onSave,
}: {
  section: IntegrationSection;
  snapshot: IntegrationsSnapshot;
  onClose: () => void;
  onSave: (value: IntegrationsSnapshot) => void;
}) {
  const copy = useUiCopy();
  const router = useRouter();
  const state = snapshot[section];
  const [value, setValue] = useState<IntegrationValues[IntegrationSection]>(
    state.value,
  );
  const [secrets, setSecrets] = useState<
    Partial<Record<IntegrationSecret, string | null>>
  >({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [checked, setChecked] = useState(false);
  const [monitoringTab, setMonitoringTab] = useState<MonitoringTab>("server");
  const dirty =
    JSON.stringify(value) !== JSON.stringify(state.value) ||
    Object.keys(secrets).length > 0;
  const secretNames: IntegrationSecret[] =
    section === "google"
      ? ["clientSecret"]
      : section === "assistant"
        ? ["apiKey"]
        : section === "storage" &&
            (value as IntegrationValues["storage"]).provider === "s3"
          ? ["accessKeyId", "secretAccessKey", "sessionToken"]
          : [];
  const changeValue = (next: IntegrationValues[IntegrationSection]) => {
    setValue(next);
    setChecked(false);
  };
  const changeSecret = (
    key: IntegrationSecret,
    next: string | null | undefined,
  ) => {
    setSecrets((current) => {
      const result = { ...current };
      if (next === undefined) {
        delete result[key];
      } else {
        result[key] = next;
      }
      return result;
    });
    setChecked(false);
  };
  async function submit(test: boolean) {
    setBusy(true);
    setError("");
    setChecked(false);
    try {
      const path = `/api/settings/integrations/${section}`;
      const payload = { revision: snapshot.revision, value, secrets };
      if (test) {
        await apiRequest(`${path}/test`, "POST", payload);
        setChecked(true);
      } else {
        const updated = await apiRequest<IntegrationsSnapshot>(
          path,
          "PUT",
          payload,
        );
        window.dispatchEvent(new Event(ASSISTANT_SETTINGS_CHANGED));
        window.dispatchEvent(new Event(MONITORING_SETTINGS_CHANGED));
        router.refresh();
        onSave(updated);
      }
    } catch (failure) {
      if (
        failure instanceof HttpError &&
        failure.code === "integration_sentry_server_dsn_missing"
      ) {
        setMonitoringTab("server");
      }
      if (
        failure instanceof HttpError &&
        failure.code === "integration_sentry_browser_dsn_missing"
      ) {
        setMonitoringTab("browser");
      }
      setError(
        copy(
          failure instanceof HttpError && failure.code && errors[failure.code]
            ? errors[failure.code]
            : "Не удалось выполнить действие. Проверьте настройки подключения и защиту секретов на сервере.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <EditorDialog
      open
      title={copy(integrationTitles[section])}
      eyebrow={copy("Подключения")}
      onClose={onClose}
      busy={busy}
      hasUnsavedChanges={dirty}
      footer={(close) => (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void submit(true)}
          >
            {copy(
              busy
                ? "Подождите…"
                : section === "google" || section === "monitoring"
                  ? "Проверить конфигурацию"
                  : "Проверить соединение",
            )}
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={close}
            >
              {copy("Отмена")}
            </Button>
            {!state.readOnly && (
              <Button
                type="button"
                size="sm"
                disabled={busy || (section !== "encryption" && !dirty)}
                onClick={() => void submit(false)}
              >
                {copy(
                  section === "encryption" && dirty
                    ? "Сменить защиту"
                    : "Сохранить",
                )}
              </Button>
            )}
          </div>
        </div>
      )}
    >
      {(container) => (
        <PortalContainerContext.Provider value={container}>
          <div className="space-y-5">
            {state.readOnly && (
              <p className="rounded-lg border bg-muted/40 p-3 text-sm leading-6">
                {copy(
                  "Подключение настроено через env или файл конфигурации. Редактирование в админке недоступно.",
                )}
              </p>
            )}
            {section === "encryption" && (
              <p className="text-sm leading-6 text-muted-foreground">
                {copy(
                  "Сохранено секретов: {{count}}. При смене защиты они перешифровываются вместе; при ошибке сохраняется прежняя настройка.",
                  { count: snapshot.savedSecretCount },
                )}
              </p>
            )}
            {section === "monitoring" ? (
              <MonitoringFields
                readOnly={state.readOnly}
                value={value as IntegrationValues["monitoring"]}
                onChange={changeValue}
                disabled={busy || state.readOnly}
                tab={monitoringTab}
                onTabChange={setMonitoringTab}
                configured={state.secrets}
                draft={secrets}
                onSecretChange={changeSecret}
              />
            ) : (
              <>
                <ConnectionFields
                  readOnly={state.readOnly}
                  section={section}
                  value={value}
                  disabled={busy || state.readOnly}
                  onChange={changeValue}
                />
                <SecretFields
                  names={secretNames}
                  configured={state.secrets}
                  draft={secrets}
                  disabled={busy || state.readOnly}
                  onChange={changeSecret}
                />
              </>
            )}
            {section === "encryption" && (
              <p className="text-xs leading-5 text-muted-foreground">
                {copy(
                  (value as IntegrationValues["encryption"]).provider ===
                    "local"
                    ? snapshot.bootstrap.localKey
                      ? "Локальный ключ настроен на сервере. Сохраните его резервную копию вместе с базой."
                      : "Добавьте SECRETS_LOCAL_KEY на сервере: 32 случайных байта в base64url."
                    : snapshot.bootstrap.workloadIdentity
                      ? "Файл токена федерации настроен. Сервисному аккаунту нужны права на шифрование и расшифровку этим ключом."
                      : "Добавьте YC_OIDC_TOKEN_FILE на сервере и настройте федерацию Yandex Cloud.",
                )}
              </p>
            )}
            {section === "assistant" && (
              <p className="text-xs leading-5 text-muted-foreground">
                {copy(
                  "Проверка запрашивает список моделей без генерации ответа. Инструкции ассистента настраиваются отдельно.",
                )}
              </p>
            )}
            {section === "storage" && (
              <p className="text-xs leading-5 text-muted-foreground">
                {copy(
                  "Проверка читает сведения о бакете без загрузки файлов. При отключении файлы сохраняются.",
                )}
              </p>
            )}
            {section === "monitoring" && (
              <p className="text-xs leading-5 text-muted-foreground">
                {copy(
                  "Проверяются формат DSN и доступность сохранённых ключей. Событие в Sentry не отправляется. Записи, сообщения, SQL и секреты в мониторинг не передаются.",
                )}
              </p>
            )}
            {error && (
              <p
                role="alert"
                className="text-sm text-destructive"
              >
                {error}
              </p>
            )}
            {checked && (
              <p
                role="status"
                className="text-sm text-primary"
              >
                {copy(
                  section === "google" || section === "monitoring"
                    ? "Конфигурация проверена. Настройки ещё не сохранены."
                    : "Соединение проверено. Настройки ещё не сохранены.",
                )}
              </p>
            )}
          </div>
        </PortalContainerContext.Provider>
      )}
    </EditorDialog>
  );
}
