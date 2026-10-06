"use client";

import Link from "next/link";
import { PanelsTopLeft } from "lucide-react";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { usePluginPages } from "./registry";
import { useTranslations } from "@asmblyr-collaborative/kit/ui/i18n";

export function PluginNavigation({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate(): void;
}) {
  const { t } = useTranslations();
  const pages = usePluginPages();
  if (pages.length === 0) return null;
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{t("nav.apps")}</SidebarGroupLabel>
      <SidebarMenu>
        {pages.map((page) => (
          <SidebarMenuItem key={page.href}>
            <SidebarMenuButton
              asChild
              isActive={pathname === page.href}
              tooltip={page.title}
            >
              <Link
                href={page.href}
                onClick={onNavigate}
                aria-current={pathname === page.href ? "page" : undefined}
              >
                <PanelsTopLeft aria-hidden="true" />
                <span>{page.title}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}
