import { redirect } from "next/navigation";

export default function LegacyPage() {
  redirect("/system-settings/services");
}
