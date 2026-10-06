"use client";

import type {
  IntegrationSection,
  IntegrationValues,
} from "@asmblyr-collaborative/contracts";
import { useUiCopy } from "@/lib/ui-copy";
import {
  ConnectionEnabled,
  ConnectionField,
  ConnectionGrid,
  ConnectionSelect,
} from "./fields";

export function ConnectionFields({
  section,
  value,
  onChange,
  disabled,
  readOnly = false,
}: {
  section: Exclude<IntegrationSection, "monitoring">;
  value: IntegrationValues[IntegrationSection];
  onChange: (value: IntegrationValues[IntegrationSection]) => void;
  disabled: boolean;
  readOnly?: boolean;
}) {
  const copy = useUiCopy();
  if (section === "google") {
    const current = value as IntegrationValues["google"];
    return (
      <div className="space-y-4">
        <ConnectionEnabled
          value={current.enabled}
          disabled={disabled}
          onChange={(enabled) => onChange({ ...current, enabled })}
        />
        <ConnectionField
          label="OAuth client ID"
          value={current.clientId}
          disabled={disabled}
          onChange={(clientId) => onChange({ ...current, clientId })}
        />
        <ConnectionField
          label="OAuth redirect URI"
          value={current.redirectUri}
          placeholder="https://admin.example.com/connections/google/callback"
          disabled={disabled}
          onChange={(redirectUri) => onChange({ ...current, redirectUri })}
        />
        <p className="text-xs leading-5 text-muted-foreground">
          {copy(
            "Google Drive и Sheets: чтение и запись. Добавьте этот redirect URI в Google Cloud. Пользователи подключают свои аккаунты отдельно. Проверка конфигурации проверяет параметры и шифрование; OAuth проверяется при подключении аккаунта.",
          )}
        </p>
      </div>
    );
  }
  if (section === "encryption") {
    const current = value as IntegrationValues["encryption"];
    return (
      <div className="space-y-4">
        <ConnectionSelect
          label="Способ шифрования"
          value={current.provider}
          options={[
            ["local", "Локальный ключ из env"],
            ["yandex-kms", "Yandex KMS"],
          ]}
          disabled={disabled}
          onChange={(provider) =>
            onChange({
              ...current,
              provider: provider as typeof current.provider,
            })
          }
        />
        {current.provider === "yandex-kms" && (
          <ConnectionGrid>
            <ConnectionField
              label="ID ключа KMS"
              value={current.keyId}
              disabled={disabled}
              onChange={(keyId) => onChange({ ...current, keyId })}
            />
            <ConnectionField
              label="ID сервисного аккаунта"
              value={current.serviceAccountId}
              disabled={disabled}
              onChange={(serviceAccountId) =>
                onChange({ ...current, serviceAccountId })
              }
            />
          </ConnectionGrid>
        )}
      </div>
    );
  }
  if (section === "storage") {
    const current = value as IntegrationValues["storage"];
    return (
      <div className="space-y-4">
        <ConnectionEnabled
          value={current.enabled}
          disabled={disabled}
          onChange={(enabled) => onChange({ ...current, enabled })}
        />
        <ConnectionSelect
          label="Провайдер"
          value={current.provider}
          options={[
            ["s3", "S3"],
            ["yandex", "Yandex Object Storage · федерация"],
          ]}
          disabled={disabled}
          onChange={(provider) =>
            onChange({
              ...current,
              provider: provider as typeof current.provider,
            })
          }
        />
        <ConnectionGrid>
          <ConnectionField
            label="Бакет"
            readOnly={readOnly}
            value={current.bucket}
            disabled={disabled}
            onChange={(bucket) => onChange({ ...current, bucket })}
          />
          {current.provider === "s3" ? (
            <ConnectionField
              label="Регион"
              readOnly={readOnly}
              value={current.region}
              disabled={disabled}
              onChange={(region) => onChange({ ...current, region })}
            />
          ) : (
            <ConnectionField
              label="ID сервисного аккаунта"
              readOnly={readOnly}
              value={current.serviceAccountId}
              disabled={disabled}
              onChange={(serviceAccountId) =>
                onChange({ ...current, serviceAccountId })
              }
            />
          )}
        </ConnectionGrid>
        {current.provider === "s3" && (
          <ConnectionField
            label="Адрес S3 API"
            readOnly={readOnly}
            value={current.endpoint}
            placeholder="https://storage.yandexcloud.net"
            disabled={disabled}
            onChange={(endpoint) => onChange({ ...current, endpoint })}
          />
        )}
      </div>
    );
  }
  const current = value as IntegrationValues["assistant"];
  return (
    <div className="space-y-4">
      <ConnectionEnabled
        value={current.enabled}
        disabled={disabled}
        onChange={(enabled) => onChange({ ...current, enabled })}
      />
      <ConnectionField
        label="Адрес API"
        value={current.baseURL}
        disabled={disabled}
        onChange={(baseURL) => onChange({ ...current, baseURL })}
      />
      <ConnectionGrid>
        <ConnectionField
          label="Модель"
          value={current.model}
          disabled={disabled}
          onChange={(model) => onChange({ ...current, model })}
        />
        <ConnectionSelect
          label="Формат API"
          value={current.api}
          options={[
            ["responses", "Responses"],
            ["chat-completions", "Chat Completions"],
          ]}
          disabled={disabled}
          onChange={(api) =>
            onChange({ ...current, api: api as typeof current.api })
          }
        />
        <ConnectionField
          label="Таймаут, мс"
          type="number"
          value={current.timeoutMs}
          disabled={disabled}
          onChange={(timeoutMs) =>
            onChange({ ...current, timeoutMs: Number(timeoutMs) })
          }
        />
        <ConnectionField
          label="Максимум выходных токенов"
          type="number"
          value={current.maxOutputTokens}
          disabled={disabled}
          onChange={(maxOutputTokens) =>
            onChange({ ...current, maxOutputTokens: Number(maxOutputTokens) })
          }
        />
        <ConnectionSelect
          label="Усилие рассуждения"
          value={current.effort || "default"}
          options={[
            ["default", "По умолчанию"],
            ["low", "Low"],
            ["medium", "Medium"],
            ["high", "High"],
            ["max", "Max"],
          ]}
          disabled={disabled}
          onChange={(effort) =>
            onChange({
              ...current,
              effort: (effort === "default"
                ? ""
                : effort) as typeof current.effort,
            })
          }
        />
        <ConnectionSelect
          label="Режим thinking"
          value={
            current.thinking === null ? "default" : String(current.thinking)
          }
          options={[
            ["default", "По умолчанию"],
            ["true", "Включено"],
            ["false", "Выключено"],
          ]}
          disabled={disabled}
          onChange={(thinking) =>
            onChange({
              ...current,
              thinking: thinking === "default" ? null : thinking === "true",
            })
          }
        />
      </ConnectionGrid>
    </div>
  );
}
