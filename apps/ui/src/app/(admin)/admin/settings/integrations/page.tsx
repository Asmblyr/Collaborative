import { redirect } from "next/navigation";
import type { IntegrationsSnapshot } from "@asmblyr-collaborative/contracts";
import { requireSession } from "@/lib/session";
import { readSettingsResource } from "@/lib/settings-access";
import { IntegrationsWorkspace } from "@/components/admin/settings/integrations/workspace";

export default async function IntegrationsPage() {
  const { token, user } = await requireSession("/admin/settings/integrations");
  if (!user.superuser) {
    redirect("/admin/settings");
  }
  const initial = await readSettingsResource<IntegrationsSnapshot>(
    token,
    "/settings/integrations",
  );
  return <IntegrationsWorkspace initial={initial} />;
}
