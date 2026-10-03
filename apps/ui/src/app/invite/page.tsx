import { InvitationForm } from "@/components/auth/invitation-form";

export default function InvitePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg items-center px-6 py-12">
      <section className="w-full space-y-6 rounded-2xl border bg-card p-8 shadow-sm">
        <div className="space-y-2">
          <p className="text-sm font-medium uppercase text-muted-foreground">
            Asmblyr
          </p>
          <h1 className="text-2xl font-semibold">Вход по приглашению</h1>
          <p className="text-sm text-muted-foreground">
            Используйте ссылку администратора. Письмо и пароль для первого входа
            не нужны.
          </p>
        </div>
        <InvitationForm />
      </section>
    </main>
  );
}
