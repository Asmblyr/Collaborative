"use client";

import { useState } from "react";
import { Check, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@asmblyr/kit/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@asmblyr/kit/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { apiRequest } from "@/lib/api-request";
import {
  ASSISTANT_SETTINGS_CHANGED,
  effortLabels,
} from "@/components/assistant/assistant-types";
import type { AssistantDefaults, AssistantSystemSettings } from "./types";
import { AssistantInstructions } from "./assistant-instructions";

function supportedValue(settings: AssistantSystemSettings): AssistantDefaults {
  return {
    ...settings.value,
    instructions: settings.value.instructions ?? null,
    reasoningEffort: settings.defaults?.reasoningOptions.includes(
      settings.value.reasoningEffort!,
    )
      ? settings.value.reasoningEffort
      : null,
    thinking:
      settings.defaults?.thinking === "optional"
        ? settings.value.thinking
        : null,
  };
}

export function AssistantForm({
  readOnly = false,
  initial,
}: {
  readOnly?: boolean;
  initial: AssistantSystemSettings;
}) {
  const [saved, setSaved] = useState(initial);
  const [value, setValue] = useState(() => supportedValue(initial));
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const dirty = JSON.stringify(value) !== JSON.stringify(supportedValue(saved));
  const defaults = saved.defaults;
  const instructionsValid =
    value.instructions === null || Boolean(value.instructions.trim());

  function change(patch: Partial<AssistantDefaults>) {
    setValue((previous) => ({ ...previous, ...patch }));
    setMessage("");
    setError("");
  }

  return (
    <form
      className="space-y-5"
      onSubmit={async (event) => {
        event.preventDefault();
        if (readOnly || pending || !dirty || !instructionsValid) {
          return;
        }
        setPending(true);
        setMessage("");
        setError("");
        try {
          const result = await apiRequest<AssistantSystemSettings>(
            "/api/settings/assistant",
            "PUT",
            value,
          );
          setSaved(result);
          setValue(supportedValue(result));
          setMessage("Настройки сохранены");
          window.dispatchEvent(new Event(ASSISTANT_SETTINGS_CHANGED));
        } catch (failure) {
          setError(
            failure instanceof Error
              ? failure.message
              : "Не удалось сохранить настройки",
          );
        } finally {
          setPending(false);
        }
      }}
    >
      <Card className="[--card-spacing:--spacing(5)] sm:[--card-spacing:--spacing(6)]">
        <CardHeader className="border-b">
          <div className="flex items-start justify-between gap-6">
            <div className="space-y-1.5">
              <Label
                htmlFor="system-assistant-enabled"
                className="text-base"
              >
                Ассистент в интерфейсе
              </Label>
              <CardDescription>
                Показывать вкладку AI в панели общения.
              </CardDescription>
            </div>
            <Switch
              id="system-assistant-enabled"
              checked={value.enabled}
              disabled={pending || readOnly}
              onCheckedChange={(enabled) => change({ enabled })}
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="text-muted-foreground">Модель</span>
            <span className="font-medium">{saved.model ?? "Не настроена"}</span>
          </div>
          <p className="text-sm leading-6 text-muted-foreground">
            {saved.configured
              ? "Подключение настроено в Core. Общие параметры ниже применяются ко всем пользователям и рабочим пространствам."
              : "Для работы ассистента нужно настроить AI-провайдера в Core. Вкладка появится после подключения и включения ассистента."}
          </p>
          {!value.enabled && (
            <p className="text-sm text-muted-foreground">
              Ассистент будет скрыт. Обсуждения и уведомления останутся
              доступны.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="[--card-spacing:--spacing(5)] sm:[--card-spacing:--spacing(6)]">
        <CardHeader>
          <CardTitle>Параметры ответа</CardTitle>
          <CardDescription>
            Значения по умолчанию. Пользователь может изменить их для своего
            диалога.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {!!defaults?.reasoningOptions.length && (
            <div className="grid items-start gap-3 sm:grid-cols-[1fr_240px]">
              <div className="space-y-1.5">
                <Label htmlFor="system-assistant-effort">Глубина ответа</Label>
                <p className="max-w-sm text-sm leading-6 text-muted-foreground">
                  Глубокое рассуждение подходит для сложных задач, но ответ
                  занимает больше времени.
                </p>
              </div>
              <Select
                value={value.reasoningEffort ?? "default"}
                disabled={
                  readOnly ||
                  pending ||
                  !value.enabled ||
                  (defaults.thinking === "optional" &&
                    !(value.thinking ?? defaults.defaultThinking))
                }
                onValueChange={(selected) =>
                  change({
                    reasoningEffort:
                      defaults.reasoningOptions.find(
                        (option) => option === selected,
                      ) ?? null,
                  })
                }
              >
                <SelectTrigger
                  id="system-assistant-effort"
                  className="w-full"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">
                    Из Core
                    {defaults.defaultEffort
                      ? ` · ${effortLabels[defaults.defaultEffort]}`
                      : ""}
                  </SelectItem>
                  {defaults.reasoningOptions.map((effort) => (
                    <SelectItem
                      key={effort}
                      value={effort}
                    >
                      {effortLabels[effort]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {defaults?.thinking === "optional" && (
            <div className="grid items-start gap-3 sm:grid-cols-[1fr_240px]">
              <div className="space-y-1.5">
                <Label htmlFor="system-assistant-thinking">Размышление</Label>
                <p className="text-sm text-muted-foreground">
                  Дополнительное рассуждение перед ответом.
                </p>
              </div>
              <Select
                value={
                  value.thinking === null ? "default" : String(value.thinking)
                }
                disabled={readOnly || pending || !value.enabled}
                onValueChange={(selected) =>
                  change({
                    thinking:
                      selected === "default" ? null : selected === "true",
                  })
                }
              >
                <SelectTrigger
                  id="system-assistant-thinking"
                  className="w-full"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">
                    Из Core ·{" "}
                    {defaults.defaultThinking ? "Включено" : "Выключено"}
                  </SelectItem>
                  <SelectItem value="true">Включено</SelectItem>
                  <SelectItem value="false">Выключено</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          {defaults?.thinking === "required" && (
            <p className="rounded-lg bg-muted/50 px-4 py-3 text-sm leading-6 text-muted-foreground">
              У этой модели размышление всегда включено. Можно выбрать его
              глубину.
            </p>
          )}
          {!defaults?.reasoningOptions.length &&
            defaults?.thinking !== "optional" && (
              <p className="text-sm text-muted-foreground">
                {saved.configured
                  ? "У текущей модели нет дополнительных параметров ответа."
                  : "Доступные параметры появятся после подключения модели."}
              </p>
            )}
        </CardContent>
      </Card>
      <AssistantInstructions
        value={value.instructions}
        defaultValue={saved.instructionDefaults.text}
        maxLength={saved.instructionDefaults.maxLength}
        disabled={pending || readOnly}
        onChange={(instructions) => change({ instructions })}
      />
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-3 border-t pt-5">
          <Button
            type="submit"
            disabled={pending || !dirty || !instructionsValid}
          >
            {pending && <Loader2 className="animate-spin" />}
            {pending ? "Сохраняем…" : "Сохранить изменения"}
          </Button>
          {dirty && (
            <Button
              type="button"
              variant="ghost"
              disabled={pending || readOnly}
              onClick={() => {
                setValue(supportedValue(saved));
                setError("");
                setMessage("");
              }}
            >
              <RotateCcw />
              Отменить
            </Button>
          )}
          {message && (
            <span
              role="status"
              className="flex items-center gap-1.5 text-sm text-muted-foreground"
            >
              <Check className="size-4" />
              {message}
            </span>
          )}
          {error && (
            <p
              role="alert"
              className="w-full text-sm text-destructive"
            >
              {error}
            </p>
          )}
        </div>
      )}
      <p className="px-1 text-xs leading-5 text-muted-foreground">
        При включённом контексте ассистент видит состояние таблицы и может
        искать, читать и считать записи открытой коллекции в пределах прав
        пользователя. Запрошенные значения передаются AI-провайдеру. Черновики
        форм недоступны. Предложенный фильтр применяется только по нажатию
        пользователя.
      </p>
    </form>
  );
}
