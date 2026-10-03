import type { SettingsPermissionInput } from "@asmblyr/contracts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@asmblyr/kit/ui/select";
import { settingsCatalog } from "@/components/system-settings/sections";

export function PolicySettingsPermissions({
  selected,
  onChange,
  disabled,
}: {
  selected: SettingsPermissionInput[];
  onChange: (permissions: SettingsPermissionInput[]) => void;
  disabled: boolean;
}) {
  return (
    <section className="space-y-3">
      <h3 className="font-semibold">Разделы настроек</h3>
      <p className="text-xs text-muted-foreground">
        Выберите уровень доступа. Изменение включает просмотр. Права на записи
        коллекций задаются отдельно.
      </p>
      <div className="divide-y rounded-lg border px-3">
        {settingsCatalog.map((section) => (
          <div
            key={section.id}
            className="flex flex-wrap items-center justify-between gap-3 py-3"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{section.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {section.description}
              </p>
            </div>
            <Select
              disabled={disabled}
              value={
                selected.find((grant) => grant.section === section.id)
                  ?.action ?? "none"
              }
              onValueChange={(action) => {
                const next = selected.filter(
                  (grant) => grant.section !== section.id,
                );
                if (action === "read" || action === "update")
                  next.push({ section: section.id, action, fields: ["*"] });
                onChange(next);
              }}
            >
              <SelectTrigger
                size="sm"
                className="w-36"
                aria-label={`Доступ: ${section.title}`}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Нет доступа</SelectItem>
                <SelectItem value="read">Просмотр</SelectItem>
                <SelectItem value="update">Изменение</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>
    </section>
  );
}
