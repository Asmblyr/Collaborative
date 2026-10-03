import type { ReactNode } from "react";
import { ArrowDown, FileText, History } from "lucide-react";
import { Button } from "@asmblyr/kit/ui/button";
import { TabsList, TabsTrigger } from "@asmblyr/kit/ui/tabs";
import { RecordLinkButton } from "./record-link-button";
import { PresenceAvatars } from "@/components/presence/presence-avatars";

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
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <TabsList aria-label="Разделы записи">
        <TabsTrigger
          value="data"
          disabled={busy}
          className="gap-1.5"
        >
          <FileText className="size-3.5" />
          Карточка
        </TabsTrigger>
        <TabsTrigger
          value="history"
          disabled={busy}
          className="gap-1.5"
        >
          <History className="size-3.5" />
          История
        </TabsTrigger>
        {panels}
      </TabsList>
      <div className="flex items-center gap-1">
        <PresenceAvatars scope={{ kind: "record", collection, id }} />
        {section === "data" && hasRelations && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="hidden text-muted-foreground sm:inline-flex"
            onClick={onOpenRelations}
          >
            К связанным записям
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
