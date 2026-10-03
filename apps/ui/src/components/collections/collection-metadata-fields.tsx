"use client";

import { Input } from "@asmblyr/kit/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@asmblyr/kit/ui/textarea";

export function CollectionNameField({ name, value, onChange, disabled }: {
  name: string; value: string; onChange: (value: string) => void; disabled: boolean;
}) {
  return <div className="space-y-2">
    <Label htmlFor="collection-display-name">Название коллекции</Label>
    <Input id="collection-display-name" value={value} onChange={(e) => onChange(e.target.value)}
      maxLength={120} placeholder={name || "Например, Площадки"} disabled={disabled} />
    <p className="text-xs text-muted-foreground">Название в меню, списках и заголовках. Если оставить пустым, используется техническое имя.</p>
  </div>;
}

export function CollectionVisibilityField({ hidden, onChange, disabled }: {
  hidden: boolean; onChange: (value: boolean) => void; disabled: boolean;
}) {
  return <div className="flex items-start justify-between gap-6 rounded-xl border p-4">
    <div className="space-y-2">
      <Label htmlFor="collection-hidden">Скрыть из навигации</Label>
      <p id="collection-hidden-help" className="text-sm text-muted-foreground">
        Убирает коллекцию из меню данных и глобального поиска. Подходит для промежуточных и служебных коллекций.
      </p>
      <p className="text-xs text-muted-foreground">
        Связи и доступ по прямой ссылке продолжают работать с учётом прав. Администратор видит коллекцию в редакторе структуры.
      </p>
    </div>
    <Switch id="collection-hidden" checked={hidden} onCheckedChange={onChange}
      aria-describedby="collection-hidden-help" disabled={disabled} />
  </div>;
}

export function CollectionMcpFields({ enabled, description, onEnabledChange, onDescriptionChange, disabled }: {
  enabled: boolean; description: string; onEnabledChange: (value: boolean) => void;
  onDescriptionChange: (value: string) => void; disabled: boolean;
}) {
  return <div className="space-y-6">
    <div className="flex items-start justify-between gap-6 rounded-xl border p-4">
      <div className="space-y-2">
        <Label htmlFor="collection-mcp-enabled">Доступна через MCP</Label>
        <p id="collection-mcp-help" className="text-sm text-muted-foreground">
          Ассистент сможет изучать структуру, искать и читать записи в пределах прав пользователя.
        </p>
      </div>
      <Switch id="collection-mcp-enabled" checked={enabled} onCheckedChange={onEnabledChange}
        aria-describedby="collection-mcp-help" disabled={disabled} />
    </div>
    <div className="space-y-2">
      <Label htmlFor="collection-mcp-description">Описание для MCP</Label>
      <Textarea id="collection-mcp-description" value={description} maxLength={2000} rows={6}
        className="min-h-36 resize-y" disabled={disabled}
        placeholder="Что хранится в коллекции, что означает одна запись и для каких задач её использовать."
        onChange={(e) => onDescriptionChange(e.target.value)} />
      <p className="text-xs text-muted-foreground">Помогает ассистенту понять назначение данных. Не указывайте секреты и персональные данные.</p>
    </div>
    {!enabled && <p role="status" className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
      Структура и записи этой коллекции не будут доступны инструментам ассистента, включая поиск через связи.
      Описание сохранится до следующего включения.
    </p>}
  </div>;
}
