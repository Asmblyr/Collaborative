"use client";

import type { SettingsSection } from "@asmblyr-collaborative/contracts";
import { useTranslations } from "@asmblyr-collaborative/kit/ui/i18n";
import { useUiCopy } from "@/lib/ui-copy";
import { settingsPages } from "./sections";

/** The overview and both navigation layouts share the same translated titles. */
export function useSettingsPages(
  sections: SettingsSection[],
  superuser: boolean,
) {
  const copy = useUiCopy();
  const { t } = useTranslations();
  return settingsPages(sections, superuser).map((section) => ({
    ...section,
    title: t(`admin.${section.id}`, copy(section.title)),
    description: copy(section.description),
  }));
}
