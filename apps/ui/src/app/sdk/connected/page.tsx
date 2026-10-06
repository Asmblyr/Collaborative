import { requireSession } from "@/lib/session";
import { CliConnected } from "@/components/auth/cli-connected";

export default async function CliConnectedPage() {
  await requireSession("/sdk/connected");
  return (
    <main className="mx-auto flex min-h-screen max-w-lg items-center px-6 py-12">
      <CliConnected />
    </main>
  );
}
