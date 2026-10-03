"use client";

import { SettingsReadOnlyNotice } from "@/components/system-settings/read-only-notice";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Plus, ArrowUpRight } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EditorDialog } from "@/components/collections/editor-dialog";
import { Button } from "@asmblyr/kit/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiRequest } from "@/lib/api-request";
import { ServiceEditor } from "./service-editor";
import type { ServiceAccount, ServiceDetail, ServicePolicy } from "./types";

export function ServicesWorkspace({
  readOnly = false,
  canManageAll = false,
  delegatablePolicyIds = [],
  accounts,
  policies,
}: {
  readOnly?: boolean;
  canManageAll?: boolean;
  delegatablePolicyIds?: string[];
  accounts: ServiceAccount[];
  policies: ServicePolicy[];
}) {
  const router = useRouter();
  const [selection, setSelection] = useState<ServiceDetail | "new" | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [savedName, setSavedName] = useState<string | null>(null);
  const selectionReadOnly =
    readOnly ||
    (!canManageAll &&
      selection !== null &&
      selection !== "new" &&
      selection.policyIds.some((id) => !delegatablePolicyIds.includes(id)));
  function create() {
    setSavedName(null);
    setSelection("new");
  }
  async function open(id: string) {
    if (loading) {
      return;
    }
    setLoading(id);
    setError("");
    setSavedName(null);
    try {
      setSelection(
        await apiRequest<ServiceDetail>(`/api/service-accounts/${id}`),
      );
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Не удалось загрузить аккаунт",
      );
    } finally {
      setLoading(null);
    }
  }
  return (
    <div className="space-y-6">
      <PageHeader
        title="Сервисные аккаунты"
        description="Доступ к API для приложений, интеграций и автоматизации."
      >
        {!readOnly && (
          <Button
            disabled={Boolean(loading)}
            onClick={create}
          >
            <Plus className="size-4" />
            Создать аккаунт
          </Button>
        )}
      </PageHeader>
      <SettingsReadOnlyNotice readOnly={readOnly} />
      {error && (
        <p
          role="alert"
          className="text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {accounts.length ? (
        <div className="overflow-hidden rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Аккаунт</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead>Политики</TableHead>
                <TableHead className="w-10">
                  <span className="sr-only">Открыть</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((account) => (
                <TableRow
                  key={account.id}
                  className="cursor-pointer"
                  onClick={() => open(account.id)}
                >
                  <TableCell>
                    <Button
                      variant="link"
                      className="h-auto max-w-full justify-start p-0 text-left font-medium"
                      disabled={Boolean(loading)}
                      onClick={(event) => {
                        event.stopPropagation();
                        void open(account.id);
                      }}
                    >
                      {loading === account.id ? "Загрузка…" : account.name}
                    </Button>
                    {account.description && (
                      <p className="mt-1 max-w-xl truncate text-xs text-muted-foreground">
                        {account.description}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        account.status === "active" ? "secondary" : "outline"
                      }
                    >
                      {account.status === "active" ? "Активен" : "Отключён"}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-md text-sm text-muted-foreground">
                    {account.policyIds
                      .map(
                        (id) =>
                          policies.find((policy) => policy.id === id)?.name,
                      )
                      .filter(Boolean)
                      .join(", ") || "Нет доступа к данным"}
                  </TableCell>
                  <TableCell>
                    <ArrowUpRight className="size-4 text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <section className="flex flex-col items-center rounded-xl border border-dashed px-6 py-16 text-center">
          <div className="mb-4 rounded-xl bg-muted p-3">
            <KeyRound className="size-6 text-muted-foreground" />
          </div>
          <h2 className="font-semibold">Подключите первое приложение</h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            Создайте сервисный аккаунт, назначьте политики и выпустите ключ. Он
            будет работать независимо от личного аккаунта сотрудника.
          </p>
          {!readOnly && (
            <Button
              variant="outline"
              className="mt-5"
              onClick={create}
            >
              Создать сервисный аккаунт
            </Button>
          )}
        </section>
      )}
      <EditorDialog
        open={selection !== null}
        title={
          savedName ??
          (selection === "new"
            ? "Новый сервисный аккаунт"
            : (selection?.name ?? "Сервисный аккаунт"))
        }
        eyebrow={selectionReadOnly ? "Интеграции · просмотр" : "Интеграции"}
        busy={busy}
        onClose={() => {
          setSelection(null);
          setBusy(false);
        }}
      >
        {(portalContainer) =>
          selection && (
            <ServiceEditor
              readOnly={selectionReadOnly}
              canManageAll={canManageAll}
              delegatablePolicyIds={delegatablePolicyIds}
              key={selection === "new" ? "new" : selection.id}
              initial={selection === "new" ? null : selection}
              policies={policies}
              portalContainer={portalContainer}
              onBusy={setBusy}
              onSaved={(account) => {
                setSavedName(account.name);
                router.refresh();
              }}
            />
          )
        }
      </EditorDialog>
    </div>
  );
}
