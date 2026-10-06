"use client";

import { useState } from "react";
import type { ConnectionWriteProposal } from "@asmblyr-collaborative/contracts";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { EditorDialog } from "@/components/collections/editor-dialog";
import { useUiCopy } from "@/lib/ui-copy";
import { useConnectionWrite } from "./use-connection-write";
import {
  ConnectionWriteLink,
  ConnectionWriteOutcome,
} from "./connection-write-outcome";

const titles = {
  create_text: "Создать текстовый файл",
  update_text: "Заменить текст файла",
  rename_file: "Переименовать файл",
  trash_file: "Переместить файл в корзину",
  create_sheet: "Создать таблицу",
  update_cells: "Заменить ячейки",
  append_cells: "Добавить строки после таблицы",
};

export function AssistantConnectionWrite({
  proposal,
}: {
  proposal: ConnectionWriteProposal;
}) {
  const copy = useUiCopy();
  const [open, setOpen] = useState(false);
  const write = useConnectionWrite(proposal);
  const preview = write.state.detail ?? proposal;
  const finished = ![
    "pending",
    "checking",
    "submitting",
    "check_failed",
  ].includes(write.state.status);

  function show() {
    setOpen(true);
    void write.refresh();
  }

  return (
    <div className="space-y-2 rounded-lg border bg-background/50 p-3 text-xs">
      <p className="font-medium">Google · {copy(titles[proposal.operation])}</p>
      <p className="break-words text-muted-foreground">{proposal.target}</p>
      <ConnectionWriteOutcome state={write.state} />
      <div className="flex flex-wrap gap-1.5">
        <Button
          size="sm"
          variant="outline"
          onClick={show}
        >
          {copy(finished ? "Посмотреть результат" : "Посмотреть изменение")}
        </Button>
        <ConnectionWriteLink state={write.state} />
      </div>
      {open && (
        <EditorDialog
          open
          title={copy(
            finished ? "Результат изменения" : "Подтверждение изменения",
          )}
          eyebrow="Google Workspace"
          busy={write.busy}
          onClose={() => setOpen(false)}
          footer={
            <div className="flex flex-wrap justify-end gap-2">
              {write.canDecide ? (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void write.decide(false)}
                  >
                    {copy("Отклонить")}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => void write.decide(true)}
                  >
                    {copy("Подтвердить изменение")}
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={write.busy}
                  onClick={() => void write.refresh()}
                >
                  {copy("Обновить статус")}
                </Button>
              )}
              <ConnectionWriteLink state={write.state} />
            </div>
          }
        >
          {() => (
            <div className="space-y-4 text-sm">
              <ConnectionWriteOutcome state={write.state} />
              <p className="font-medium">{copy(titles[preview.operation])}</p>
              <p className="break-words">{preview.target}</p>
              <p className="text-xs text-muted-foreground">{preview.title}</p>
              {preview.content && (
                <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-lg border bg-muted/30 p-3 text-xs">
                  {preview.content}
                </pre>
              )}
              {preview.operation === "append_cells" && (
                <p className="text-xs text-muted-foreground">
                  {copy(
                    "Google добавит строки после найденной таблицы в указанном диапазоне и сдвинет последующие строки.",
                  )}
                </p>
              )}
              {finished && (
                <p className="text-xs text-muted-foreground">
                  {copy(
                    "Это предложение уже обработано или недоступно. Повторная запись запрещена.",
                  )}
                </p>
              )}
            </div>
          )}
        </EditorDialog>
      )}
    </div>
  );
}
