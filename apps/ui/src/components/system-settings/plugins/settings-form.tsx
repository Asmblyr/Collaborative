"use client";

import { useState } from "react";
import type { PluginSettingsSnapshot } from "@asmblyr/contracts";
import { Button } from "@asmblyr/kit/ui/button";
import { SettingInput } from "./setting-input";
import { useEditorState } from "@/components/collections/editor-lifecycle";

export function PluginSettingsForm({
  readOnly = false,
  initial,
  onChange,
}: {
  readOnly?: boolean;
  initial: PluginSettingsSnapshot;
  onChange: (settings: PluginSettingsSnapshot) => void;
}) {
  const [saved, setSaved] = useState(initial);
  const [values, setValues] = useState(initial.values);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [conflict, setConflict] = useState(false);
  const dirty = Object.keys(values).some(
    (key) => values[key] !== saved.values[key],
  );
  useEditorState(dirty, pending);
  const path = `/api/settings/plugins/${encodeURIComponent(initial.namespace)}`;

  async function request(method: "GET" | "PUT") {
    if (method === "PUT" && readOnly) {
      return;
    }
    setPending(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(path, {
        method,
        ...(method === "PUT"
          ? {
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ values, revision: saved.revision }),
            }
          : {}),
      });
      const result = await response.json();
      if (!response.ok) {
        setConflict(response.status === 409);
        throw new Error(result.message ?? "Не удалось сохранить настройки");
      }
      const snapshot: PluginSettingsSnapshot = result.data;
      setSaved(snapshot);
      setValues(snapshot.values);
      setConflict(false);
      onChange(snapshot);
      setMessage(
        method === "PUT"
          ? "Настройки сохранены. Изменения действуют в новых запросах."
          : "Загружена текущая версия настроек.",
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Настройки недоступны");
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        if (!readOnly && !pending && !conflict && dirty) {
          void request("PUT");
        }
      }}
    >
      <fieldset
        disabled={pending || readOnly}
        className="space-y-5"
      >
        {Object.entries(saved.definition.fields).map(([name, field]) => {
          const id = `${initial.namespace}-${name}`;
          return (
            <div
              key={name}
              className={
                field.type === "boolean"
                  ? "flex items-start justify-between gap-5 sm:max-w-md"
                  : "grid gap-2 sm:max-w-md"
              }
            >
              <div className="space-y-1">
                <label
                  htmlFor={id}
                  className="text-sm font-medium"
                >
                  {field.label}
                </label>
                {field.description && (
                  <p
                    id={`${id}-description`}
                    className="text-xs leading-5 text-muted-foreground"
                  >
                    {field.description}
                  </p>
                )}
              </div>
              <SettingInput
                id={id}
                field={field}
                value={values[name]}
                onChange={(value) => {
                  setValues((current) => ({ ...current, [name]: value }));
                  setMessage("");
                }}
              />
            </div>
          );
        })}
      </fieldset>
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
      {!readOnly && (
        <div className="flex flex-wrap gap-2 border-t pt-4">
          <Button
            type="submit"
            disabled={pending || !dirty || conflict}
          >
            {pending ? "Сохранение…" : "Сохранить"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={pending || !dirty}
            onClick={() => {
              setValues(saved.values);
              setError("");
              setMessage("");
            }}
          >
            Отменить изменения
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={pending || readOnly}
            onClick={() => {
              setValues(
                Object.fromEntries(
                  Object.entries(saved.definition.fields).map(
                    ([key, field]) => [key, field.default],
                  ),
                ),
              );
              setMessage("");
            }}
          >
            По умолчанию
          </Button>
          {conflict && (
            <Button
              type="button"
              variant="outline"
              disabled={pending || readOnly}
              onClick={() => void request("GET")}
            >
              Загрузить актуальные и заменить черновик
            </Button>
          )}
        </div>
      )}
    </form>
  );
}
