"use client";

import { CircleHelp } from "lucide-react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useUiCopy } from "@/lib/ui-copy";

export function AssistantContextHelp() {
  const copy = useUiCopy();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground"
          aria-label={copy("Как работает контекст разговора")}
          title={copy("Как работает контекст разговора")}
        >
          <CircleHelp />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        aria-label={copy("История для ответа")}
        side="top"
        className="max-h-[min(24rem,calc(100dvh-2rem))] w-72 max-w-[calc(100vw-2rem)] space-y-2 overflow-y-auto p-3 text-xs leading-5"
      >
        <h3 className="font-medium">{copy("История для ответа")}</h3>
        <p className="text-muted-foreground">
          {copy(
            "Переписка сохранена целиком. Для ответа используются завершённые сообщения того же пространства, страницы, записи и режима доступа к данным. Длинная история может быть сжата.",
          )}
        </p>
        <p className="text-muted-foreground">
          {copy(
            "При возврате к прежнему контексту разговор продолжится с его историей. Поиск и фильтр таблицы её не сбрасывают. Новая сессия начинает разговор заново.",
          )}
        </p>
        <p className="text-muted-foreground">
          {copy(
            "Выключение контекста скрывает текущую страницу, запись и фильтр, но не отключает инструменты. Доступ к базе и личным подключениям настраивается отдельно в «Подключениях». Режимы имеют отдельную историю для ответа.",
          )}
        </p>
      </PopoverContent>
    </Popover>
  );
}
