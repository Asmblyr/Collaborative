"use client";

import { LogOut } from "lucide-react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { useLogout } from "./use-logout";
import { useUiCopy } from "@/lib/ui-copy";

export function LogoutButton() {
  const copy = useUiCopy();

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
        {pending ? copy("Выходим…") : copy("Выйти")}
      </Button>
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
