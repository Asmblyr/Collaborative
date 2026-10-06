"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Collection } from "@/components/items/types";
import { useUiCopy } from "@/lib/ui-copy";
import { LockKeyhole } from "lucide-react";

export function CollectionFields({
  collection,
  superuser,
  onForm,
  onDisplay,
  onAddField,
  onEditField,
  onDeleteField,
}: {
  collection: Collection;
  superuser: boolean;
  onForm: () => void;
  onDisplay: () => void;
  onAddField: () => void;
  onEditField: (name: string) => void;
  onDeleteField: (name: string) => void;
}) {
  const copy = useUiCopy();

  const readonly = collection.sourceKind === "materialized-view";
  const canEdit = superuser && collection.access.structure;
  const managed = collection.system
    ? []
    : [
        {
          name: collection.primaryKey.name,
          type: collection.primaryKey.type,
          role: copy("Основной ключ"),
          defaultValue: readonly
            ? "—"
            : collection.primaryKey.type === "text"
              ? copy("Вручную")
              : copy("Автоматически"),
        },
        ...(collection.timestamps.createdAt
          ? [
              {
                name: "created_at",
                type: "datetime",
                role: copy("Системное"),
                defaultValue: copy("Текущее время"),
              },
            ]
          : []),
        ...(collection.timestamps.updatedAt
          ? [
              {
                name: "updated_at",
                type: "datetime",
                role: copy("Системное"),
                defaultValue: copy("Текущее время"),
              },
            ]
          : []),
      ];

  return (
    <div className="space-y-3 px-4 py-4 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">
            {copy("Поля коллекции ")}
            {collection.displayName || collection.name}
          </h3>
          <p className="text-xs text-muted-foreground">
            {collection.system
              ? copy(
                  "Встроенные поля защищены. Можно добавлять и настраивать свои поля.",
                )
              : readonly
                ? copy(
                    "Структура и данные управляются внешним процессом. Здесь настраивается отображение.",
                  )
                : superuser && !collection.access.structure
                  ? copy(
                      "Структура и настройки этой коллекции управляются плагином.",
                    )
                  : copy(
                      "Структура системных полей защищена. Состояния настраиваются в параметрах коллекции.",
                    )}
          </p>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            {!collection.system && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={onForm}
              >
                {copy("Форма ")}
              </Button>
            )}
            {!collection.system && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={onDisplay}
              >
                {copy("Настройки коллекции ")}
              </Button>
            )}
            {!readonly && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onAddField}
              >
                {copy("Добавить поле ")}
              </Button>
            )}
          </div>
        )}
      </div>
      <div className="overflow-hidden rounded-lg border bg-background">
        <Table
          aria-label={copy("Поля коллекции {{value0}}", {
            value0: collection.name,
          })}
          className="min-w-[48rem]"
        >
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="pl-4">{copy("Имя")}</TableHead>
              <TableHead>{copy("Тип")}</TableHead>
              <TableHead>{copy("Ограничения")}</TableHead>
              <TableHead>{copy("По умолчанию")}</TableHead>
              {canEdit && (
                <TableHead className="pr-4 text-right">
                  {copy("Действия")}
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {managed.map((field) => (
              <TableRow key={field.name}>
                <TableCell className="pl-4 font-mono text-xs">
                  {field.name}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {field.type}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{field.role}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {field.defaultValue}
                </TableCell>
                {canEdit && (
                  <TableCell className="pr-4 text-right text-muted-foreground">
                    —
                  </TableCell>
                )}
              </TableRow>
            ))}
            {collection.fields.map((field) => (
              <TableRow key={field.name}>
                <TableCell className="pl-4 font-mono text-xs">
                  {field.name}
                  {field.managed && (
                    <LockKeyhole
                      className="ml-2 inline size-3 text-muted-foreground"
                      aria-label={copy("Системное поле")}
                    />
                  )}
                  {field.name === collection.state?.field && (
                    <Badge
                      variant="outline"
                      className="ml-2 font-sans"
                    >
                      {copy("Системное ")}
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {field.relation
                    ? `${field.relation.kind.toUpperCase()} → ${field.relation.collection}`
                    : field.type}
                </TableCell>
                <TableCell className="whitespace-normal text-xs text-muted-foreground">
                  {field.type === "alias" ? (
                    copy("Виртуальное поле")
                  ) : (
                    <>
                      {field.required
                        ? copy("API: обязательно")
                        : copy("API: необязательно")}{" "}
                      ·{" "}
                      {field.nullable ? copy("БД: NULL") : copy("БД: NOT NULL")}
                    </>
                  )}
                </TableCell>
                <TableCell
                  className="max-w-64 truncate font-mono text-xs"
                  title={
                    field.defaultValue === undefined
                      ? undefined
                      : JSON.stringify(field.defaultValue)
                  }
                >
                  {field.defaultValue === undefined
                    ? "—"
                    : JSON.stringify(field.defaultValue)}
                </TableCell>
                {canEdit && (
                  <TableCell className="pr-4 text-right">
                    {field.managed ? (
                      <span className="text-xs text-muted-foreground">
                        {copy("Системное поле")}
                      </span>
                    ) : (
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          aria-label={copy("Настроить поле {{value0}}", {
                            value0: field.name,
                          })}
                          onClick={() =>
                            field.name === collection.state?.field
                              ? onDisplay()
                              : onEditField(field.name)
                          }
                        >
                          {copy("Настроить ")}
                        </Button>
                        {!readonly &&
                          field.name !== collection.state?.field && (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              aria-label={copy("Удалить поле {{value0}}", {
                                value0: field.name,
                              })}
                              className="text-destructive hover:text-destructive"
                              onClick={() => onDeleteField(field.name)}
                            >
                              {copy("Удалить ")}
                            </Button>
                          )}
                      </div>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
