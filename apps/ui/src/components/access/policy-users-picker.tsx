import { Checkbox } from "@asmblyr/kit/ui/checkbox";
import type { AccessUser } from "./types";

export function PolicyUsersPicker({
  users,
  selected,
  disabled,
  protectedUserId,
  onChange,
}: {
  users: AccessUser[];
  selected: string[];
  disabled: boolean;
  protectedUserId?: string;
  onChange: (userId: string, checked: boolean) => void;
}) {
  const shown = users.filter((user) => !user.superuser);
  return (
    <section className="space-y-3">
      <div>
        <h3 className="font-semibold">Пользователи</h3>
        <p className="text-xs text-muted-foreground">
          Назначьте политику одному или нескольким пользователям.
          {protectedUserId && " Собственное назначение меняет администратор."}
        </p>
      </div>
      <div className="divide-y rounded-lg border">
        {shown.map((user) => (
          <label
            key={user.id}
            className="flex items-center gap-3 px-3 py-2 text-sm"
          >
            <Checkbox
              checked={selected.includes(user.id)}
              disabled={disabled || user.id === protectedUserId}
              onCheckedChange={(checked) => onChange(user.id, checked === true)}
            />
            <span className="min-w-0 break-words">{user.email}</span>
          </label>
        ))}
        {!shown.length && (
          <p className="px-3 py-2 text-xs text-muted-foreground">
            Пока нет пользователей для назначения.
          </p>
        )}
      </div>
    </section>
  );
}
