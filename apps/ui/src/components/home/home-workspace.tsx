"use client";

import Link from "next/link";
import { ArrowRight, Database, Settings2, Table2 } from "lucide-react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { useTranslations } from "@asmblyr-collaborative/kit/ui/i18n";
import type { Collection } from "@/components/items/types";
import { useLocalizedCatalog } from "@/components/items/use-localized-catalog";
import { useWorkspace } from "@/components/workspaces/workspace-provider";
import { PageHeader } from "@/components/layout/page-header";
import { collectionHref } from "@/lib/item-location";

export function HomeWorkspace({
  collections,
  online,
  superuser,
  hasSettings,
}: {
  collections: Collection[];
  online: boolean;
  superuser: boolean;
  hasSettings: boolean;
}) {
  const { t } = useTranslations();
  const workspace = useWorkspace();
  const localized = useLocalizedCatalog(collections);
  const visible = localized.filter(
    (collection) =>
      !collection.hidden &&
      (collection.access.read ||
        collection.access.create ||
        collection.access.update) &&
      (!workspace || workspace.includes(collection.name)),
  );

  return (
    <section className="space-y-6">
      <PageHeader
        title={t("nav.home")}
        description={workspace?.active?.name ?? t("home.description")}
      >
        {superuser && (
          <Button
            asChild
            variant="outline"
            size="sm"
          >
            <Link href="/admin/collections">
              <Database aria-hidden />
              {t("home.manageCollections")}
            </Link>
          </Button>
        )}
        {hasSettings && (
          <Button
            asChild
            variant="ghost"
            size="sm"
          >
            <Link href="/admin/settings">
              <Settings2 aria-hidden />
              {t("nav.admin")}
            </Link>
          </Button>
        )}
      </PageHeader>
      {!online ? (
        <p
          role="alert"
          className="rounded-lg border p-4 text-sm text-muted-foreground"
        >
          {t("home.offline")}
        </p>
      ) : (
        <div className="space-y-3">
          <h2 className="text-sm font-medium">{t("home.collections")}</h2>
          {visible.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
              {superuser ? t("home.emptyAdmin") : t("home.empty")}
            </p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {visible.map((collection) => (
                <li
                  key={collection.name}
                  className="min-w-0"
                >
                  <Link
                    href={collectionHref(collection.name)}
                    className="group flex items-center gap-3 rounded-lg border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-accent/40 focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Table2
                        className="size-4"
                        aria-hidden
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {collection.displayName || collection.name}
                      </span>
                      {collection.displayName &&
                        collection.displayName !== collection.name && (
                          <span className="block truncate text-xs text-muted-foreground">
                            {collection.name}
                          </span>
                        )}
                    </span>
                    <ArrowRight
                      className="size-4 shrink-0 text-muted-foreground group-hover:text-primary"
                      aria-hidden
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
