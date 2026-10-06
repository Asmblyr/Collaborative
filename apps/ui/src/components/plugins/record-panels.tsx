"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  RecordPanelDefinition,
  RecordPanelProps,
} from "@asmblyr-collaborative/kit/ui";
import { TabsContent, TabsTrigger } from "@asmblyr-collaborative/kit/ui/tabs";
import { pluginRequest } from "./request";
import { useUiPlugins } from "./registry";
import { PluginUiHost } from "./ui-host";
import { useTranslations } from "@asmblyr-collaborative/kit/ui/i18n";
import { useUiCopy } from "@/lib/ui-copy";

interface Panel extends RecordPanelDefinition {
  key: string;
  namespace: string;
}
interface PanelState {
  dirty: boolean;
  busy: boolean;
}

export function useRecordPanels(record: RecordPanelProps["record"]) {
  const plugins = useUiPlugins();
  const { translate } = useTranslations();
  const [states, setStates] = useState<Record<string, PanelState>>({});
  const [visited, setVisited] = useState<string[]>([]);
  const panels: Panel[] = plugins.flatMap((plugin) =>
    (plugin.definition.recordPanels ?? [])
      .filter((panel) => !panel.supports || panel.supports(record))
      .map((panel) => ({
        ...panel,
        title: translate(
          `plugin.${plugin.namespace}`,
          panel.titleKey,
          panel.title,
        ),
        key: `plugin:${plugin.namespace}:${panel.id}`,
        namespace: plugin.namespace,
      })),
  );
  const reportState = useCallback((key: string, state: PanelState) => {
    setStates((current) => {
      if (
        current[key]?.dirty === state.dirty &&
        current[key]?.busy === state.busy
      )
        return current;
      return { ...current, [key]: state };
    });
  }, []);
  const visit = useCallback((key: string) => {
    if (key.startsWith("plugin:")) {
      setVisited((current) =>
        current.includes(key) ? current : [...current, key],
      );
    }
  }, []);
  return {
    panels,
    reportState,
    visited,
    visit,
    dirty: Object.values(states).some((state) => state.dirty),
    busy: Object.values(states).some((state) => state.busy),
  };
}

export function RecordPanelTabs({
  panels,
  disabled,
}: {
  panels: Panel[];
  disabled: boolean;
}) {
  return panels.map((panel) => (
    <TabsTrigger
      key={panel.key}
      value={panel.key}
      disabled={disabled}
    >
      {panel.title}
    </TabsTrigger>
  ));
}

function PanelContent({
  panel,
  record,
  reportState,
  active,
  targetId,
}: {
  panel: Panel;
  record: RecordPanelProps["record"];
  reportState(key: string, state: PanelState): void;
  active: boolean;
  targetId?: string;
}) {
  const copy = useUiCopy();

  const request = useMemo(
    () => pluginRequest(panel.namespace, copy),
    [panel.namespace, copy],
  );
  const onStateChange = useCallback(
    (state: PanelState) => reportState(panel.key, state),
    [panel.key, reportState],
  );
  useEffect(
    () => () => reportState(panel.key, { dirty: false, busy: false }),
    [panel.key, reportState],
  );
  const View = panel.component;
  return (
    <PluginUiHost
      onFailure={() => onStateChange({ dirty: false, busy: false })}
    >
      <View
        record={record}
        request={request}
        onStateChange={onStateChange}
        active={active}
        targetId={targetId}
      />
    </PluginUiHost>
  );
}

export function RecordPanelContents({
  panels,
  record,
  section,
  reportState,
  visited,
  target,
}: {
  panels: Panel[];
  record: RecordPanelProps["record"];
  section: string;
  reportState(key: string, state: PanelState): void;
  visited: string[];
  target?: { panel: string; id: string };
}) {
  // Keep mounted once opened, so switching to the card/history cannot discard a composer draft.
  return panels
    .filter((panel) => visited.includes(panel.key) || section === panel.key)
    .map((panel) => (
      <TabsContent
        key={panel.key}
        value={panel.key}
        forceMount
        hidden={section !== panel.key}
      >
        <PanelContent
          panel={panel}
          record={record}
          reportState={reportState}
          active={section === panel.key}
          targetId={target?.panel === panel.key ? target.id : undefined}
        />
      </TabsContent>
    ));
}
