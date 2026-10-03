"use client";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@asmblyr/kit/ui/select";
import type { Collection } from "@/components/items/types";
import { Input } from "@asmblyr/kit/ui/input";

export function CollectionDisplayFields({ collection, portalContainer, field, template, pending, onFieldChange, onTemplateChange }: {
  collection: Collection; portalContainer: HTMLElement | null; field: string; template: string; pending: boolean;
  onFieldChange: (value: string) => void; onTemplateChange: (value: string) => void;
}) {
  return <div className="space-y-6">
    <div className="space-y-2">
      <Label htmlFor="collection-display-field">Подпись записи</Label>
      <p className="text-sm text-muted-foreground">Это поле будет названием записи в связях, фильтрах и результатах поиска.</p>
      <Select value={field} onValueChange={onFieldChange} disabled={pending}>
        <SelectTrigger id="collection-display-field" className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent container={portalContainer}>
          <SelectItem value="$auto">Автоматически</SelectItem>
          <SelectItem value={collection.primaryKey.name}>{collection.primaryKey.name} · основной ключ</SelectItem>
          {collection.fields.filter((entry) => ["text", "email", "integer"].includes(entry.type))
            .map((entry) => <SelectItem key={entry.name} value={entry.name}>{entry.name}</SelectItem>)}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">Автоматически — первое доступное текстовое поле. Если значение пустое или поле недоступно пользователю, показывается основной ключ.</p>
    </div>
    <div className="space-y-3 rounded-xl border p-4">
      <Label htmlFor="collection-display-template">Составная подпись</Label>
      <Input id="collection-display-template" value={template} disabled={pending} maxLength={500} placeholder="{{title}} · {{code}}" onChange={(e) => onTemplateChange(e.target.value)} />
      <Select value="$insert" disabled={pending} onValueChange={(field) => onTemplateChange(`${template}{{${field}}}`)}>
        <SelectTrigger aria-label="Добавить поле в подпись" className="w-full"><SelectValue /></SelectTrigger><SelectContent container={portalContainer}>
          <SelectItem value="$insert" disabled>Вставить поле…</SelectItem><SelectItem value={collection.primaryKey.name}>{collection.primaryKey.name}</SelectItem>
          {collection.fields.filter((f) => ["text", "email", "integer", "decimal", "boolean", "datetime"].includes(f.type)).map((f) => <SelectItem key={f.name} value={f.name}>{f.presentation?.label || f.name}</SelectItem>)}
        </SelectContent></Select>
      <p className="text-xs text-muted-foreground">Можно сочетать до 8 полей и обычный текст. Пустой шаблон отключает составную подпись. Если одно из полей недоступно пользователю или удалено, используется поле подписи выше.</p>
    </div>
  </div>;
}
