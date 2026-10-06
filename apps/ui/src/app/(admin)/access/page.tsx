import { redirect } from "next/navigation";
export default function AccessPage() {
  redirect("/admin/settings/users");
}
