import { loadSettingsAccess } from "@/lib/settings-access";
import { redirect } from "next/navigation";
import { CollectionsWorkspace } from "@/components/collections/collections-workspace";
import { loadCollections } from "@/lib/collections";
import { loadSetupStatus } from "@/lib/setup-status";
import { requireSession } from "@/lib/session";

export default async function Home() {
  const setup = await loadSetupStatus();
  if (setup?.needsSetup) {
    redirect("/setup");
  }
  const { user, token } = await requireSession("/");
  const { data: collections, folders, online } = await loadCollections(token);
  if (online && !user.superuser && collections.length === 0) {
    const access = await loadSettingsAccess(token);
    if (access.sections.length) {
      redirect("/system-settings");
    }
  }
  return (
    <div>
      <CollectionsWorkspace
        collections={collections}
        folders={folders}
        online={online}
        superuser={user.superuser}
      />
    </div>
  );
}
