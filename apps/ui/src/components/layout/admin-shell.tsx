"use client";

import type { SettingsSection } from "@asmblyr-collaborative/contracts";
import { useTranslations } from "@asmblyr-collaborative/kit/ui/i18n";
import { useLocalizedNavigation } from "./use-localized-navigation";
import { isCollectionPath } from "@/lib/item-location";
import { Suspense } from "react";
import { usePathname } from "next/navigation";
import type { CollectionFolder } from "@/components/items/types";
import type { SessionUser } from "@/lib/session";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { AccountTheme } from "@/components/settings/account-theme";
import {
  PluginRegistryProvider,
  usePluginPages,
} from "@/components/plugins/registry";
import { pageTitle } from "./page-title";
import { SearchControl } from "@/components/layout/search-control";
import type { WorkspaceSnapshot } from "@/lib/workspaces";
import { WorkspaceProvider } from "@/components/workspaces/workspace-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AssistantWidget } from "@/components/assistant/assistant-widget";
import { FileLibraryAccess } from "@/components/files/file-access";
import { AssistantContextProvider } from "@/components/assistant/assistant-context";
import { AssistantHostProvider } from "@/components/assistant/assistant-host";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { useUiCopy } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";
import { AdminNavigation, type NavCollection } from "./admin-navigation";

function AdminShellContent({
  children,
  collections: sourceCollections,
  folders,
  user,
  defaultOpen,
  workspaces,
  settingsSections,
}: {
  children: React.ReactNode;
  collections: NavCollection[];
  folders: CollectionFolder[];
  user: SessionUser | null;
  settingsSections: SettingsSection[];
  defaultOpen: boolean;
  workspaces: WorkspaceSnapshot;
}) {
  const copy = useUiCopy();

  const collections = useLocalizedNavigation(sourceCollections);
  const { t } = useTranslations();
  const pathname = usePathname();
  const currentCollection = collections.find(({ name }) =>
    isCollectionPath(pathname, name),
  );
  const pluginPage = usePluginPages().find((page) => page.href === pathname);

  return (
    <WorkspaceProvider
      key={user?.id}
      initial={workspaces}
    >
      <AccountTheme key={user?.id}>
        <TooltipProvider>
          <AssistantContextProvider collections={collections}>
            <AssistantHostProvider>
              <SidebarProvider defaultOpen={defaultOpen}>
                <AdminNavigation
                  collections={collections}
                  folders={folders}
                  user={user}
                  settingsSections={settingsSections}
                />
                <SidebarInset
                  className={cn(
                    "min-w-0 md:my-2 md:mr-2 md:rounded-lg md:shadow-sm md:ring-1 md:ring-border",
                    currentCollection && "h-dvh md:h-[calc(100dvh-1rem)]",
                  )}
                >
                  <header className="flex min-h-14 shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-3 sm:flex-nowrap sm:px-6 sm:py-0 md:rounded-t-[inherit]">
                    <SidebarTrigger
                      aria-label={copy("Переключить боковое меню")}
                    />
                    <span
                      className="h-4 w-px bg-border"
                      aria-hidden="true"
                    />
                    <span className="truncate text-sm font-medium">
                      {pluginPage?.title ??
                        pageTitle(pathname, currentCollection, t, copy)}
                    </span>
                    <div className="order-last flex w-full items-center gap-3 sm:order-none sm:ml-auto sm:w-auto">
                      <Suspense
                        fallback={
                          <div className="h-8 flex-1 sm:w-64 lg:w-80" />
                        }
                      >
                        <SearchControl
                          key={pathname}
                          localLabel={
                            pathname === "/files"
                              ? copy("файлах")
                              : currentCollection?.readable
                                ? (currentCollection.displayName ?? undefined)
                                : undefined
                          }
                          collection={
                            currentCollection?.readable
                              ? currentCollection.name
                              : undefined
                          }
                        />
                      </Suspense>
                      {user && (
                        <NotificationBell
                          key={user.id}
                          collections={collections}
                        />
                      )}
                    </div>
                  </header>
                  <div
                    className={`mx-auto w-full max-w-[160rem] flex-1 px-4 py-6 sm:px-6 2xl:px-10 ${currentCollection ? "flex min-h-0 flex-col" : ""}`}
                  >
                    {children}
                  </div>
                </SidebarInset>
                {user && <AssistantWidget key={user.id} />}
              </SidebarProvider>
            </AssistantHostProvider>
          </AssistantContextProvider>
        </TooltipProvider>
      </AccountTheme>
    </WorkspaceProvider>
  );
}

export function AdminShell({
  plugins,
  ...props
}: Parameters<typeof AdminShellContent>[0] & {
  plugins: readonly string[];
}) {
  return (
    <PluginRegistryProvider enabled={plugins}>
      <FileLibraryAccess.Provider
        value={Boolean(
          props.user?.superuser || props.settingsSections.includes("files"),
        )}
      >
        <AdminShellContent {...props} />
      </FileLibraryAccess.Provider>
    </PluginRegistryProvider>
  );
}
