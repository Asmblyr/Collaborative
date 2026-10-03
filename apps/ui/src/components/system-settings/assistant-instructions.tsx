"use client";

import { RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@asmblyr/kit/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@asmblyr/kit/ui/textarea";

export function AssistantInstructions({
  value,
  defaultValue,
  maxLength,
  disabled,
  onChange,
}: {
  value: string | null;
  defaultValue: string;
  maxLength: number;
  disabled: boolean;
  onChange: (value: string | null) => void;
}) {
  const text = value ?? defaultValue;
  const empty = !text.trim();
  return (
    <Card className="[--card-spacing:--spacing(5)] sm:[--card-spacing:--spacing(6)]">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>Инструкции</CardTitle>
          <Badge
            variant="secondary"
            className="font-normal"
          >
            {value === null ? "Стандартные" : "Свои инструкции"}
          </Badge>
        </div>
        <CardDescription>
          Задайте роль, стиль общения и формат ответов для всех диалогов.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Label htmlFor="assistant-instructions">
          Как должен отвечать ассистент
        </Label>
        <Textarea
          id="assistant-instructions"
          value={text}
          maxLength={maxLength}
          disabled={disabled}
          aria-invalid={empty}
          aria-describedby="assistant-instructions-help assistant-instructions-count"
          onChange={(event) =>
            onChange(
              event.target.value === defaultValue ? null : event.target.value,
            )
          }
          className="min-h-52 max-h-[32rem] resize-y field-sizing-fixed leading-6"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled || value === null}
            onClick={() => onChange(null)}
          >
            <RotateCcw />
            Восстановить стандартные
          </Button>
          <span
            id="assistant-instructions-count"
            className="text-xs tabular-nums text-muted-foreground"
          >
            {text.length.toLocaleString("ru-RU")} /{" "}
            {maxLength.toLocaleString("ru-RU")}
          </span>
        </div>
        {empty && (
          <p
            role="alert"
            className="text-sm text-destructive"
          >
            Введите инструкции или восстановите стандартные.
          </p>
        )}
        <p
          id="assistant-instructions-help"
          className="text-xs leading-5 text-muted-foreground"
        >
          После сохранения применятся со следующего сообщения. Инструкции задают
          поведение, а доступ к данным и действиям определяется системой.
        </p>
      </CardContent>
    </Card>
  );
}
