"use client";

import { ArrowDown, ArrowUp, X } from "lucide-react";
import { Button } from "@asmblyr/kit/ui/button";
import { Checkbox } from "@asmblyr/kit/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@asmblyr/kit/ui/select";
import { availableColumns } from "@/components/items/item-columns";
import type {
  Collection,
  FieldPresentation,
  RelationPresentation,
} from "@/components/items/types";

export const defaultRelationPresentation: RelationPresentation = {
  layout: "table",
  columns: [],
  labelField: null,
  sortField: null,
  direction: "asc",
  pageSize: 10,
  allowCreate: true,
  allowSelect: true,
};

export function RelationDisplaySettings({
  value,
  target,
  disabled,
  portalContainer,
  onChange,
}: {
  value: FieldPresentation;
  target: Collection;
  disabled: boolean;
  portalContainer?: HTMLElement | null;
  onChange: (value: FieldPresentation) => void;
}) {
  const config = value.relation ?? defaultRelationPresentation;
  const fields = availableColumns(target);
  const set = <K extends keyof RelationPresentation>(
    key: K,
    next: RelationPresentation[K],
  ) => onChange({ ...value, relation: { ...config, [key]: next } });
  const move = (index: number, offset: number) => {
    const columns = [...config.columns];
    [columns[index], columns[index + offset]] = [
      columns[index + offset],
      columns[index],
    ];
    set("columns", columns);
  };
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="relation-layout">Вид связанных записей</Label>
          <Select
            value={config.layout}
            disabled={disabled}
            onValueChange={(v) => set("layout", v as "table" | "list")}
          >
            <SelectTrigger
              id="relation-layout"
              className="w-full"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent container={portalContainer}>
              <SelectItem value="table">Таблица</SelectItem>
              <SelectItem value="list">Список</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="relation-page-size">Записей на странице</Label>
          <Select
            value={String(config.pageSize)}
            disabled={disabled}
            onValueChange={(v) => set("pageSize", Number(v) as 10 | 25 | 50)}
          >
            <SelectTrigger
              id="relation-page-size"
              className="w-full"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent container={portalContainer}>
              {[10, 25, 50].map((n) => (
                <SelectItem
                  key={n}
                  value={String(n)}
                >
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {config.layout === "table" && (
        <div className="space-y-3">
          <Label>Столбцы таблицы</Label>
          {config.columns.length > 0 && (
            <ol className="divide-y rounded-lg border">
              {config.columns.map((name, index) => (
                <li
                  key={name}
                  className="flex items-center gap-1 px-3 py-2"
                >
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {fields.find((f) => f.name === name)?.label ??
                      `${name} (удалено)`}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Переместить ${name} выше`}
                    disabled={disabled || index === 0}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Переместить ${name} ниже`}
                    disabled={disabled || index === config.columns.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Убрать столбец ${name}`}
                    disabled={disabled}
                    onClick={() =>
                      set(
                        "columns",
                        config.columns.filter((f) => f !== name),
                      )
                    }
                  >
                    <X />
                  </Button>
                </li>
              ))}
            </ol>
          )}
          <Select
            value=""
            disabled={disabled || config.columns.length >= 12}
            onValueChange={(v) => set("columns", [...config.columns, v])}
          >
            <SelectTrigger
              aria-label="Добавить столбец связи"
              className="w-full"
            >
              <SelectValue placeholder="Добавить столбец…" />
            </SelectTrigger>
            <SelectContent container={portalContainer}>
              {fields
                .filter((f) => !config.columns.includes(f.name))
                .map((f) => (
                  <SelectItem
                    key={f.name}
                    value={f.name}
                  >
                    {f.label}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            До 12 столбцов. Если список пуст, столбцы подбираются автоматически.
            Пользователь увидит только доступные ему поля.
          </p>
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="relation-label">Подпись связанной записи</Label>
        <Select
          value={config.labelField ?? "__auto"}
          disabled={disabled}
          onValueChange={(v) => set("labelField", v === "__auto" ? null : v)}
        >
          <SelectTrigger
            id="relation-label"
            className="w-full"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent container={portalContainer}>
            <SelectItem value="__auto">Из настроек коллекции</SelectItem>
            {fields
              .filter(
                (f) => !["json", "file", "files", "boolean"].includes(f.type),
              )
              .map((f) => (
                <SelectItem
                  key={f.name}
                  value={f.name}
                >
                  {f.label}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="relation-sort">Сортировка по умолчанию</Label>
          <Select
            value={config.sortField ?? "__auto"}
            disabled={disabled}
            onValueChange={(v) => set("sortField", v === "__auto" ? null : v)}
          >
            <SelectTrigger
              id="relation-sort"
              className="w-full"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent container={portalContainer}>
              <SelectItem value="__auto">По основному ключу</SelectItem>
              {fields.map((f) => (
                <SelectItem
                  key={f.name}
                  value={f.name}
                >
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="relation-direction">Направление</Label>
          <Select
            value={config.direction}
            disabled={disabled}
            onValueChange={(v) => set("direction", v as "asc" | "desc")}
          >
            <SelectTrigger
              id="relation-direction"
              className="w-full"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent container={portalContainer}>
              <SelectItem value="asc">По возрастанию</SelectItem>
              <SelectItem value="desc">По убыванию</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-3 rounded-lg border p-4">
        {(["allowSelect", "allowCreate"] as const).map((key) => (
          <div
            key={key}
            className="flex items-center gap-3"
          >
            <Checkbox
              id={`relation-${key}`}
              checked={config[key]}
              disabled={disabled}
              onCheckedChange={(v) => set(key, v === true)}
            />
            <Label htmlFor={`relation-${key}`}>
              {key === "allowSelect"
                ? "Показывать выбор существующих записей"
                : "Показывать создание записей"}
            </Label>
          </div>
        ))}
        <p className="text-xs text-muted-foreground">
          Кнопки доступны, если действие разрешено политиками пользователя.
        </p>
      </div>
    </div>
  );
}
