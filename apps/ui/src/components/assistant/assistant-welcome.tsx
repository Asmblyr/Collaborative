"use client";

import {
  ChevronRight,
  Columns3,
  Database,
  ListFilter,
  Network,
  Search,
  Sparkles,
} from "lucide-react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useUiCopy } from "@/lib/ui-copy";
import type { PageContext } from "./assistant-context-types";
import { AssistantConnections } from "./assistant-connections";

export function AssistantWelcome({
  context,
  onPrompt,
}: {
  context: PageContext | null;
  onPrompt: (prompt: string) => void;
}) {
  const copy = useUiCopy();
  let actions;
  if (context?.record) {
    actions = [
      {
        icon: Search,
        title: copy("Объяснить запись"),
        description: copy("Сохранённые данные и их смысл"),
        prompt: copy(
          "Объясни сохранённые данные этой записи и её основные поля.",
        ),
      },
      {
        icon: Network,
        title: copy("Посмотреть связи"),
        description: copy("Связанные записи"),
        prompt: copy("Покажи, с какими записями связана эта запись."),
      },
    ];
  } else if (context?.collection) {
    actions = [
      {
        icon: ListFilter,
        title: copy("Подобрать фильтр"),
        description: copy("Условия для этой коллекции"),
        prompt: copy(
          "Помоги составить фильтр для текущей коллекции. Сначала уточни, какие записи нужны.",
        ),
      },
      {
        icon: Columns3,
        title: copy("Разобраться в полях"),
        description: copy("Назначение и связи"),
        prompt: copy("Объясни поля и связи текущей коллекции."),
      },
    ];
  } else if (context) {
    actions = [
      {
        icon: Search,
        title: copy("Найти записи"),
        description: copy("Поиск по доступным данным"),
        prompt: copy("Помоги найти нужные записи. Какие данные тебе уточнить?"),
      },
      {
        icon: Network,
        title: copy("Понять структуру"),
        description: copy("Коллекции, поля и связи"),
        prompt: copy(
          "Объясни структуру доступных мне коллекций и основные связи.",
        ),
      },
    ];
  } else {
    actions = [
      {
        icon: Database,
        title: copy("Спроектировать коллекцию"),
        description: copy("Поля и связи для задачи"),
        prompt: copy("Помоги спроектировать коллекцию для моей задачи."),
      },
      {
        icon: Network,
        title: copy("Разобраться со связями"),
        description: copy("Простое объяснение на примере"),
        prompt: copy(
          "Объясни, как выбирать связи между коллекциями, на простом примере.",
        ),
      },
    ];
  }

  return (
    <Card
      size="sm"
      className="gap-3 bg-linear-to-br from-primary/10 via-card to-card ring-primary/15"
    >
      <CardHeader className="gap-2">
        <div className="mb-1 flex size-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Sparkles
            className="size-4"
            aria-hidden="true"
          />
        </div>
        <CardTitle>
          <h3>{copy("Привет! С чего начнём?")}</h3>
        </CardTitle>
        <CardDescription className="text-xs leading-5">
          {copy(
            "Помогу найти записи, подобрать фильтр и разобраться в данных.",
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        {actions.map(({ icon: Icon, title, description, prompt }) => (
          <Button
            key={title}
            type="button"
            variant="ghost"
            size="sm"
            className="group h-auto w-full justify-start gap-3 whitespace-normal rounded-lg border border-border/50 bg-background/40 px-2.5 py-2.5 text-left"
            onClick={() => onPrompt(prompt)}
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors group-hover:text-primary">
              <Icon
                className="size-3.5"
                aria-hidden="true"
              />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-medium leading-4">
                {title}
              </span>
              <span className="mt-0.5 block text-[11px] font-normal leading-4 text-muted-foreground">
                {description}
              </span>
            </span>
            <ChevronRight
              className="size-3.5 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
          </Button>
        ))}
      </CardContent>
      <CardFooter className="bg-background/30 py-2">
        <AssistantConnections showLabel />
      </CardFooter>
    </Card>
  );
}
