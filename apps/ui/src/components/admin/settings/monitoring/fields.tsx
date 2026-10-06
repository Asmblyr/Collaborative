"use client";
import { useId } from "react";
import { Input } from "@asmblyr-collaborative/kit/ui/input";
import { Label } from "@/components/ui/label";
import { useUiCopy } from "@/lib/ui-copy";
import {
  ConnectionEnabled,
  ConnectionField,
  ConnectionGrid,
} from "../integrations/fields";
import { MonitoringTargets, type MonitoringTargetProps } from "./target-fields";

export function MonitoringFields({
  value,
  onChange,
  disabled,
  readOnly,
  ...targetProps
}: MonitoringTargetProps & { readOnly: boolean }) {
  const copy = useUiCopy();
  const id = useId();
  return (
    <div className="space-y-5">
      <ConnectionEnabled
        value={value.enabled}
        disabled={disabled}
        onChange={(enabled) => onChange({ ...value, enabled })}
      />
      <ConnectionGrid>
        <ConnectionField
          label="Окружение"
          value={value.environment}
          disabled={disabled}
          readOnly={readOnly}
          onChange={(environment) => onChange({ ...value, environment })}
        />
        <ConnectionField
          label="Версия релиза · необязательно"
          value={value.release}
          disabled={disabled}
          readOnly={readOnly}
          onChange={(release) => onChange({ ...value, release })}
        />
      </ConnectionGrid>
      <MonitoringTargets
        {...targetProps}
        value={value}
        onChange={onChange}
        disabled={disabled}
      />
      <div className="space-y-2">
        <Label htmlFor={`${id}-rate`}>
          {copy("Доля трассировок для обеих вкладок, %")}
        </Label>
        <Input
          id={`${id}-rate`}
          type="number"
          min={0}
          max={100}
          step={1}
          value={Number((value.tracesSampleRate * 100).toFixed(4))}
          disabled={disabled}
          onChange={(event) =>
            onChange({
              ...value,
              tracesSampleRate: Number(event.target.value) / 100,
            })
          }
          className="h-9 max-w-32"
        />
        <p className="text-xs leading-5 text-muted-foreground">
          {copy(
            "10% — отправлять примерно каждый десятый запрос. Локальные p95/p99 считаются по всем измеренным запросам API, включая при 0% трассировок.",
          )}
        </p>
      </div>
      <p className="rounded-lg border bg-muted/40 p-3 text-xs leading-5 text-muted-foreground">
        {copy(
          "Окружение, релиз и доля трассировок общие для обеих вкладок. DSN можно указать из одного проекта или разных проектов Sentry. Запись экрана, сообщения, значения полей и SQL-тексты не собираются.",
        )}
      </p>
    </div>
  );
}
