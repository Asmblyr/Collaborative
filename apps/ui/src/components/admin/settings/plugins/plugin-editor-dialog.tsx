"use client";

import type { PluginSettingsSnapshot } from "@asmblyr-collaborative/contracts";
import { PortalContainerContext } from "@asmblyr-collaborative/kit/ui/portal-container";
import { EditorDialog } from "@/components/collections/editor-dialog";
import { Badge } from "@/components/ui/badge";
import { PluginSettingsForm } from "./settings-form";
import { useTranslations } from "@asmblyr-collaborative/kit/ui/i18n";
import {
  capabilityLabels,
  pluginTitle,
  type PluginSettingsEntry,
} from "./types";
import { useUiCopy } from "@/lib/ui-copy";

export function PluginEditorDialog({
  readOnly = false,
  plugin,
  onClose,
  onChange,
}: {
  readOnly?: boolean;
  plugin: PluginSettingsEntry | null;
  onClose: () => void;
  onChange: (settings: PluginSettingsSnapshot) => void;
}) {
  const copy = useUiCopy();

  const { translate } = useTranslations();
  const namespace = `plugin.${plugin?.namespace ?? ""}`;
  return (
    <EditorDialog
      open={plugin !== null}
      title={
        plugin
          ? translate(namespace, "settings.title", pluginTitle(plugin))
          : copy("Плагин")
      }
      eyebrow={readOnly ? copy("Расширения · просмотр") : copy("Расширения")}
      contentKey={plugin?.name}
      onClose={onClose}
    >
      {(container) =>
        plugin && (
          <PortalContainerContext.Provider value={container}>
            <div className="space-y-6">
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">{plugin.name}</p>
                {plugin.settings?.definition.description && (
                  <p className="text-sm text-muted-foreground">
                    {translate(
                      namespace,
                      "settings.description",
                      plugin.settings.definition.description,
                    )}
                  </p>
                )}
              </div>
              {plugin.settings ? (
                <PluginSettingsForm
                  readOnly={readOnly}
                  key={plugin.name}
                  initial={plugin.settings}
                  onChange={onChange}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  {copy("У этого плагина нет настраиваемых параметров. ")}
                </p>
              )}
              <section className="space-y-3 border-t pt-5">
                <h3 className="text-sm font-medium">
                  {copy("Разрешённые возможности")}
                </h3>
                <div className="flex flex-wrap gap-2">
                  {plugin.capabilities.map((capability) => (
                    <Badge
                      key={capability}
                      variant="secondary"
                    >
                      {copy(capabilityLabels[capability] ?? capability)}
                    </Badge>
                  ))}
                </div>
                {!plugin.capabilities.length && (
                  <p className="text-xs text-muted-foreground">
                    {copy("Дополнительные возможности не запрошены. ")}
                  </p>
                )}
                <p className="text-xs leading-5 text-muted-foreground">
                  {copy(
                    "Список возможностей задаётся в конфигурации проекта. Изменение списка требует перезапуска Core. Доступ к данным дополнительно ограничен правами пользователя. ",
                  )}
                </p>
              </section>
            </div>
          </PortalContainerContext.Provider>
        )
      }
    </EditorDialog>
  );
}
