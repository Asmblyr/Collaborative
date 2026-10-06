"use client";

import { SettingsReadOnlyNotice } from "@/components/admin/settings/read-only-notice";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PluginEditorDialog } from "./plugin-editor-dialog";
import { pluginTitle, type PluginSettingsEntry } from "./types";
import { useTranslations } from "@asmblyr-collaborative/kit/ui/i18n";
import { useUiCopy } from "@/lib/ui-copy";

export function PluginsWorkspace({
  readOnly = false,
  plugins,
}: {
  readOnly?: boolean;
  plugins: PluginSettingsEntry[];
}) {
  const copy = useUiCopy();

  const { translate } = useTranslations();
  const router = useRouter();
  const [selection, setSelection] = useState<PluginSettingsEntry | null>(null);

  return (
    <section className="space-y-6">
      <PageHeader
        title={copy("Плагины")}
        description={copy(
          "Настройки установленных расширений и разрешённые им возможности.",
        )}
      />
      <SettingsReadOnlyNotice readOnly={readOnly} />
      {plugins.length ? (
        <div className="overflow-hidden rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{copy("Плагин")}</TableHead>
                <TableHead>{copy("Настройки")}</TableHead>
                <TableHead>{copy("Возможности")}</TableHead>
                <TableHead className="w-10">
                  <span className="sr-only">{copy("Открыть")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plugins.map((plugin) => (
                <TableRow
                  key={plugin.name}
                  className="cursor-pointer"
                  onClick={() => setSelection(plugin)}
                >
                  <TableCell>
                    <Button
                      type="button"
                      variant="link"
                      className="h-auto max-w-full justify-start p-0 text-left font-medium"
                      aria-label={copy("Открыть плагин {{value0}}", {
                        value0: translate(
                          `plugin.${plugin.namespace}`,
                          "settings.title",
                          pluginTitle(plugin),
                        ),
                      })}
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelection(plugin);
                      }}
                    >
                      {translate(
                        `plugin.${plugin.namespace}`,
                        "settings.title",
                        pluginTitle(plugin),
                      )}
                    </Button>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {plugin.name}
                    </p>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {plugin.settings
                      ? copy("Доступны")
                      : copy("Нет параметров")}
                  </TableCell>
                  <TableCell>{plugin.capabilities.length}</TableCell>
                  <TableCell>
                    <ArrowUpRight className="size-4 text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
          {copy("Нет включённых плагинов. ")}
        </p>
      )}
      <PluginEditorDialog
        readOnly={readOnly}
        plugin={selection}
        onClose={() => setSelection(null)}
        onChange={(settings) => {
          setSelection((current) =>
            current ? { ...current, settings } : null,
          );
          router.refresh();
        }}
      />
    </section>
  );
}
