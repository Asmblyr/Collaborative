import { cookies } from "next/headers";
import { requireSession, coreAddress } from "@/lib/session";
import { oauthCookies } from "@/lib/oauth-cookies";
import { OAuthConsent, type ConsentDetails } from "@/components/oauth/consent";
import { ContinueOAuthSignIn } from "@/components/oauth/continue-sign-in";
import { getUiCopy } from "@/lib/ui-copy-server";

export async function generateMetadata() {
  const copy = await getUiCopy();
  return {
    title: copy("Вход в приложение · Asmblyr"),
    referrer: "no-referrer",
  };
}

export default async function OAuthInteractionPage({
  params,
}: {
  params: Promise<{ uid: string }>;
}) {
  const copy = await getUiCopy();

  const { uid } = await params;
  const { token } = await requireSession(
    `/oauth/interaction/${encodeURIComponent(uid)}`,
  );
  const jar = await cookies();
  const response = await fetch(
    coreAddress(`/oauth-interactions/${encodeURIComponent(uid)}`),
    {
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
      headers: {
        authorization: `Bearer ${token}`,
        cookie: oauthCookies(jar.toString()),
      },
    },
  );
  if (!response.ok)
    return (
      <main className="mx-auto max-w-md p-8">
        <h1 className="text-xl font-semibold">
          {copy("Не удалось продолжить вход")}
        </h1>
        <p className="mt-3 text-muted-foreground">
          {copy("Вернитесь в приложение и начните вход заново. ")}
        </p>
      </main>
    );
  const { data } = (await response.json()) as { data: ConsentDetails };
  if (data.allowed && data.canReuseConsent) {
    return (
      <ContinueOAuthSignIn
        key={`${data.uid}:${data.userId}`}
        details={data}
      />
    );
  }
  return (
    <OAuthConsent
      key={`${data.uid}:${data.userId}`}
      details={data}
    />
  );
}
