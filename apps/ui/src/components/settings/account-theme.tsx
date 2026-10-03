"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { apiRequest } from "@/lib/api-request";

type Theme = "light" | "dark" | "system";
const Context = createContext<{
  saveTheme: (theme: Theme) => void;
  error: string;
  ready: boolean;
} | null>(null);

export function AccountTheme({ children }: { children: React.ReactNode }) {
  const { setTheme } = useTheme();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const queue = useRef(Promise.resolve());
  useEffect(() => {
    let active = true;
    void apiRequest<{ theme: Theme | null }>("/api/users/me/preferences")
      .then((result) => {
        if (active) {
          setTheme(result.theme ?? "system");
          setReady(true);
        }
      })
      .catch(() => {
        if (active) {
          setError("Не удалось загрузить тему профиля");
          setReady(true);
        }
      });
    return () => {
      active = false;
    };
  }, [setTheme]);
  function saveTheme(theme: Theme) {
    setTheme(theme);
    setError("");
    queue.current = queue.current.then(async () => {
      try {
        await apiRequest("/api/users/me/preferences", "PATCH", { theme });
        setError("");
      } catch {
        setError(
          "Тема изменена только в браузере: не удалось сохранить в профиль",
        );
      }
    });
  }
  return (
    <Context.Provider value={{ saveTheme, error, ready }}>
      {children}
    </Context.Provider>
  );
}

export function useAccountTheme() {
  const context = useContext(Context);
  if (!context) throw new Error("AccountTheme provider required");
  return context;
}
