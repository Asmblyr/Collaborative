import { Badge } from "@/components/ui/badge";
import { Button } from "@asmblyr/kit/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Collection } from "@/components/items/types";

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
  const canEdit = superuser && collection.access.structure;
  const managed = [
    {
      name: collection.primaryKey.name,
      type: collection.primaryKey.type,
      role: "Основной ключ",
      defaultValue: collection.primaryKey.type === "text" ? "Вручную" : "Автоматически",
    },
    ...(collection.timestamps.createdAt
      ? [{ name: "created_at", type: "datetime", role: "Системное", defaultValue: "Текущее время" }]
      : []),
    ...(collection.timestamps.updatedAt
      ? [{ name: "updated_at", type: "datetime", role: "Системное", defaultValue: "Текущее время" }]
      : []),
  ];

  return (
    <div className="space-y-3 px-4 py-4 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">
            Поля коллекции {collection.displayName || collection.name}
          </h3>
          <p className="text-xs text-muted-foreground">
            {superuser && !collection.access.structure
              ? "Структура и настройки этой коллекции управляются плагином."
              : "Структура системных полей защищена. Состояния настраиваются в параметрах коллекции."}
          </p>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={onForm}>
              Форма
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={onDisplay}>
              Настройки коллекции
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={onAddField}>
              Добавить поле
            </Button>
          </div>
        )}
      </div>
      <div className="overflow-hidden rounded-lg border bg-background">
        <Table aria-label={`Поля коллекции ${collection.name}`} className="min-w-[48rem]">
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="pl-4">Имя</TableHead>
              <TableHead>Тип</TableHead>
              <TableHead>Ограничения</TableHead>
              <TableHead>По умолчанию</TableHead>
              {canEdit && <TableHead className="pr-4 text-right">Действия</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {managed.map((field) => (
              <TableRow key={field.name}>
                <TableCell className="pl-4 font-mono text-xs">{field.name}</TableCell>
                <TableCell className="font-mono text-xs">{field.type}</TableCell>
                <TableCell>
                  <Badge variant="outline">{field.role}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">{field.defaultValue}</TableCell>
                {canEdit && (
                  <TableCell className="pr-4 text-right text-muted-foreground">—</TableCell>
                )}
              </TableRow>
            ))}
            {collection.fields.map((field) => (
              <TableRow key={field.name}>
                <TableCell className="pl-4 font-mono text-xs">
                  {field.name}
                  {field.name === collection.state?.field && (
                    <Badge variant="outline" className="ml-2 font-sans">
                      Системное
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
                    "Виртуальное поле"
                  ) : (
                    <>
                      {field.required ? "API: обязательно" : "API: необязательно"} ·{" "}
                      {field.nullable ? "БД: NULL" : "БД: NOT NULL"}
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
                  {field.defaultValue === undefined ? "—" : JSON.stringify(field.defaultValue)}
                </TableCell>
                {canEdit && (
                  <TableCell className="pr-4 text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        aria-label={`Настроить поле ${field.name}`}
                        onClick={() =>
                          field.name === collection.state?.field
                            ? onDisplay()
                            : onEditField(field.name)
                        }
                      >
                        Настроить
                      </Button>
                      {field.name !== collection.state?.field && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          aria-label={`Удалить поле ${field.name}`}
                          className="text-destructive hover:text-destructive"
                          onClick={() => onDeleteField(field.name)}
                        >
                          Удалить
                        </Button>
                      )}
                    </div>
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