import { Button } from "@asmblyr/kit/ui/button";
import type { LoginProvider } from "@/lib/sso";

export function SsoProviders({
  providers,
  next,
}: {
  providers: LoginProvider[];
  next: string;
}) {
  if (!providers.length) return null;
  return (
    <div className="space-y-3 border-t pt-5">
      <p className="text-center text-xs text-muted-foreground">
        Или через подключённый аккаунт
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
            Войти через {provider.label}
          </Button>
        </form>
      ))}
    </div>
  );
}
