"use client";

import { SlidersHorizontal } from "lucide-react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@asmblyr-collaborative/kit/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  effortLabels,
  type AssistantSettings as Settings,
  type AssistantStatus,
} from "./assistant-types";
import { useUiCopy } from "@/lib/ui-copy";
import { AssistantIconButton } from "./assistant-icon-button";

export function AssistantSettings({
  status,
  value,
  onChange,
  disabled,
}: {
  status: AssistantStatus;
  value: Settings;
  onChange: (value: Settings) => void;
  disabled: boolean;
}) {
  const copy = useUiCopy();

  const config = status.settings;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <AssistantIconButton
          label={copy("Настройки ассистента")}
          disabled={disabled}
        >
          <SlidersHorizontal />
        </AssistantIconButton>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        className="w-72 space-y-4 rounded-xl p-4"
      >
        <div>
          <h3 className="text-sm font-medium">{copy("Параметры диалога")}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {copy("Только для ваших следующих сообщений ")}
          </p>
        </div>
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="text-muted-foreground">{copy("Модель")}</span>
          <span className="truncate font-medium">{status.model}</span>
        </div>
        {config?.thinking === "optional" && (
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="assistant-thinking">{copy("Размышление")}</Label>
            <Switch
              id="assistant-thinking"
              checked={value.thinking ?? config.defaultThinking}
              disabled={disabled}
              onCheckedChange={(thinking) => onChange({ ...value, thinking })}
            />
          </div>
        )}
        {!!config?.reasoningOptions.length && (
          <div className="space-y-2">
            <Label htmlFor="assistant-effort">{copy("Глубина ответа")}</Label>
            <Select
              value={value.reasoningEffort ?? config.defaultEffort ?? undefined}
              disabled={
                disabled ||
                (config.thinking === "optional" &&
                  !(value.thinking ?? config.defaultThinking))
              }
              onValueChange={(reasoningEffort) => {
                const selected = config.reasoningOptions.find(
                  (entry) => entry === reasoningEffort,
                );
                if (selected) onChange({ ...value, reasoningEffort: selected });
              }}
            >
              <SelectTrigger
                id="assistant-effort"
                className="w-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {config.reasoningOptions.map((effort) => (
                  <SelectItem
                    key={effort}
                    value={effort}
                  >
                    {copy(effortLabels[effort])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs leading-5 text-muted-foreground">
              {copy("Более глубокий ответ может занять больше времени. ")}
              {config.thinking === "required"
                ? copy(" У этой модели размышление всегда включено.")
                : ""}
            </p>
          </div>
        )}
        {(value.reasoningEffort !== undefined ||
          value.thinking !== undefined) && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            className="w-full"
            onClick={() => onChange({})}
          >
            {copy("Использовать общие настройки ")}
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
