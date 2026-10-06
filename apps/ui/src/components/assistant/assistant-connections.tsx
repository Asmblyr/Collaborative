"use client";
import { useState } from "react";
import { Plug } from "lucide-react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { EditorDialog } from "@/components/collections/editor-dialog";
import { GoogleConnectionPanel } from "../settings/google-connection-panel";
import { useUiCopy } from "@/lib/ui-copy";
import { AssistantDataControl } from "./assistant-data-control";
import { AssistantIconButton } from "./assistant-icon-button";
export function AssistantConnections({
  showLabel = false,
}: {
  showLabel?: boolean;
}) {
  const copy = useUiCopy();
  const [open, setOpen] = useState(false);
  return (
    <>
      {showLabel ? (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-1 text-xs text-muted-foreground"
          onClick={() => setOpen(true)}
        >
          <Plug />
          {copy("Google Drive и Sheets")}
        </Button>
      ) : (
        <AssistantIconButton
          label={copy("Подключения ассистента")}
          onClick={() => setOpen(true)}
        >
          <Plug />
        </AssistantIconButton>
      )}
      {open && (
        <EditorDialog
          open
          title={copy("Подключения ассистента")}
          onClose={() => setOpen(false)}
        >
          {() => (
            <>
              <AssistantDataControl />
              <GoogleConnectionPanel />
            </>
          )}
        </EditorDialog>
      )}
    </>
  );
}
