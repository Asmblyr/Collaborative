"use client";

import { SearchPrioritySettings } from "./search-priority-settings";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useUiCopy } from "@/lib/ui-copy";

export function FieldSearchSettings({
  priority,
  onPriorityChange,
  container,
  searchable,
  indexed,
  disabled,
  onSearchableChange,
  onIndexedChange,
}: {
  priority: import("@asmblyr-collaborative/contracts").SearchPriority | null;
  onPriorityChange: (
    value: import("@asmblyr-collaborative/contracts").SearchPriority | null,
  ) => void;
  container?: HTMLElement | null;
  searchable: boolean;
  indexed: boolean;
  disabled: boolean;
  onSearchableChange: (value: boolean) => void;
  onIndexedChange: (value: boolean) => void;
}) {
  const copy = useUiCopy();

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 rounded-xl border p-4">
        <div className="space-y-1">
          <Label htmlFor="field-editor-searchable">
            {copy("Участвует в поиске")}
          </Label>
          <p className="text-xs text-muted-foreground">
            {copy(
              "Поле учитывается в поиске по этой коллекции и в общем поиске, если доступно пользователю. ",
            )}
          </p>
        </div>
        <Switch
          id="field-editor-searchable"
          checked={searchable}
          onCheckedChange={onSearchableChange}
          disabled={disabled}
        />
      </div>
      <div className="flex items-start justify-between gap-4 rounded-xl border p-4">
        <div className="space-y-1">
          <Label htmlFor="field-editor-indexed">
            {copy("Индекс для поиска")}
          </Label>
          <p className="text-xs text-muted-foreground">
            {copy(
              "GIN индекс помогает запросам от 3 символов на больших таблицах. Для полной пользы индексируйте и другие поля поиска. Индекс занимает место и замедляет запись. ",
            )}
          </p>
        </div>
        <Switch
          id="field-editor-indexed"
          checked={indexed}
          onCheckedChange={onIndexedChange}
          disabled={disabled}
        />
      </div>
      <SearchPrioritySettings
        value={priority}
        onChange={onPriorityChange}
        disabled={disabled || !searchable}
        container={container}
      />
    </div>
  );
}
