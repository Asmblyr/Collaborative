"use client";

import { useMemo } from "react";
import { notFound, useSearchParams } from "next/navigation";
import { usePluginPages, usePluginUiStatus } from "./registry";
import { pluginRequest } from "./request";
import { PluginUiHost } from "./ui-host";
import { PreparedPluginPage } from "./prepared-page";
import { useUiCopy } from "@/lib/ui-copy";
import { Button } from "@asmblyr-collaborative/kit/ui/button";

export function PluginPage({
  namespace,
  pageId,
}: {
  namespace: string;
  pageId: string;
}) {
  const copy = useUiCopy();

  const pages = usePluginPages();
  const { pending, failedNamespaces, retry } = usePluginUiStatus();
  const page = pages.find(
    (entry) => entry.namespace === namespace && entry.id === pageId,
  );
  const request = useMemo(
    () => pluginRequest(namespace, copy),
    [namespace, copy],
  );
  const draftId = useSearchParams().get("draft");
  if (!page) {
    if (pending) {
      return <p role="status">{copy("Загрузка интерфейса расширения…")}</p>;
    }
    if (failedNamespaces.includes(namespace)) {
      return (
        <div
          role="alert"
          className="space-y-3"
        >
          <p>{copy("Не удалось загрузить интерфейс расширения.")}</p>
          <Button
            type="button"
            variant="outline"
            onClick={retry}
          >
            {copy("Попробовать снова")}
          </Button>
        </div>
      );
    }
    notFound();
  }
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
