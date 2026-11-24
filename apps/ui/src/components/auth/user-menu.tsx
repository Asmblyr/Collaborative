"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { WorkspaceLink as Link } from "@/components/workspaces/workspace-link";
import {
  ChevronsUpDown,
  LogOut,
  Monitor,
  Moon,
  Settings,
  Sun,
} from "lucide-react";
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
import { useOptionalAccountTheme } from "@/components/settings/account-theme";
import { useLogout } from "./use-logout";
import { useTranslations } from "@asmblyr-collaborative/kit/ui/i18n";
import { useUiCopy } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";

const subscribe = () => () => {};
const themeModes = [
  { id: "light", Icon: Sun },
  { id: "dark", Icon: Moon },
  { id: "system", Icon: Monitor },
] as const;

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
        <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground ring-0">
          {name.slice(0, 1).toLocaleUpperCase()}
        </AvatarFallback>
      </Avatar>
      <span className="grid min-w-0 flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
        <span className="truncate font-semibold">{name}</span>
        <span className="truncate text-xs text-sidebar-foreground/75">
          {user.email}
        </span>
      </span>
    </>
  );
}

export function UserMenu({ user }: { user: SessionUser | null }) {
  const copy = useUiCopy();

  const { t } = useTranslations();
  const { isMobile, setOpenMobile } = useSidebar();
  const { logout, pending, error } = useLogout();
  const { theme, setTheme } = useTheme();
  const accountTheme = useOptionalAccountTheme();
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

  if (!user) return null;

  function selectTheme(nextTheme: "light" | "dark" | "system") {
    if (accountTheme) {
      accountTheme.saveTheme(nextTheme);
    } else {
      setTheme(nextTheme);
    }
  }

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
              <div className="flex items-center justify-between gap-2 px-2 py-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  {t("appearance.mode")}
                </span>
                <div
                  role="group"
                  aria-label={t("appearance.mode")}
                  className="inline-flex items-center gap-0.5 rounded-md bg-muted/70 p-0.5"
                >
                  {themeModes.map(({ id, Icon }) => {
                    const active = mounted && theme === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        aria-label={t(`appearance.${id}`)}
                        title={t(`appearance.${id}`)}
                        aria-pressed={active}
                        onClick={() => selectTheme(id)}
                        className={cn(
                          "inline-flex size-7 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          active &&
                            "bg-background text-foreground shadow-xs ring-1 ring-border",
                        )}
                      >
                        <Icon
                          aria-hidden="true"
                          className="size-3.5"
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                asChild
                onSelect={() => {
                  if (isMobile) {
                    setOpenMobile(false);
                  }
                }}
              >
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
