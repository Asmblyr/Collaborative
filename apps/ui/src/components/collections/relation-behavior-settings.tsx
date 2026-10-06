"use client";

import { Checkbox } from "@asmblyr-collaborative/kit/ui/checkbox";
import { Input } from "@asmblyr-collaborative/kit/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@asmblyr-collaborative/kit/ui/select";
import { TabsContent } from "@asmblyr-collaborative/kit/ui/tabs";
import type { RelationEditor, Kind, DeleteAction } from "./use-relation-editor";
import { useUiCopy } from "@/lib/ui-copy";

export function RelationBehaviorSettings({
  editor,
  kind,
  collection,
  portalContainer,
}: {
  editor: RelationEditor;
  kind: Kind;
  collection: string;
  portalContainer?: HTMLElement | null;
}) {
  const copy = useUiCopy();

  const {
    targetCollection,
    reuseExisting,
    sourceOnDelete,
    setSourceOnDelete,
    targetOnDelete,
    setTargetOnDelete,
    required,
    setRequired,
    nullable,
    setNullable,
    onDelete,
    setOnDelete,
    defaultValue,
    setDefaultValue,
    pending,
    setMessage,
  } = editor;
  return (
    <TabsContent
      value="behavior"
      className="space-y-5 pt-5"
    >
      {kind === "o2m" && reuseExisting && (
        <p className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">
          {copy(
            "Для существующего внешнего ключа правила обязательности и удаления уже заданы в целевой коллекции. ",
          )}
        </p>
      )}
      {kind === "m2m" && (
        <div className="space-y-4 rounded-xl border p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="relation-source-delete">
                {copy("При удалении записи из ")}
                {collection}
              </Label>
              <Select
                value={sourceOnDelete}
                onValueChange={(value) =>
                  setSourceOnDelete(value as "restrict" | "cascade")
                }
                disabled={pending}
              >
                <SelectTrigger
                  id="relation-source-delete"
                  className="h-10 w-full"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent container={portalContainer}>
                  <SelectItem value="cascade">
                    {copy("Удалить строки связи")}
                  </SelectItem>
                  <SelectItem value="restrict">
                    {copy("Запретить удаление записи ")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="relation-target-delete">
                {copy("При удалении записи из")}{" "}
                {targetCollection || copy("связанной коллекции")}
              </Label>
              <Select
                value={targetOnDelete}
                onValueChange={(value) =>
                  setTargetOnDelete(value as "restrict" | "cascade")
                }
                disabled={pending}
              >
                <SelectTrigger
                  id="relation-target-delete"
                  className="h-10 w-full"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent container={portalContainer}>
                  <SelectItem value="cascade">
                    {copy("Удалить строки связи")}
                  </SelectItem>
                  <SelectItem value="restrict">
                    {copy("Запретить удаление записи ")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {(sourceOnDelete === "cascade" || targetOnDelete === "cascade") && (
            <p className="text-xs text-muted-foreground">
              {copy(
                "Удаление строк связи самой БД пока не записывается отдельно в историю. ",
              )}
            </p>
          )}
        </div>
      )}
      {kind !== "m2m" && !(kind === "o2m" && reuseExisting) && (
        <div className="space-y-4 rounded-xl border p-4">
          <label className="flex items-center gap-3 text-sm">
            <Checkbox
              checked={required}
              onCheckedChange={(checked) => setRequired(checked === true)}
            />
            {copy("Обязательно в API ")}
          </label>
          <label className="flex items-center gap-3 text-sm">
            <Checkbox
              checked={nullable}
              onCheckedChange={(checked) => {
                setNullable(checked === true);
                if (checked !== true && onDelete === "setNull")
                  setOnDelete("restrict");
              }}
            />
            {copy("Разрешить NULL в БД ")}
          </label>
          <div className="space-y-2">
            <Label htmlFor="relation-delete">
              {copy("При удалении связанной записи ")}
            </Label>
            <Select
              value={onDelete}
              onValueChange={(value) => {
                setOnDelete(value as DeleteAction);
                setMessage("");
              }}
              disabled={pending}
            >
              <SelectTrigger
                id="relation-delete"
                className="h-10 w-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent container={portalContainer}>
                <SelectItem value="restrict">
                  {copy("Запретить удаление")}
                </SelectItem>
                {nullable && (
                  <SelectItem value="setNull">
                    {copy("Очистить внешний ключ")}
                  </SelectItem>
                )}
                <SelectItem value="setDefault">
                  {copy("Установить значение по умолчанию ")}
                </SelectItem>
                <SelectItem value="cascade">
                  {copy("Удалить связанные записи ")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          {onDelete === "setDefault" && (
            <div className="space-y-2">
              <Label htmlFor="relation-default">
                {copy("ID записи по умолчанию")}
              </Label>
              <Input
                id="relation-default"
                value={defaultValue}
                onChange={(event) => setDefaultValue(event.target.value)}
                required
                className="h-10 font-mono"
              />
              <p className="text-xs text-muted-foreground">
                {copy("Запись с этим ID должна уже существовать. ")}
              </p>
            </div>
          )}
          {onDelete !== "restrict" && (
            <p className="text-xs text-muted-foreground">
              {copy(
                "Изменения других записей, выполненные самой БД при удалении, пока не получают отдельные записи в истории. ",
              )}
            </p>
          )}
        </div>
      )}
    </TabsContent>
  );
}
