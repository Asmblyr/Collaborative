"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { SettingsSection } from "@asmblyr/contracts";
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
} from "lucide-react";
import { Button } from "@asmblyr/kit/ui/button";
import { availableSettings, settingsHref } from "./sections";

const icons = {
  files: Files,
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
}: {
  sections: SettingsSection[];
}) {
  const pathname = usePathname();
  const visible = availableSettings(sections);
  const groups = [...new Set(visible.map((entry) => entry.group))];
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
    <aside className="space-y-6 lg:sticky lg:top-6">
      <nav
        aria-label="Разделы настроек"
        className="space-y-5"
      >
        {entry("/system-settings", "Обзор", LayoutGrid)}
        {groups.map((group) => (
          <div key={group}>
            <p className="mb-2 px-3 text-xs font-medium text-muted-foreground">
              {group}
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
          Личные настройки профиля ↗
        </Link>
      </div>
    </aside>
  );
}
