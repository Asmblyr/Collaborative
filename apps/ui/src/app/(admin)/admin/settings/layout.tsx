import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { loadSettingsAccess } from "@/lib/settings-access";
import { SettingsNavigation } from "@/components/admin/settings/settings-navigation";
import { settingsPages } from "@/components/admin/settings/sections";

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { token, user } = await requireSession("/admin/settings");
  const { sections } = await loadSettingsAccess(token);
  if (!settingsPages(sections, user.superuser).length) {
    redirect(sections.includes("files") ? "/files" : "/");
  }
  return (
    <div className="mx-auto grid w-full max-w-[1680px] items-start gap-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-10">
      <SettingsNavigation
        sections={sections}
        superuser={user.superuser}
      />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
