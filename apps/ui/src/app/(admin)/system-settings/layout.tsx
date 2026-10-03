import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { loadSettingsAccess } from "@/lib/settings-access";
import { SettingsNavigation } from "@/components/system-settings/settings-navigation";

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { token } = await requireSession("/system-settings");
  const { sections } = await loadSettingsAccess(token);
  if (!sections.length) {
    redirect("/");
  }
  return (
    <div className="mx-auto grid w-full max-w-[1680px] items-start gap-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-10">
      <SettingsNavigation sections={sections} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
