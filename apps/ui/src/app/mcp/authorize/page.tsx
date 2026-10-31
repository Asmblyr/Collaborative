import { requireSession } from "@/lib/session";
import { McpConsent } from "@/components/auth/mcp-consent";

export default async function McpAuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const request =
    typeof query.request === "string" &&
    /^[A-Za-z0-9_-]{43}$/.test(query.request)
      ? query.request
      : "invalid";
  const { user } = await requireSession(
    `/mcp/authorize?request=${encodeURIComponent(request)}`,
  );
  return (
    <main className="mx-auto flex min-h-screen max-w-xl items-center px-6 py-12">
      <McpConsent
        request={request}
        email={user.email}
      />
    </main>
  );
}
