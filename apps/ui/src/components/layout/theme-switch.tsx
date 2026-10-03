"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Switch } from "@/components/ui/switch";
import { useAccountTheme } from "@/components/settings/account-theme";

const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export function ThemeSwitch() {
  const mounted = useSyncExternalStore(
    subscribe,
    clientSnapshot,
    serverSnapshot,
  );
  const { resolvedTheme } = useTheme();
  const { saveTheme, ready, error } = useAccountTheme();

  return (
    <div
      className="flex shrink-0 items-center gap-2"
      style={{ visibility: mounted ? "visible" : "hidden" }}
    >
      <Sun
        aria-hidden="true"
        className="size-4 text-muted-foreground"
      />
      <Switch
        aria-label="Тёмная тема"
        disabled={!ready}
        checked={mounted && resolvedTheme === "dark"}
        onCheckedChange={(dark) => saveTheme(dark ? "dark" : "light")}
      />
      <Moon
        aria-hidden="true"
        className="size-4 text-muted-foreground"
      />
      {error && (
        <span
          role="alert"
          className="max-w-48 text-xs text-destructive"
        >
          {error}
        </span>
      )}
    </div>
  );
}
