"use client";

import { SearchPrioritySettings } from "./search-priority-settings";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useUiCopy } from "@/lib/ui-copy";

export function RelationSearchSettings({
  priority,
  onPriorityChange,
  container,
  searchable,
  disabled,
  onChange,
}: {
  priority: import("@asmblyr-collaborative/contracts").SearchPriority | null;
  onPriorityChange: (
    value: import("@asmblyr-collaborative/contracts").SearchPriority | null,
  ) => void;
  container?: HTMLElement | null;
  searchable: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  const copy = useUiCopy();

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 rounded-xl border p-4">
        <div className="space-y-1">
          <Label htmlFor="field-editor-relation-searchable">
            {copy("Искать по связанной коллекции ")}
          </Label>
          <p className="text-xs text-muted-foreground">
            {copy(
              "Поиск по этой коллекции и общий поиск учитывают доступные текстовые поля связанной коллекции, включённые в поиск. Переход выполняется только на один уровень. ",
            )}
          </p>
        </div>
        <Switch
          id="field-editor-relation-searchable"
          checked={searchable}
          onCheckedChange={onChange}
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
