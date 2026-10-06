import { loadSettingsAccess } from "@/lib/settings-access";
import { redirect } from "next/navigation";
import { HomeWorkspace } from "@/components/home/home-workspace";
import { settingsPages } from "@/components/admin/settings/sections";
import { loadCollections } from "@/lib/collections";
import { loadSetupStatus } from "@/lib/setup-status";
import { requireSession } from "@/lib/session";

export default async function Home() {
  const setup = await loadSetupStatus();
  if (setup?.needsSetup) {
    redirect("/setup");
  }
  const { user, token } = await requireSession("/");
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
