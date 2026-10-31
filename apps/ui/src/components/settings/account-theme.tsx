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
import { useToast } from "@/components/ui/toast";

type Theme = "light" | "dark" | "system";

function setThemeCookie(theme: Theme) {
  if (typeof document === "undefined") {
    return;
  }
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `asmblyr-theme=${theme}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
}
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
  const { theme: currentTheme, setTheme } = useTheme();
  const {
    style: currentStyle,
    locale: currentLocale,
    setStyle,
    setLocale,
  } = useAppearance();
  const { t } = useTranslations();
  const toast = useToast();
  const [ready, setReady] = useState(false);
  const [timezone, setTimezone] = useState<string | null>(null);
  const [error, setError] = useState("");
  const queue = useRef(Promise.resolve(true));
  const committed = useRef<{
    theme: Theme | undefined;
    style: ThemeStyle;
    locale: UiLocale;
  }>({
    theme:
      currentTheme === "light" ||
      currentTheme === "dark" ||
      currentTheme === "system"
        ? currentTheme
        : undefined,
    style: currentStyle,
    locale: currentLocale,
  });

  useEffect(() => {
    let active = true;
    void apiRequest<UserPreferences>("/api/users/me/preferences")
      .then((result) => {
        if (active) {
          const resolvedTheme = result.theme ?? "system";
          committed.current = {
            theme: resolvedTheme,
            style: result.style,
            locale: result.locale,
          };
          setTheme(resolvedTheme);
          setThemeCookie(resolvedTheme);
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
          if (value === timezone) {
            return true;
          }
          const result = await save({ timezone: value });
          if (result) {
            setTimezone(value);
            toast.success(t("common.saved"));
          }
          return result;
        },
        saveTheme: (theme) => {
          const previousTheme =
            committed.current.theme ??
            (currentTheme === "light" ||
            currentTheme === "dark" ||
            currentTheme === "system"
              ? currentTheme
              : undefined);
          if (previousTheme === theme) {
            return;
          }
          committed.current.theme = theme;
          setTheme(theme);
          setThemeCookie(theme);
          void save({ theme }).then((saved) => {
            if (saved) {
              toast.success(t("common.saved"));
            } else {
              committed.current.theme = previousTheme;
            }
          });
        },
        saveStyle: (style) => {
          const previousStyle = committed.current.style;
          if (previousStyle === style) {
            return;
          }
          committed.current.style = style;
          setStyle(style);
          void save({ style }).then((saved) => {
            if (saved) {
              toast.success(t("common.saved"));
            } else {
              committed.current.style = previousStyle;
            }
          });
        },
        saveLocale: (locale) => {
          const previousLocale = committed.current.locale;
          if (previousLocale === locale) {
            return;
          }
          committed.current.locale = locale;
          setLocale(locale);
          void save({ locale }).then((saved) => {
            if (!saved) {
              committed.current.locale = previousLocale;
            }
          });
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
