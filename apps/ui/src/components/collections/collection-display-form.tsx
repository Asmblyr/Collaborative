"use client";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@asmblyr-collaborative/kit/ui/select";
import type { Collection } from "@/components/items/types";
import { labelPathOptions } from "./label-path-options";
import { Input } from "@asmblyr-collaborative/kit/ui/input";
import { useUiCopy } from "@/lib/ui-copy";

export function CollectionDisplayFields({
  collection,
  catalog,
  portalContainer,
  field,
  template,
  pending,
  onFieldChange,
  onTemplateChange,
}: {
  collection: Collection;
  catalog: Collection[];
  portalContainer: HTMLElement | null;
  field: string;
  template: string;
  pending: boolean;
  onFieldChange: (value: string) => void;
  onTemplateChange: (value: string) => void;
}) {
  const copy = useUiCopy();

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="collection-display-field">
          {copy("Подпись записи")}
        </Label>
        <p className="text-sm text-muted-foreground">
          {copy(
            "Это поле будет названием записи в связях, фильтрах и результатах поиска. ",
          )}
        </p>
        <Select
          value={field}
          onValueChange={onFieldChange}
          disabled={pending}
        >
          <SelectTrigger
            id="collection-display-field"
            className="w-full"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent container={portalContainer}>
            <SelectItem value="$auto">{copy("Автоматически")}</SelectItem>
            <SelectItem value={collection.primaryKey.name}>
              {collection.primaryKey.name} {copy(" · основной ключ ")}
            </SelectItem>
            {collection.fields
              .filter(
                (entry) =>
                  ["text", "email", "integer"].includes(entry.type) &&
                  !entry.presentation?.sensitive,
              )
              .map((entry) => (
                <SelectItem
                  key={entry.name}
                  value={entry.name}
                >
                  {entry.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {copy(
            "Автоматически — первое доступное текстовое поле. Если значение пустое или поле недоступно пользователю, показывается основной ключ. ",
          )}
        </p>
      </div>
      <div className="space-y-3 rounded-xl border p-4">
        <Label htmlFor="collection-display-template">
          {copy("Составная подпись")}
        </Label>
        <Input
          id="collection-display-template"
          value={template}
          disabled={pending}
          maxLength={500}
          placeholder="{{title}} · {{code}}"
          onChange={(e) => onTemplateChange(e.target.value)}
        />
        <Select
          value="$insert"
          disabled={pending}
          onValueChange={(field) => onTemplateChange(`${template}{{${field}}}`)}
        >
          <SelectTrigger
            aria-label={copy("Добавить поле в подпись")}
            className="w-full"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent container={portalContainer}>
            <SelectItem
              value="$insert"
              disabled
            >
              {copy("Вставить поле… ")}
            </SelectItem>
            {labelPathOptions(collection, catalog).map((option) => (
              <SelectItem
                key={option.value}
                value={option.value}
              >
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {copy(
            "Можно сочетать до 8 полей и обычный текст, включая пути через две связи. Пустой шаблон отключает составную подпись. Если одно из полей недоступно пользователю или удалено, используется поле подписи выше. ",
          )}
        </p>
      </div>
    </div>
  );
}
