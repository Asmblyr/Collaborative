"use client";

import Link from "next/link";
import { ChevronsUpDown, LogOut, Settings } from "lucide-react";
import type { SessionUser } from "@/lib/session";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { userDisplayName, userAvatarUrl } from "@/lib/user-profile";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useLogout } from "./use-logout";
import { useTranslations } from "@asmblyr-collaborative/kit/ui/i18n";
import { useUiCopy } from "@/lib/ui-copy";

function UserIdentity({ user }: { user: SessionUser }) {
  const name = userDisplayName(user);
  return (
    <>
      <Avatar className="size-9 group-data-[collapsible=icon]:size-8!">
        <AvatarImage
          src={userAvatarUrl(user)}
          alt=""
          referrerPolicy="no-referrer"
        />
        <AvatarFallback>{name.slice(0, 1).toLocaleUpperCase()}</AvatarFallback>
      </Avatar>
      <span className="grid min-w-0 flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
        <span className="truncate font-semibold">{name}</span>
        <span className="truncate text-xs text-muted-foreground">
          {user.email}
        </span>
      </span>
    </>
  );
}

export function UserMenu({ user }: { user: SessionUser | null }) {
  const copy = useUiCopy();

  const { t } = useTranslations();
  const { isMobile } = useSidebar();
  const { logout, pending, error } = useLogout();

  if (!user) return null;

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                size="lg"
                tooltip={user.email}
                aria-label={copy("Меню пользователя {{value0}}", {
                  value0: user.email,
                })}
                className="h-auto min-h-12 bg-sidebar-accent/60 group-data-[collapsible=icon]:min-h-8! data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              >
                <UserIdentity user={user} />
                <ChevronsUpDown
                  aria-hidden="true"
                  className="ml-auto size-4 text-muted-foreground group-data-[collapsible=icon]:hidden"
                />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              side={isMobile ? "top" : "right"}
              align="end"
              sideOffset={8}
              className="w-60"
            >
              <div className="flex items-center gap-2 px-2 py-2">
                <UserIdentity user={user} />
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/settings">
                  <Settings aria-hidden="true" />
                  {t("nav.account")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={pending}
                onSelect={() => {
                  void logout();
                }}
              >
                <LogOut aria-hidden="true" />
                {t("nav.logout")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
      {error && (
        <p
          role="alert"
          className="px-2 text-xs text-destructive group-data-[collapsible=icon]:hidden"
        >
          {copy(error)}
        </p>
      )}
    </>
  );
}
