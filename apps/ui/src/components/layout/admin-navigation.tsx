"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Database, Files, Home, Settings2 } from "lucide-react";
import type {
  SettingsSection,
  LabelTranslations,
} from "@asmblyr-collaborative/contracts";
import { useTranslations } from "@asmblyr-collaborative/kit/ui/i18n";
import type { CollectionFolder } from "@/components/items/types";
import type { SessionUser } from "@/lib/session";
import { UserMenu } from "@/components/auth/user-menu";
import { settingsPages } from "@/components/admin/settings/sections";
import { PluginNavigation } from "@/components/plugins/navigation";
import { useWorkspace } from "@/components/workspaces/workspace-provider";
import { WorkspaceSwitcher } from "@/components/workspaces/workspace-switcher";
import { CollectionNavigation } from "./collection-navigation";
import { useLocalizedNavigation } from "./use-localized-navigation";
import { useUiCopy } from "@/lib/ui-copy";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";

export interface NavCollection {
  translations?: LabelTranslations;
  name: string;
  hidden?: boolean;
  displayName?: string | null;
  folderId: string | null;
  parentCollection?: string | null;
  readable: boolean;
}

export function AdminNavigation({
  collections: sourceCollections,
  folders,
  user,
  settingsSections,
}: {
  collections: NavCollection[];
  folders: CollectionFolder[];
  user: SessionUser | null;
  settingsSections: SettingsSection[];
}) {
  const copy = useUiCopy();

  const collections = useLocalizedNavigation(sourceCollections);
  const { t } = useTranslations();
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
                tooltip={t("nav.home")}
              >
                <Link
                  href="/"
                  onClick={closeMobile}
                  aria-current={pathname === "/" ? "page" : undefined}
                >
                  <Home aria-hidden="true" />
                  <span>{t("nav.home")}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            {user?.superuser && (
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === "/admin/collections"}
                  tooltip={t("nav.collections")}
                >
                  <Link
                    href="/admin/collections"
                    onClick={closeMobile}
                    aria-current={
                      pathname === "/admin/collections" ? "page" : undefined
                    }
                  >
                    <Database aria-hidden="true" />
                    <span>{t("nav.collections")}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}
            {(user?.superuser || settingsSections.includes("files")) && (
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === "/files"}
                  tooltip={t("nav.files")}
                >
                  <Link
                    href="/files"
                    onClick={closeMobile}
                    aria-current={pathname === "/files" ? "page" : undefined}
                  >
                    <Files aria-hidden="true" />
                    <span>{t("nav.files")}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}
            {settingsPages(settingsSections, Boolean(user?.superuser)).length >
              0 && (
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname.startsWith("/admin/settings")}
                  tooltip={t("nav.admin")}
                >
                  <Link
                    href="/admin/settings"
                    onClick={closeMobile}
                    aria-current={
                      pathname.startsWith("/admin/settings")
                        ? "page"
                        : undefined
                    }
                  >
                    <Settings2 aria-hidden="true" />
                    <span>{t("nav.admin")}</span>
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
              {copy("Данные ")}
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
