import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { LoginForm } from "@/components/auth/login-form";
import { ACCESS_COOKIE, coreAddress, safeNext } from "@/lib/session";
import { loadSetupStatus } from "@/lib/setup-status";
import { SsoProviders } from "@/components/auth/sso-providers";
import { loadLoginProviders } from "@/lib/sso-server";
import { ssoMessage } from "@/lib/sso";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    next?: string | string[];
    sso?: string;
    reauth?: string;
  }>;
}) {
  const query = await searchParams;
  const requested = query.next;
  const next = safeNext(typeof requested === "string" ? requested : null);
  const setup = await loadSetupStatus();
  if (setup?.needsSetup) redirect("/setup");
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  let signedIn = false;
  if (token) {
    try {
      const response = await fetch(coreAddress("/auth/me"), {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
        signal: AbortSignal.timeout(3000),
      });
      signedIn = response.ok;
    } catch {
      /* The login form can still show an upstream error. */
    }
  }
  if (signedIn && query.reauth !== "1") redirect(next);
  const providers = await loadLoginProviders();
  const message = ssoMessage(query.sso);
  return (
    <main className="mx-auto flex min-h-screen max-w-lg items-center px-6 py-12">
      <section className="w-full space-y-6 rounded-2xl border bg-card p-8 shadow-sm">
        <div className="space-y-2">
          <p className="text-sm font-medium tracking-wide text-muted-foreground uppercase">
            Asmblyr
          </p>
          <h1 className="text-2xl font-semibold">Вход</h1>
          <p className="text-sm text-muted-foreground">
            Войдите в админку под своей учётной записью.
          </p>
        </div>
        {message && (
          <p
            role="alert"
            className="rounded-lg bg-muted p-3 text-sm"
          >
            {message}
          </p>
        )}
        <LoginForm next={next} />
        <SsoProviders
          providers={providers}
          next={next}
        />
      </section>
    </main>
  );
}
