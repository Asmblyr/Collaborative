import { loadSettingsAccess } from "@/lib/settings-access";
import { redirect } from "next/navigation";
import { HomeWorkspace } from "@/components/home/home-workspace";
import { settingsPages } from "@/components/admin/settings/sections";
import { loadCollections } from "@/lib/collections";
import { loadSetupStatus } from "@/lib/setup-status";
import { requireSession } from "@/lib/session";
import { workspaceHref } from "@/lib/workspace-location";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ workspace?: string }>;
}) {
  const setup = await loadSetupStatus();
  if (setup?.needsSetup) {
    redirect("/setup");
  }
  const query = await searchParams;
  const returnPath =
    typeof query.workspace === "string"
      ? workspaceHref("/", query.workspace, true)
      : "/";
  const { user, token } = await requireSession(returnPath);
  const [{ data: collections, online }, access] = await Promise.all([
    loadCollections(token),
    loadSettingsAccess(token),
  ]);
  return (
    <HomeWorkspace
      collections={collections}
      online={online}
      superuser={user.superuser}
      hasSettings={settingsPages(access.sections, user.superuser).length > 0}
    />
  );
}
