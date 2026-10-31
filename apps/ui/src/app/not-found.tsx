import Link from "next/link";
import { Compass } from "lucide-react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { getUiCopy } from "@/lib/ui-copy-server";

export default async function NotFoundPage() {
  const copy = await getUiCopy();

  return (
    <main className="mx-auto flex min-h-svh max-w-lg items-center px-6 py-12">
      <section className="w-full space-y-5 rounded-2xl border bg-card p-7 shadow-sm">
        <div className="flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <Compass
            aria-hidden="true"
            className="size-5"
          />
        </div>
        <div className="space-y-2">
          <p className="font-mono text-xs text-muted-foreground">404</p>
          <h1 className="text-xl font-semibold tracking-tight">
            {copy("Страница не найдена")}
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {copy(
              "Возможно, ссылка устарела, объект был удалён или у вас нет доступа к этому разделу.",
            )}
          </p>
        </div>
        <Button asChild>
          <Link href="/">{copy("На главную")}</Link>
        </Button>
      </section>
    </main>
  );
}
