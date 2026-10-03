import { requireSession } from "@/lib/session";
import { PluginPage } from "@/components/plugins/page";
import { loadPluginExtensions } from "@/lib/plugin-extensions";

export default async function ExtensionPage({
  params,
  searchParams,
}: {
  params: Promise<{ namespace: string; pageId: string }>;
  searchParams: Promise<{ draft?: string | string[] }>;
}) {
  const { namespace, pageId } = await params;
  const { draft } = await searchParams;
  const query = typeof draft === "string" ? `?${new URLSearchParams({ draft })}` : "";
  const { token } = await requireSession(
    `/extensions/${encodeURIComponent(namespace)}/${encodeURIComponent(pageId)}${query}`,
  );
  await loadPluginExtensions(token);
  return <PluginPage namespace={namespace} pageId={pageId} />;
}
