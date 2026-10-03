import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export function FieldSearchSettings({
  searchable,
  indexed,
  disabled,
  onSearchableChange,
  onIndexedChange,
}: {
  searchable: boolean;
  indexed: boolean;
  disabled: boolean;
  onSearchableChange: (value: boolean) => void;
  onIndexedChange: (value: boolean) => void;
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 rounded-xl border p-4">
        <div className="space-y-1">
          <Label htmlFor="field-editor-searchable">Участвует в поиске</Label>
          <p className="text-xs text-muted-foreground">
            Поле учитывается в поиске по этой коллекции и в общем поиске, если
            доступно пользователю.
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
          <Label htmlFor="field-editor-indexed">Индекс для поиска</Label>
          <p className="text-xs text-muted-foreground">
            GIN индекс помогает запросам от 3 символов на больших таблицах. Для
            полной пользы индексируйте и другие поля поиска. Индекс занимает
            место и замедляет запись.
          </p>
        </div>
        <Switch
          id="field-editor-indexed"
          checked={indexed}
          onCheckedChange={onIndexedChange}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
