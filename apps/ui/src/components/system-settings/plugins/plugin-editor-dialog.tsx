"use client";

import type { PluginSettingsSnapshot } from "@asmblyr/contracts";
import { PortalContainerContext } from "@asmblyr/kit/ui/portal-container";
import { EditorDialog } from "@/components/collections/editor-dialog";
import { Badge } from "@/components/ui/badge";
import { PluginSettingsForm } from "./settings-form";
import {
  capabilityLabels,
  pluginTitle,
  type PluginSettingsEntry,
} from "./types";

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
  return (
    <EditorDialog
      open={plugin !== null}
      title={plugin ? pluginTitle(plugin) : "Плагин"}
      eyebrow={readOnly ? "Расширения · просмотр" : "Расширения"}
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
                    {plugin.settings.definition.description}
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
                  У этого плагина нет настраиваемых параметров.
                </p>
              )}
              <section className="space-y-3 border-t pt-5">
                <h3 className="text-sm font-medium">Разрешённые возможности</h3>
                <div className="flex flex-wrap gap-2">
                  {plugin.capabilities.map((capability) => (
                    <Badge
                      key={capability}
                      variant="secondary"
                    >
                      {capabilityLabels[capability] ?? capability}
                    </Badge>
                  ))}
                </div>
                {!plugin.capabilities.length && (
                  <p className="text-xs text-muted-foreground">
                    Дополнительные возможности не запрошены.
                  </p>
                )}
                <p className="text-xs leading-5 text-muted-foreground">
                  Список возможностей задаётся в конфигурации проекта. Изменение
                  списка требует перезапуска Core. Доступ к данным дополнительно
                  ограничен правами пользователя.
                </p>
              </section>
            </div>
          </PortalContainerContext.Provider>
        )
      }
    </EditorDialog>
  );
}
