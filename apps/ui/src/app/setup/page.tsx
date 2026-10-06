import { redirect } from "next/navigation";
import { SetupForm } from "@/components/auth/setup-form";
import { loadSetupStatus } from "@/lib/setup-status";
import { getUiCopy } from "@/lib/ui-copy-server";

export default async function SetupPage() {
  const copy = await getUiCopy();

  const status = await loadSetupStatus();
  if (status && !status.needsSetup) redirect("/");

  return (
    <main className="mx-auto flex min-h-screen max-w-lg items-center px-6 py-12">
      <section className="w-full space-y-6 rounded-2xl border bg-card p-8 shadow-sm">
        <div className="space-y-2">
          <p className="text-sm font-medium tracking-wide text-muted-foreground uppercase">
            Asmblyr
          </p>
          <h1 className="text-2xl font-semibold">
            {copy("Первоначальная настройка")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {copy(
              "Создайте первого суперпользователя. После этого повторная настройка будет закрыта. ",
            )}
          </p>
        </div>
        {!status ? (
          <p
            role="alert"
            className="text-sm text-destructive"
          >
            {copy("Core API недоступен. ")}
          </p>
        ) : !status.configured ? (
          <p
            role="alert"
            className="text-sm text-destructive"
          >
            {copy(
              "Установите ASMBLYR_SETUP_TOKEN в конфигурации Core и перезапустите сервис. ",
            )}
          </p>
        ) : (
          <SetupForm />
        )}
      </section>
    </main>
  );
}
