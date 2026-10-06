"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { apiRequest } from "@/lib/api-request";
import { useUiCopy } from "@/lib/ui-copy";
import { useWorkspace } from "@/components/workspaces/workspace-provider";
import { useEditorState } from "./editor-lifecycle";

export function MaterializedDisconnectForm({
  name,
  onSaved,
  onCancel,
}: {
  name: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const copy = useUiCopy();
  const router = useRouter();
  const workspace = useWorkspace();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  useEditorState(false, pending);
  async function disconnect() {
    setPending(true);
    setError("");
    try {
      await apiRequest(
        `/api/collections/${encodeURIComponent(name)}/materialized-view`,
        "DELETE",
      );
      await workspace?.reload().catch(() => undefined);
      router.refresh();
      onSaved();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : copy("Не удалось выполнить операцию"),
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="space-y-5">
      <p className="text-sm">
        {copy(
          "Подключение будет удалено из каталога Asmblyr. Представление и его данные останутся в PostgreSQL.",
        )}
      </p>
      {error && (
        <p
          role="alert"
          className="text-sm text-destructive"
        >
          {copy(error)}
        </p>
      )}
      <div className="flex gap-2">
        <Button
          onClick={disconnect}
          disabled={pending}
        >
          {copy("Отключить")}
        </Button>
        <Button
          variant="outline"
          onClick={onCancel}
          disabled={pending}
        >
          {copy("Отмена")}
        </Button>
      </div>
    </div>
  );
}
