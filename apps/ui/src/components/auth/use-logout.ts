"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useUiCopy } from "@/lib/ui-copy";

export function useLogout() {
  const copy = useUiCopy();

  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function logout() {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/auth/browser/logout", {
        method: "POST",
      });
      if (!response.ok) throw new Error("Logout failed");
      router.replace("/login");
      router.refresh();
    } catch {
      setError(copy("Не удалось выйти. Попробуйте ещё раз."));
      setPending(false);
    }
  }

  return { logout, pending, error };
}
