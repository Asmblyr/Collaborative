"use client";

import { Monitor, Moon, Sun, Check } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { themeStyles } from "@asmblyr-collaborative/contracts";
import { useTranslations } from "@asmblyr-collaborative/kit/ui/i18n";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@asmblyr-collaborative/kit/ui/select";
import { Label } from "@/components/ui/label";
import { useAppearance } from "./appearance-provider";
import { useAccountTheme } from "./account-theme";
import { useUiCopy } from "@/lib/ui-copy";

const subscribe = () => () => {};
const swatches = {
  neutral: ["#64748b", "#e2e8f0", "#f8fafc"],
  ocean: ["#007c91", "#b1e8e6", "#ecf8fa"],
  coral: ["#b94b32", "#ffd2ba", "#fff5eb"],
};

export function AppearanceSettings() {
  const copy = useUiCopy();

  const { t } = useTranslations();
  const { theme } = useTheme();
  const { style, locale } = useAppearance();
  const { saveTheme, saveStyle, saveLocale, error, ready } = useAccountTheme();
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  return (
    <div className="max-w-xl space-y-6">
      <div className="space-y-2">
        <Label>{t("appearance.mode")}</Label>
        <div
          role="group"
          aria-label={t("appearance.mode")}
          className="flex flex-wrap gap-2"
        >
          {(
            [
              { id: "light", Icon: Sun },
              { id: "dark", Icon: Moon },
              { id: "system", Icon: Monitor },
            ] as const
          ).map(({ id, Icon }) => (
            <Button
              key={id}
              variant={mounted && theme === id ? "secondary" : "outline"}
              size="sm"
              disabled={!ready}
              aria-pressed={mounted && theme === id}
              onClick={() => saveTheme(id)}
            >
              <Icon className="size-4" />
              {t(`appearance.${id}`)}
            </Button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <Label>{t("appearance.style")}</Label>
        <div
          role="group"
          aria-label={t("appearance.style")}
          className="grid grid-cols-1 gap-2 sm:grid-cols-3"
        >
          {themeStyles.map((id) => (
            <Button
              key={id}
              variant="outline"
              disabled={!ready}
              aria-pressed={style === id}
              onClick={() => saveStyle(id)}
              className="h-auto justify-start gap-3 px-3 py-3 aria-pressed:border-primary aria-pressed:bg-primary/5"
            >
              <span
                className="flex shrink-0 -space-x-1.5"
                aria-hidden="true"
              >
                {swatches[id].map((color) => (
                  <span
                    key={color}
                    className="size-4 rounded-full ring-2 ring-card"
                    style={{ backgroundColor: color }}
                  />
                ))}
              </span>
              <span className="text-sm">{t(`appearance.${id}`)}</span>
              {style === id && (
                <Check className="ml-auto size-3.5 text-primary" />
              )}
            </Button>
          ))}
        </div>
      </div>
      <div className="max-w-xs space-y-2">
        <Label htmlFor="appearance-locale">{t("appearance.locale")}</Label>
        <Select
          value={locale}
          disabled={!ready}
          onValueChange={(value) => saveLocale(value === "en" ? "en" : "ru")}
        >
          <SelectTrigger
            id="appearance-locale"
            className="w-full"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ru">{copy("Русский")}</SelectItem>
            <SelectItem value="en">English</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <p className="text-sm text-muted-foreground">
        {t("appearance.profileHint")}
      </p>
      {error && (
        <p
          role="alert"
          className="text-sm text-destructive"
        >
          {copy(error)}
        </p>
      )}
    </div>
  );
}
