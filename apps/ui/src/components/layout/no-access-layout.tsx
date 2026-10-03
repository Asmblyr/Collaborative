import { LockKeyhole } from "lucide-react";
import Link from "next/link";
import { Button } from "@asmblyr/kit/ui/button";
import { LogoutButton } from "@/components/auth/logout-button";

export function NoAccessLayout() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-5 text-foreground">
      <section className="w-full max-w-xl rounded-2xl border bg-card px-6 py-10 text-center shadow-sm sm:px-10">
        <div className="mx-auto mb-5 flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <LockKeyhole aria-hidden="true" className="size-6" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">У вас пока нет доступа</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          У вас пока нет доступных коллекций. Обратитесь к администратору, чтобы получить доступ.
        </p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Позже здесь появится форма запроса доступа.
        </p>
        <LogoutButton />
        <Button variant="link" asChild>
          <Link href="/settings">Настройки пользователя</Link>
        </Button>
      </section>
    </main>
  );
}