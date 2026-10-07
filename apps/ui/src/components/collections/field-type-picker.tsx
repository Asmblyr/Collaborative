"use client";

import { useState, type ComponentType } from "react";
import {
  CalendarClock,
  ChevronRight,
  Hash,
  Link2,
  Mail,
  Network,
  Search,
  TextCursorInput,
  ToggleLeft,
  Braces,
  Paperclip,
  Images,
  List,
  Tags,
} from "lucide-react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { Input } from "@asmblyr-collaborative/kit/ui/input";
import { useUiCopy } from "@/lib/ui-copy";

export type DataFieldType =
  | "text"
  | "integer"
  | "bigint"
  | "date"
  | "boolean"
  | "datetime"
  | "email"
  | "decimal"
  | "json"
  | "uuid"
  | "file"
  | "files"
  | "select"
  | "multiselect"
  | "tags";
export type FieldChoice = DataFieldType | "m2o" | "o2m" | "m2m";

type Choice = {
  type: FieldChoice;
  label: string;
  description: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
};

const dataFields: Choice[] = [
  {
    type: "text",
    label: "Текст",
    description: "Строковое значение",
    icon: TextCursorInput,
  },
  {
    type: "integer",
    label: "Целое число",
    description: "Число без дробной части",
    icon: Hash,
  },
  {
    type: "bigint",
    label: "Большое целое число",
    description: "64-битное число, строка в API",
    icon: Hash,
  },
  {
    type: "boolean",
    label: "Да / нет",
    description: "Логическое значение",
    icon: ToggleLeft,
  },
  {
    type: "date",
    label: "Дата",
    description: "Календарная дата без времени и часового пояса",
    icon: CalendarClock,
  },
  {
    type: "datetime",
    label: "Дата и время",
    description: "Время в UTC",
    icon: CalendarClock,
  },
  {
    type: "email",
    label: "Электронная почта",
    description: "Адрес email",
    icon: Mail,
  },
  {
    type: "decimal",
    label: "Дробное число",
    description: "Точное число, например цена",
    icon: Hash,
  },
  {
    type: "select",
    label: "Список вариантов",
    description: "Выбор одного значения",
    icon: List,
  },
  {
    type: "multiselect",
    label: "Множественный выбор",
    description: "Несколько вариантов",
    icon: List,
  },
  {
    type: "json",
    label: "JSON",
    description: "Структурированные данные",
    icon: Braces,
  },
  {
    type: "tags",
    label: "Теги",
    description: "Свободный ввод нескольких меток",
    icon: Tags,
  },
  {
    type: "uuid",
    label: "UUID",
    description: "Уникальный идентификатор",
    icon: Hash,
  },
  {
    type: "file",
    label: "Файл / изображение",
    description: "Одно вложение из библиотеки",
    icon: Paperclip,
  },
  {
    type: "files",
    label: "Галерея / файлы",
    description: "Упорядоченный список вложений",
    icon: Images,
  },
];

const relations: Choice[] = [
  {
    type: "m2o",
    label: "Многие к одному",
    description: "Внешний ключ в этой коллекции",
    icon: Link2,
  },
  {
    type: "o2m",
    label: "Один ко многим",
    description: "Обратное поле и ключ в другой коллекции",
    icon: Network,
  },
  {
    type: "m2m",
    label: "Многие ко многим",
    description: "Связь через промежуточную коллекцию",
    icon: Network,
  },
];

export function FieldTypePicker({
  onSelect,
  allowRelations = true,
  relationKinds,
}: {
  onSelect: (type: FieldChoice) => void;
  allowRelations?: boolean;
  relationKinds?: ("m2o" | "o2m" | "m2m")[];
}) {
  const copy = useUiCopy();

  const [query, setQuery] = useState("");
  const filter = (choices: Choice[]) =>
    choices
      .map((choice) => ({
        ...choice,
        label: copy(choice.label),
        description: copy(choice.description),
      }))
      .filter((choice) =>
        `${choice.label} ${choice.description} ${choice.type}`
          .toLocaleLowerCase("ru")
          .includes(query.trim().toLocaleLowerCase("ru")),
      );
  const groups = [
    { title: copy("Поля данных"), choices: filter(dataFields) },
    {
      title: copy("Связи"),
      choices: allowRelations
        ? filter(
            relations.filter(
              (choice) =>
                !relationKinds ||
                relationKinds.some((kind) => kind === choice.type),
            ),
          )
        : [],
    },
  ];

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        {copy("Выберите, какое поле добавить в коллекцию. ")}
      </p>
      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          aria-label={copy("Поиск типа поля")}
          placeholder={copy("Найти тип поля")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="pl-9"
        />
      </div>
      {groups.map(
        (group) =>
          group.choices.length > 0 && (
            <section
              key={group.title}
              className="space-y-2"
            >
              <h3 className="text-sm font-semibold">{group.title}</h3>
              <div className="grid grid-cols-2 gap-2">
                {group.choices.map((choice, index) => {
                  const Icon = choice.icon;
                  const wide = group.choices.length % 2 === 1 && index === 0;
                  return (
                    <Button
                      key={choice.type}
                      type="button"
                      variant="ghost"
                      onClick={() => onSelect(choice.type)}
                      className={`min-w-0 w-full rounded-xl border border-border/80 bg-card/80 p-3 text-left whitespace-normal shadow-xs hover:border-primary/40 hover:bg-accent/60 hover:shadow-sm dark:hover:bg-accent/40 ${
                        wide
                          ? "col-span-2 h-auto min-h-18 flex-row items-center justify-start gap-3"
                          : "h-auto min-h-27 flex-col items-stretch justify-between gap-2.5"
                      }`}
                    >
                      <span
                        className={`flex size-9 shrink-0 items-center justify-center rounded-lg border bg-primary/10 text-primary ${wide ? "" : "self-start"}`}
                      >
                        <Icon
                          aria-hidden={true}
                          className="size-4"
                        />
                      </span>
                      <span
                        className={`min-w-0 space-y-0.5 ${wide ? "flex-1" : "w-full"}`}
                      >
                        <span className="block font-medium">
                          {choice.label}
                        </span>
                        <span className="block text-xs leading-4 text-muted-foreground">
                          {choice.description}
                        </span>
                      </span>
                      {wide && (
                        <ChevronRight
                          aria-hidden="true"
                          className="size-4 text-muted-foreground/60 transition-transform group-hover/button:translate-x-0.5 group-hover/button:text-foreground"
                        />
                      )}
                    </Button>
                  );
                })}
              </div>
            </section>
          ),
      )}
      {groups.every((group) => group.choices.length === 0) && (
        <p
          role="status"
          className="py-8 text-center text-sm text-muted-foreground"
        >
          {copy("Тип поля не найден ")}
        </p>
      )}
    </div>
  );
}
