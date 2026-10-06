"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import type { ThemeStyle, UiLocale } from "@asmblyr-collaborative/contracts";
import { TranslationProvider } from "@asmblyr-collaborative/kit/ui/i18n";

const AppearanceContext = createContext({
  style: "neutral" as ThemeStyle,
  locale: "ru" as UiLocale,
  setStyle: (value: ThemeStyle) => {
    void value;
  },
  setLocale: (value: UiLocale) => {
    void value;
  },
});

function preferenceCookie(key: string, value: string) {
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${key}=${value}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
}

export function AppearanceProvider({
  initialStyle,
  initialLocale,
  children,
}: {
  initialStyle: ThemeStyle;
  initialLocale: UiLocale;
  children: ReactNode;
}) {
  const [style, setStyle] = useState(initialStyle);
  const [locale, setLocale] = useState(initialLocale);
  const router = useRouter();
  const previousLocale = useRef(initialLocale);
  useEffect(() => {
    document.documentElement.dataset.style = style;
    preferenceCookie("asmblyr-style", style);
  }, [style]);
  useEffect(() => {
    document.documentElement.lang = locale;
    preferenceCookie("asmblyr-locale", locale);
    if (previousLocale.current !== locale) {
      previousLocale.current = locale;
      router.refresh();
    }
  }, [locale, router]);
  return (
    <AppearanceContext.Provider value={{ style, locale, setStyle, setLocale }}>
      <TranslationProvider locale={locale}>{children}</TranslationProvider>
    </AppearanceContext.Provider>
  );
}

export function useAppearance() {
  return useContext(AppearanceContext);
}
