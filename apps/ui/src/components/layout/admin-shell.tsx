"use client";

import Link from "next/link";
import type { SettingsSection } from "@asmblyr/contracts";
import { isCollectionPath } from "@/lib/item-location";
import { Suspense } from "react";
import { usePathname } from "next/navigation";
import { Database, Files, Settings2 } from "lucide-react";
import type { CollectionFolder } from "@/components/items/types";
import type { SessionUser } from "@/lib/session";
import { UserMenu } from "@/components/auth/user-menu";
import { ThemeSwitch } from "@/components/layout/theme-switch";
import { PagePresence } from "@/components/presence/page-presence";
import { AccountTheme } from "@/components/settings/account-theme";
import { CollectionNavigation } from "./collection-navigation";
import { PluginNavigation } from "@/components/plugins/navigation";
import {
  PluginRegistryProvider,
  usePluginPages,
} from "@/components/plugins/registry";
import { pageTitle } from "./page-title";
import { SearchControl } from "@/components/layout/search-control";
import type { WorkspaceSnapshot } from "@/lib/workspaces";
import {
  WorkspaceProvider,
  useWorkspace,
} from "@/components/workspaces/workspace-provider";
import { WorkspaceSwitcher } from "@/components/workspaces/workspace-switcher";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AssistantWidget } from "@/components/assistant/assistant-widget";
import { FileLibraryAccess } from "@/components/files/file-access";
import { AssistantContextProvider } from "@/components/assistant/assistant-context";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";

interface NavCollection {
  name: string;
  hidden?: boolean;
  displayName?: string | null;
  folderId: string | null;
  parentCollection?: string | null;
  readable: boolean;
}

function Navigation({
  collections,
  folders,
  user,
  settingsSections,
}: {
  collections: NavCollection[];
  folders: CollectionFolder[];
  user: SessionUser | null;
  settingsSections: SettingsSection[];
}) {
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();
  const workspace = useWorkspace();
  const visible = collections.filter(
    (c) => !c.hidden && (!workspace || workspace.includes(c.name)),
  );
  const closeMobile = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  return (
    <Sidebar
      variant="floating"
      collapsible="icon"
    >
      <SidebarHeader>
        <WorkspaceSwitcher
          collections={collections}
          superuser={Boolean(user?.superuser)}
        />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={pathname === "/"}
                tooltip="Коллекции"
              >
                <Link
                  href="/"
                  onClick={closeMobile}
                  aria-current={pathname === "/" ? "page" : undefined}
                >
                  <Database aria-hidden="true" />
                  <span>Коллекции</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            {(user?.superuser || settingsSections.includes("files")) && (
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === "/files"}
                  tooltip="Файлы"
                >
                  <Link
                    href="/files"
                    onClick={closeMobile}
                    aria-current={pathname === "/files" ? "page" : undefined}
                  >
                    <Files aria-hidden="true" />
                    <span>Файлы</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}
            {settingsSections.length > 0 && (
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname.startsWith("/system-settings")}
                  tooltip="Настройки"
                >
                  <Link
                    href="/system-settings"
                    onClick={closeMobile}
                    aria-current={
                      pathname.startsWith("/system-settings")
                        ? "page"
                        : undefined
                    }
                  >
                    <Settings2 aria-hidden="true" />
                    <span>Настройки</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}
          </SidebarMenu>
        </SidebarGroup>
        <PluginNavigation
          pathname={pathname}
          onNavigate={closeMobile}
        />
        <SidebarSeparator />
        {visible.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel className="mb-1 text-[11px] font-medium uppercase tracking-wider">
              Данные
            </SidebarGroupLabel>
            <CollectionNavigation
              collections={visible}
              folders={folders}
              pathname={pathname}
              onNavigate={closeMobile}
            />
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter>
        <UserMenu user={user} />
      </SidebarFooter>
    </Sidebar>
  );
}

function AdminShellContent({
  children,
  collections,
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
            <SidebarProvider defaultOpen={defaultOpen}>
              <Navigation
                collections={collections}
                folders={folders}
                user={user}
                settingsSections={settingsSections}
              />
              <SidebarInset
                className={currentCollection ? "h-dvh min-w-0" : "min-w-0"}
              >
                <header className="flex min-h-14 shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-3 sm:flex-nowrap sm:px-6 sm:py-0">
                  <SidebarTrigger aria-label="Переключить боковое меню" />
                  <span
                    className="h-4 w-px bg-border"
                    aria-hidden="true"
                  />
                  <span className="truncate text-sm font-medium">
                    {pluginPage?.title ??
                      pageTitle(pathname, currentCollection)}
                  </span>
                  <div className="order-last flex w-full items-center gap-3 sm:order-none sm:ml-auto sm:w-auto">
                    <Suspense
                      fallback={<div className="h-8 flex-1 sm:w-64 lg:w-80" />}
                    >
                      <SearchControl
                        key={pathname}
                        localLabel={
                          pathname === "/files"
                            ? "файлах"
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
                    <ThemeSwitch />
                    {user && (
                      <PagePresence
                        pathname={pathname}
                        collection={
                          currentCollection?.readable
                            ? currentCollection.name
                            : undefined
                        }
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
