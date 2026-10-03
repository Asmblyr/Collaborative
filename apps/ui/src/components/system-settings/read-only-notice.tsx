import { Eye } from "lucide-react";

export function SettingsReadOnlyNotice({ readOnly }: { readOnly: boolean }) {
  if (!readOnly) {
    return null;
  }
  return (
    <p className="flex items-center gap-2 text-xs text-muted-foreground">
      <Eye className="size-3.5" />
      Только просмотр · изменение настроек недоступно
    </p>
  );
}
