"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@asmblyr/kit/ui/tabs";
import { AssistantForm } from "./assistant-form";
import { AssistantTelemetry } from "./assistant-telemetry";
import type { AssistantSystemSettings } from "./types";

export function AssistantTabs({
  readOnly = false,
  initial,
}: {
  readOnly?: boolean;
  initial: AssistantSystemSettings;
}) {
  const [tab, setTab] = useState("settings");
  return (
    <Tabs
      value={tab}
      onValueChange={setTab}
      className="space-y-6"
    >
      <TabsList aria-label="Настройки ассистента">
        <TabsTrigger value="settings">Настройки</TabsTrigger>
        <TabsTrigger value="telemetry">Телеметрия</TabsTrigger>
      </TabsList>
      <TabsContent
        value="settings"
        forceMount
        className="data-[state=inactive]:hidden"
      >
        <AssistantForm
          readOnly={readOnly}
          initial={initial}
        />
      </TabsContent>
      <TabsContent value="telemetry">
        <AssistantTelemetry />
      </TabsContent>
    </Tabs>
  );
}
