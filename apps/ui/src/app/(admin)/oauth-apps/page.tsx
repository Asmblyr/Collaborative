import { redirect } from "next/navigation";

export default function LegacyPage() {
  redirect("/admin/settings/oauth");
}
