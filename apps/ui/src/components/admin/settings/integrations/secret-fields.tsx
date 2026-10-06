"use client";

import type { IntegrationSecret } from "@asmblyr-collaborative/contracts";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { useUiCopy } from "@/lib/ui-copy";
import { ConnectionField } from "./fields";

const labels = {
  dsn: "Sentry DSN",
  serverDsn: "Sentry DSN · сервер",
  browserDsn: "Sentry DSN · интерфейс",
  clientSecret: "OAuth client secret",
  accessKeyId: "Access key ID",
  secretAccessKey: "Secret access key",
  sessionToken: "Session token · необязательно",
  apiKey: "API-ключ",
};

export function SecretFields({
  names,
  configured,
  draft,
  disabled,
  onChange,
}: {
  names: IntegrationSecret[];
  configured: Partial<Record<IntegrationSecret, boolean>>;
  draft: Partial<Record<IntegrationSecret, string | null>>;
  disabled: boolean;
  onChange: (key: IntegrationSecret, value: string | null | undefined) => void;
}) {
  const copy = useUiCopy();
  if (!names.length) {
    return null;
  }
  return (
    <div className="space-y-4 border-t pt-5">
      {names.map((name) => (
        <div
          key={name}
          className="space-y-1"
        >
          <ConnectionField
            label={labels[name]}
            type="password"
            value={draft[name] ?? ""}
            disabled={disabled || draft[name] === null}
            placeholder={copy(
              configured[name]
                ? "Ключ задан · оставьте пустым, чтобы сохранить"
                : "Ключ не задан",
            )}
            onChange={(value) => onChange(name, value || undefined)}
          />
          {configured[name] && !disabled && (
            <Button
              size="sm"
              variant="ghost"
              type="button"
              className="h-7 px-0 text-xs"
              onClick={() =>
                onChange(name, draft[name] === null ? undefined : null)
              }
            >
              {copy(
                draft[name] === null
                  ? "Отменить удаление ключа"
                  : "Удалить сохранённый ключ",
              )}
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}
