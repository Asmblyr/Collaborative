"use client";

import { useState } from "react";
import { Button } from "@asmblyr/kit/ui/button";
import { Input } from "@asmblyr/kit/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/api-request";
import type { ServiceFederation } from "./types";

export function ServiceFederations({
  readOnly = false,
  accountId,
  active,
  initial,
  onBusy,
}: {
  readOnly?: boolean;
  accountId: string;
  active: boolean;
  initial: ServiceFederation[];
  onBusy: (busy: boolean) => void;
}) {
  const [bindings, setBindings] = useState(initial);
  const [form, setForm] = useState({
    name: "GitLab CI",
    projectId: "",
    projectPath: "",
    ref: "main",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);
  async function run(action: () => Promise<void>) {
    if (readOnly || busy) {
      return;
    }
    setBusy(true);
    onBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Не удалось сохранить федерацию",
      );
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }
  return (
    <div className="space-y-5">
      <p className="text-sm leading-6 text-muted-foreground">
        GitLab.com подтверждает, какой проект и ветка запустили задачу.
        Постоянный секрет для CI не нужен. Доступ задают политики этого
        аккаунта.
      </p>
      {active && !readOnly && (
        <form
          className="space-y-4 rounded-xl border p-4"
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              const binding = await apiRequest<ServiceFederation>(
                `/api/service-accounts/${accountId}/federations`,
                "POST",
                form,
              );
              setBindings((current) => [binding, ...current]);
            });
          }}
        >
          <fieldset
            disabled={busy}
            className="grid gap-4 sm:grid-cols-2"
          >
            {(
              [
                {
                  key: "name",
                  label: "Название",
                  placeholder: "GitLab CI",
                  max: 120,
                },
                {
                  key: "projectId",
                  label: "ID проекта",
                  placeholder: "12345678",
                  max: 30,
                },
                {
                  key: "projectPath",
                  label: "Путь проекта",
                  placeholder: "group/project",
                  max: 255,
                },
                {
                  key: "ref",
                  label: "Защищённая ветка",
                  placeholder: "main",
                  max: 255,
                },
              ] as const
            ).map(({ key, label, placeholder, max }) => (
              <div
                key={key}
                className="space-y-2"
              >
                <Label htmlFor={`federation-${key}`}>{label}</Label>
                <Input
                  id={`federation-${key}`}
                  required
                  maxLength={max}
                  placeholder={placeholder}
                  value={form[key]}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      [key]: event.target.value,
                    }))
                  }
                />
              </div>
            ))}
          </fieldset>
          <p className="text-xs text-muted-foreground">
            Только указанная защищённая ветка. Merge request pipelines не
            допускаются.
          </p>
          <Button disabled={busy}>
            {busy ? "Сохраняем…" : "Добавить федерацию"}
          </Button>
        </form>
      )}
      {error && (
        <p
          role="alert"
          className="text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {bindings.length === 0 && (
        <p className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">
          Федераций пока нет
        </p>
      )}
      {bindings.map((binding) => (
        <section
          key={binding.id}
          className="space-y-3 rounded-xl border p-4"
        >
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-medium">{binding.name}</h3>
            <Badge variant="secondary">
              {binding.revokedAt ? "Отозвана" : "GitLab CI"}
            </Badge>
          </div>
          <p className="break-all font-mono text-xs">
            {binding.projectPath} · {binding.ref}
          </p>
          {!binding.revokedAt && (
            <>
              <details className="text-sm">
                <summary className="cursor-pointer font-medium">
                  Подключение к pipeline
                </summary>
                <div className="mt-3 space-y-3 text-muted-foreground">
                  <p>
                    В переменных GitLab CI укажите ASMBLYR_CORE_URL — доступный
                    runner’у HTTPS-адрес Core. Для локального runner допускается
                    localhost.
                  </p>
                  <p>Добавьте в задачу:</p>
                  <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs">{`id_tokens:\n  ASMBLYR_ID_TOKEN:\n    aud: "${binding.audience}"\nvariables:\n  ASMBLYR_FEDERATION_ID: "${binding.id}"`}</pre>
                  <p>Выполните POST /auth/federation-token с JSON:</p>
                  <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs">
                    {JSON.stringify(
                      {
                        federationId: binding.id,
                        assertion: "$ASMBLYR_ID_TOKEN",
                      },
                      null,
                      2,
                    )}
                  </pre>
                  <p>
                    Подставьте токен из переменной окружения. Ответ accessToken
                    передавайте как Bearer. Обмен однократный, срок — до 15
                    минут.
                  </p>
                </div>
              </details>
              {!readOnly &&
                (confirm === binding.id ? (
                  <div className="space-y-2">
                    <p className="text-xs text-destructive">
                      Все токены этой федерации сразу перестанут работать.
                    </p>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            await apiRequest(
                              `/api/service-accounts/${accountId}/federations/${binding.id}`,
                              "DELETE",
                            );
                            setBindings((current) =>
                              current.map((entry) =>
                                entry.id === binding.id
                                  ? {
                                      ...entry,
                                      revokedAt: new Date().toISOString(),
                                    }
                                  : entry,
                              ),
                            );
                            setConfirm(null);
                          })
                        }
                      >
                        Подтвердить отзыв
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => setConfirm(null)}
                      >
                        Отмена
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => setConfirm(binding.id)}
                  >
                    Отозвать
                  </Button>
                ))}
            </>
          )}
        </section>
      ))}
    </div>
  );
}
