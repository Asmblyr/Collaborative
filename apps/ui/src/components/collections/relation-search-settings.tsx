import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export function RelationSearchSettings({ searchable, disabled, onChange }: {
  searchable: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  return <div className="flex items-start justify-between gap-4 rounded-xl border p-4">
    <div className="space-y-1">
      <Label htmlFor="field-editor-relation-searchable">Искать по связанной коллекции</Label>
      <p className="text-xs text-muted-foreground">
        Поиск по этой коллекции и общий поиск учитывают доступные текстовые поля связанной
        коллекции, включённые в поиск. Переход выполняется только на один уровень.
      </p>
    </div>
    <Switch id="field-editor-relation-searchable" checked={searchable}
      onCheckedChange={onChange} disabled={disabled} />
  </div>;
}
