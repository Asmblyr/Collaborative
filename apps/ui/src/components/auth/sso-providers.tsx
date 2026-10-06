"use client";

import { Button } from "@asmblyr-collaborative/kit/ui/button";
import type { LoginProvider } from "@/lib/sso";
import { useUiCopy } from "@/lib/ui-copy";

export function SsoProviders({
  providers,
  next,
}: {
  providers: LoginProvider[];
  next: string;
}) {
  const copy = useUiCopy();

  if (!providers.length) return null;
  return (
    <div className="space-y-3 border-t pt-5">
      <p className="text-center text-xs text-muted-foreground">
        {copy("Или через подключённый аккаунт ")}
      </p>
      {providers.map((provider) => (
        <form
          key={provider.id}
          action={`/sign/sso/${provider.id}`}
          method="post"
        >
          <input
            type="hidden"
            name="intent"
            value="login"
          />
          <input
            type="hidden"
            name="next"
            value={next}
          />
          <Button
            variant="outline"
            type="submit"
            className="w-full"
          >
            {copy("Войти через ")}
            {provider.label}
          </Button>
        </form>
      ))}
    </div>
  );
}
