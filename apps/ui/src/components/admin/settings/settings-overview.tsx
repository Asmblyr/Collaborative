"use client";

import Link from "next/link";
import type { SettingsSection } from "@asmblyr-collaborative/contracts";
import { ArrowUpRight } from "lucide-react";
import { settingsHref } from "./sections";
import { useSettingsPages } from "./use-settings-pages";
import { useUiCopy } from "@/lib/ui-copy";

export function SettingsOverview({
  sections,
  superuser = false,
}: {
  sections: SettingsSection[];
  superuser?: boolean;
}) {
  const copy = useUiCopy();
  const visible = useSettingsPages(sections, superuser);

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          {copy("Настройки")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {copy(
            "Управление командой и возможностями Asmblyr. Здесь доступны разделы, которые вы можете изменять. ",
          )}
        </p>
      </div>
      <div className="grid gap-3 xl:grid-cols-2">
        {visible.map((section) => (
          <Link
            key={section.id}
            href={settingsHref(section.id)}
            className="group rounded-xl border bg-card p-5 transition-colors hover:border-primary/40 hover:bg-accent/40 focus-visible:outline-2 focus-visible:outline-ring"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-medium">{section.title}</h2>
              <ArrowUpRight
                aria-hidden
                className="size-4 text-muted-foreground group-hover:text-foreground"
              />
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {section.description}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}
