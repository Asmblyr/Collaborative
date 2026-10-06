import { redirect } from "next/navigation";
import type {
  IntegrationsSnapshot,
  MonitoringMetrics,
} from "@asmblyr-collaborative/contracts";
import { requireSession } from "@/lib/session";
import { readSettingsResource } from "@/lib/settings-access";
import { MonitoringWorkspace } from "@/components/admin/settings/monitoring/workspace";

export default async function MonitoringPage() {
  const { token, user } = await requireSession("/admin/settings/monitoring");
  if (!user.superuser) {
    redirect("/admin/settings");
  }
  const [initial, metrics] = await Promise.all([
    readSettingsResource<IntegrationsSnapshot>(token, "/settings/integrations"),
    readSettingsResource<MonitoringMetrics>(token, "/settings/monitoring"),
  ]);
  return (
    <MonitoringWorkspace
      initial={initial}
      initialMetrics={metrics}
    />
  );
}
