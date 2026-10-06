import { redirect } from "next/navigation";
import { CollectionsWorkspace } from "@/components/collections/collections-workspace";
import { loadCollections } from "@/lib/collections";
import { requireSession } from "@/lib/session";

export default async function CollectionsPage() {
  const { user, token } = await requireSession("/admin/collections");
  if (!user.superuser) {
    redirect("/");
  }
  const { data: collections, folders, online } = await loadCollections(token);
  return (
    <CollectionsWorkspace
      collections={collections}
      folders={folders}
      online={online}
      superuser={user.superuser}
    />
  );
}
