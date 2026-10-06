"use client";

import { SettingsReadOnlyNotice } from "@/components/admin/settings/read-only-notice";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, AppWindow } from "lucide-react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EditorDialog } from "@/components/collections/editor-dialog";
import { PageHeader } from "@/components/layout/page-header";
import { ApplicationEditor } from "./application-editor";
import { applicationAccessSummary } from "./access-summary";
import type { OAuthApplication, OAuthUser } from "./types";
import { useUiCopy } from "@/lib/ui-copy";

export function ApplicationsWorkspace({
  readOnly = false,
  applications,
  users,
  issuer,
}: {
  readOnly?: boolean;
  applications: OAuthApplication[];
  users: OAuthUser[];
  issuer: string;
}) {
  const copy = useUiCopy();

  const router = useRouter();
  const [selection, setSelection] = useState<OAuthApplication | "new" | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  return (
    <div className="space-y-6">
      <PageHeader
        title={copy("OAuth-приложения")}
        description={copy("Вход в другие сервисы через аккаунт Asmblyr.")}
      >
        {!readOnly && (
          <Button onClick={() => setSelection("new")}>
            <Plus className="size-4" />
            {copy("Создать приложение ")}
          </Button>
        )}
      </PageHeader>
      <SettingsReadOnlyNotice readOnly={readOnly} />
      {applications.length ? (
        <div className="overflow-hidden rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{copy("Приложение")}</TableHead>
                <TableHead>{copy("Тип")}</TableHead>
                <TableHead>{copy("Доступ")}</TableHead>
                <TableHead>{copy("Статус")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {applications.map((application) => (
                <TableRow
                  key={application.id}
                  className="cursor-pointer"
                  onClick={() => setSelection(application)}
                >
                  <TableCell>
                    <Button
                      variant="link"
                      className="h-auto p-0"
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelection(application);
                      }}
                    >
                      {application.name}
                    </Button>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {application.description}
                    </p>
                  </TableCell>
                  <TableCell>
                    {application.clientType === "public"
                      ? copy("Публичное · PKCE")
                      : copy("Серверное")}
                  </TableCell>
                  <TableCell className="max-w-sm whitespace-normal break-words">
                    {applicationAccessSummary(application, copy)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={application.enabled ? "secondary" : "outline"}
                    >
                      {application.enabled
                        ? copy("Включено")
                        : copy("Отключено")}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <section className="rounded-xl border border-dashed p-12 text-center">
          <AppWindow className="mx-auto mb-4 size-8 text-muted-foreground" />
          <h2 className="font-medium">
            {copy("Один аккаунт для ваших сервисов")}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            {copy(
              "Подключите приложение по OpenID Connect. Пользователь войдёт через Asmblyr и подтвердит передачу своего профиля. ",
            )}
          </p>
        </section>
      )}
      <EditorDialog
        open={selection !== null}
        title={
          selection === "new"
            ? copy("Новое OAuth-приложение")
            : (selection?.name ?? copy("OAuth-приложение"))
        }
        eyebrow={readOnly ? copy("Интеграции · просмотр") : copy("Интеграции")}
        busy={busy}
        hasUnsavedChanges={dirty}
        onClose={() => {
          setSelection(null);
          setBusy(false);
          setDirty(false);
        }}
      >
        {(portal) =>
          selection && (
            <ApplicationEditor
              readOnly={readOnly}
              key={selection === "new" ? "new" : selection.id}
              initial={selection === "new" ? null : selection}
              users={users}
              issuer={issuer}
              portal={portal}
              onSaved={() => router.refresh()}
              onBusy={setBusy}
              onDirty={setDirty}
            />
          )
        }
      </EditorDialog>
    </div>
  );
}
