"use client";

import { LogOut } from "lucide-react";
import { Button } from "@asmblyr/kit/ui/button";
import { useLogout } from "./use-logout";

export function LogoutButton() {
  const { logout, pending, error } = useLogout();

  return (
    <div className="mt-8 space-y-3 text-center">
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        onClick={() => {
          void logout();
        }}
      >
        <LogOut
          aria-hidden="true"
          className="size-4"
        />
        {pending ? "Выходим…" : "Выйти"}
      </Button>
      {error && (
        <p
          role="alert"
          className="text-sm text-destructive"
        >
          {error}
        </p>
      )}
    </div>
  );
}
