"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { SettingsSection } from "@asmblyr-collaborative/contracts";
import {
  Users,
  ShieldCheck,
  Puzzle,
  Sparkles,
  BookOpen,
  KeyRound,
  AppWindow,
  LayoutGrid,
  Files,
  Cable,
  ChevronDown,
  Activity,
} from "lucide-react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { settingsHref } from "./sections";
import { useSettingsPages } from "./use-settings-pages";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useUiCopy } from "@/lib/ui-copy";

const icons = {
  monitoring: Activity,
  files: Files,
  integrations: Cable,
  users: Users,
  policies: ShieldCheck,
  plugins: Puzzle,
  assistant: Sparkles,
  terms: BookOpen,
  services: KeyRound,
  oauth: AppWindow,
};

export function SettingsNavigation({
  sections,
  superuser = false,
}: {
  sections: SettingsSection[];
  superuser?: boolean;
}) {
  const copy = useUiCopy();

  const pathname = usePathname();
  const visible = useSettingsPages(sections, superuser);
  const groups = [...new Set(visible.map((entry) => entry.group))];
  const current = visible.find(
    (section) => settingsHref(section.id) === pathname,
  );
  const CurrentIcon = current ? icons[current.id] : LayoutGrid;
  function entry(href: string, title: string, Icon: typeof Users) {
    const active = pathname === href;
    return (
      <Button
        key={href}
        asChild
        variant={active ? "secondary" : "ghost"}
        className="w-full justify-start gap-2"
      >
        <Link
          href={href}
          aria-current={active ? "page" : undefined}
        >
          <Icon aria-hidden />
          {title}
        </Link>
      </Button>
    );
  }
  return (
    <aside className="lg:sticky lg:top-6">
      <nav
        aria-label={copy("Разделы настроек")}
        className="lg:hidden"
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className="w-full justify-between"
            >
              <span className="flex min-w-0 items-center gap-2">
                <CurrentIcon aria-hidden />
                <span className="truncate">
                  {current?.title ?? copy("Обзор")}
                </span>
              </span>
              <ChevronDown aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="max-h-[var(--radix-dropdown-menu-content-available-height)] w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto"
          >
            <DropdownMenuItem asChild>
              <Link
                href="/admin/settings"
                aria-current={
                  pathname === "/admin/settings" ? "page" : undefined
                }
              >
                <LayoutGrid aria-hidden />
                {copy("Обзор")}
              </Link>
            </DropdownMenuItem>
            {groups.map((group) => (
              <div key={group}>
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  {copy(group)}
                </DropdownMenuLabel>
                {visible
                  .filter((section) => section.group === group)
                  .map((section) => {
                    const Icon = icons[section.id];
                    const href = settingsHref(section.id);
                    return (
                      <DropdownMenuItem
                        key={href}
                        asChild
                      >
                        <Link
                          href={href}
                          aria-current={pathname === href ? "page" : undefined}
                        >
                          <Icon aria-hidden />
                          {section.title}
                        </Link>
                      </DropdownMenuItem>
                    );
                  })}
              </div>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings">
                {copy("Личные настройки профиля ↗ ")}
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </nav>
      <div className="hidden space-y-6 lg:block">
        <nav
          aria-label={copy("Разделы настроек")}
          className="space-y-5"
        >
          {entry("/admin/settings", copy("Обзор"), LayoutGrid)}
          {groups.map((group) => (
            <div key={copy(group)}>
              <p className="mb-2 px-3 text-xs font-medium text-muted-foreground">
                {copy(group)}
              </p>
              <div className="space-y-1">
                {visible
                  .filter((section) => section.group === group)
                  .map((section) =>
                    entry(
                      settingsHref(section.id),
                      section.title,
                      icons[section.id],
                    ),
                  )}
              </div>
            </div>
          ))}
        </nav>
        <div className="border-t px-3 pt-4">
          <Link
            href="/settings"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {copy("Личные настройки профиля ↗ ")}
          </Link>
        </div>
      </div>
    </aside>
  );
}
