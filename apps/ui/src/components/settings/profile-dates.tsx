"use client";
import type { CurrentUser } from "@asmblyr-collaborative/contracts";
import { useSyncExternalStore } from "react";
import { useAccountTheme } from "./account-theme";
import { useUiCopy } from "@/lib/ui-copy";
const subscribe = () => () => {};
export function ProfileDates({ user }: { user: CurrentUser }) {
  const copy = useUiCopy();
  const { timezone } = useAccountTheme();
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  return (
    <dl className="mt-5 grid gap-3 border-t pt-4 text-xs">
      {[
        ["Создан", user.createdAt],
        ["Профиль обновлён", user.updatedAt],
        ["Последний вход", user.lastLoginAt],
        ["Последняя активность", user.lastActiveAt],
      ].map(([label, value]) => (
        <div key={label}>
          <dt className="text-muted-foreground">{copy(label!)}</dt>
          <dd className="mt-1">
            {value && mounted
              ? new Date(value).toLocaleString(copy.locale, {
                  timeZone: timezone ?? undefined,
                })
              : "—"}
          </dd>
        </div>
      ))}
    </dl>
  );
}
