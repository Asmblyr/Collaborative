"use client";

import { SettingsReadOnlyNotice } from "@/components/system-settings/read-only-notice";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@asmblyr/kit/ui/button";
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

export function PluginsWorkspace({
  readOnly = false,
  plugins,
}: {
  readOnly?: boolean;
  plugins: PluginSettingsEntry[];
}) {
  const router = useRouter();
  const [selection, setSelection] = useState<PluginSettingsEntry | null>(null);

  return (
    <section className="space-y-6">
      <PageHeader
        title="Плагины"
        description="Настройки установленных расширений и разрешённые им возможности."
      />
      <SettingsReadOnlyNotice readOnly={readOnly} />
      {plugins.length ? (
        <div className="overflow-hidden rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Плагин</TableHead>
                <TableHead>Настройки</TableHead>
                <TableHead>Возможности</TableHead>
                <TableHead className="w-10">
                  <span className="sr-only">Открыть</span>
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
                      aria-label={`Открыть плагин ${pluginTitle(plugin)}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelection(plugin);
                      }}
                    >
                      {pluginTitle(plugin)}
                    </Button>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {plugin.name}
                    </p>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {plugin.settings ? "Доступны" : "Нет параметров"}
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
          Нет включённых плагинов.
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
