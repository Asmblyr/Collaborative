import { requireSession } from "@/lib/session";
import { CliConsent } from "@/components/auth/cli-consent";

export default async function CliConnectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const values = Object.fromEntries(
    ["redirectUri", "challenge", "state"].map((key) => [
      key,
      typeof query[key] === "string" ? query[key] : "",
    ]),
  );
  const { user } = await requireSession(
    `/sdk/connect?${new URLSearchParams(values)}`,
  );
  return (
    <main className="mx-auto flex min-h-screen max-w-lg items-center px-6 py-12">
      <CliConsent
        input={
          values as { redirectUri: string; challenge: string; state: string }
        }
        email={user.email}
      />
    </main>
  );
}
