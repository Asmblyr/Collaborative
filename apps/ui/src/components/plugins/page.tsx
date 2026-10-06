"use client";

import { useMemo } from "react";
import { notFound, useSearchParams } from "next/navigation";
import { usePluginPages } from "./registry";
import { pluginRequest } from "./request";
import { PluginUiHost } from "./ui-host";
import { PreparedPluginPage } from "./prepared-page";
import { useUiCopy } from "@/lib/ui-copy";

export function PluginPage({
  namespace,
  pageId,
}: {
  namespace: string;
  pageId: string;
}) {
  const copy = useUiCopy();

  const pages = usePluginPages();
  const page = pages.find(
    (entry) => entry.namespace === namespace && entry.id === pageId,
  );
  const request = useMemo(
    () => pluginRequest(namespace, copy),
    [namespace, copy],
  );
  const draftId = useSearchParams().get("draft");
  if (!page) notFound();
  const View = page.component;

  return (
    <PluginUiHost key={page.href}>
      <PreparedPluginPage
        key={page.href}
        namespace={namespace}
        pageId={pageId}
        draftId={draftId}
        component={View}
        request={request}
      />
    </PluginUiHost>
  );
}
