import { requireSettingsSection } from "@/lib/settings-access";
import { ServicesWorkspace } from "@/components/services/services-workspace";
import type {
  ServiceAccount,
  ServicePolicy,
} from "@/components/services/types";
import { coreAddress } from "@/lib/session";

export default async function ServicesPage() {
  const { token, readOnly, access } = await requireSettingsSection("services");
  let accounts: ServiceAccount[];
  let policies: ServicePolicy[];
  try {
    const results = await Promise.all(
      ["/service-accounts", "/settings/options/policies"].map(async (path) => {
        const response = await fetch(coreAddress(path), {
          cache: "no-store",
          signal: AbortSignal.timeout(5000),
          headers: { authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
          throw new Error("Failed to load services");
        }
        return response.json();
      }),
    );
    accounts = results[0].data;
    policies = results[1].data;
  } catch {
    return (
      <p
        role="alert"
        className="text-sm text-destructive"
      >
        Не удалось загрузить сервисные аккаунты. Обновите страницу.
      </p>
    );
  }
  return (
    <ServicesWorkspace
      canManageAll={access.canManagePolicies}
      delegatablePolicyIds={access.delegatablePolicyIds}
      readOnly={readOnly}
      accounts={accounts}
      policies={policies}
    />
  );
}
