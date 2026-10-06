"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { apiRequest } from "@/lib/api-request";
import type {
  ThemeStyle,
  UiLocale,
  UserPreferences,
} from "@asmblyr-collaborative/contracts";
import { useTranslations } from "@asmblyr-collaborative/kit/ui/i18n";
import { useAppearance } from "./appearance-provider";

type Theme = "light" | "dark" | "system";
const Context = createContext<{
  saveTheme: (theme: Theme) => void;
  saveStyle: (style: ThemeStyle) => void;
  saveLocale: (locale: UiLocale) => void;
  timezone: string | null;
  saveTimezone: (timezone: string | null) => Promise<boolean>;
  error: string;
  ready: boolean;
} | null>(null);

export function AccountTheme({ children }: { children: React.ReactNode }) {
  const { setTheme } = useTheme();
  const { setStyle, setLocale } = useAppearance();
  const { t } = useTranslations();
  const [ready, setReady] = useState(false);
  const [timezone, setTimezone] = useState<string | null>(null);
  const [error, setError] = useState("");
  const queue = useRef(Promise.resolve(true));
  useEffect(() => {
    let active = true;
    void apiRequest<UserPreferences>("/api/users/me/preferences")
      .then((result) => {
        if (active) {
          setTheme(result.theme ?? "system");
          setStyle(result.style);
          setLocale(result.locale);
          setTimezone(result.timezone);
          setReady(true);
        }
      })
      .catch(() => {
        if (active) {
          setError("appearance.loadError");
          setReady(true);
        }
      });
    return () => {
      active = false;
    };
  }, [setTheme, setStyle, setLocale]);
  function save(patch: Partial<UserPreferences>) {
    setError("");
    queue.current = queue.current.then(async () => {
      try {
        await apiRequest("/api/users/me/preferences", "PATCH", patch);
        setError("");
        return true;
      } catch {
        setError("appearance.saveError");
        return false;
      }
    });
    return queue.current;
  }
  return (
    <Context.Provider
      value={{
        timezone,
        saveTimezone: async (value) => {
          const result = await save({ timezone: value });
          if (result) {
            setTimezone(value);
          }
          return result;
        },
        saveTheme: (theme) => {
          setTheme(theme);
          save({ theme });
        },
        saveStyle: (style) => {
          setStyle(style);
          save({ style });
        },
        saveLocale: (locale) => {
          setLocale(locale);
          save({ locale });
        },
        error: error ? t(error) : "",
        ready,
      }}
    >
      {children}
    </Context.Provider>
  );
}

export function useAccountTheme() {
  const context = useContext(Context);
  if (!context) {
    throw new Error("AccountTheme provider required");
  }
  return context;
}
