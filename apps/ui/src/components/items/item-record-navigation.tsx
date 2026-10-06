"use client";

import type { ReactNode } from "react";
import { ArrowDown, FileText, History } from "lucide-react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { TabsList, TabsTrigger } from "@asmblyr-collaborative/kit/ui/tabs";
import { RecordLinkButton } from "./record-link-button";
import { PresenceAvatars } from "@/components/presence/presence-avatars";
import { AssistantRecordButton } from "@/components/assistant/assistant-record-button";
import { useUiCopy } from "@/lib/ui-copy";

export function ItemRecordNavigation({
  collection,
  id,
  busy,
  section,
  panels,
  hasRelations,
  onOpenRelations,
}: {
  collection: string;
  id: string;
  busy: boolean;
  section: string;
  panels: ReactNode;
  hasRelations: boolean;
  onOpenRelations: () => void;
}) {
  const copy = useUiCopy();

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <TabsList aria-label={copy("Разделы записи")}>
        <TabsTrigger
          value="data"
          disabled={busy}
          className="gap-1.5"
        >
          <FileText className="size-3.5" />
          {copy("Карточка ")}
        </TabsTrigger>
        <TabsTrigger
          value="history"
          disabled={busy}
          className="gap-1.5"
        >
          <History className="size-3.5" />
          {copy("История ")}
        </TabsTrigger>
        {panels}
      </TabsList>
      <div className="flex items-center gap-1">
        <AssistantRecordButton
          id={id}
          disabled={busy}
        />
        <PresenceAvatars scope={{ kind: "record", collection, id }} />
        {section === "data" && hasRelations && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="hidden text-muted-foreground sm:inline-flex"
            onClick={onOpenRelations}
          >
            {copy("К связанным записям ")}
            <ArrowDown className="size-3.5" />
          </Button>
        )}
        <RecordLinkButton
          key={id}
          collection={collection}
          id={id}
        />
      </div>
    </div>
  );
}
