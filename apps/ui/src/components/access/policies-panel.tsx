"use client";

import { useState } from "react";
import type { PolicyCollection } from "./types";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PolicyEditorDialog } from "./policy-editor-dialog";
import type { AccessUser, Permission, Policy } from "./types";
import { useUiCopy } from "@/lib/ui-copy";

export function PoliciesPanel({
  readOnly = false,
  canManagePolicies = false,
  delegatablePolicyIds = [],
  currentUserId,
  policies,
  permissions,
  collections,
  users,
  onChange,
}: {
  readOnly?: boolean;
  canManagePolicies?: boolean;
  delegatablePolicyIds?: string[];
  currentUserId?: string;
  policies: Policy[];
  permissions: Permission[];
  collections: PolicyCollection[];
  users: AccessUser[];
  onChange: () => Promise<void>;
}) {
  const copy = useUiCopy();

  const [selection, setSelection] = useState<string | "new" | null>(null);
  const selected = policies.find((policy) => policy.id === selection);

  return (
    <section className="space-y-5 rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{copy("Политики")}</h2>
          <p className="text-sm text-muted-foreground">
            {canManagePolicies
              ? copy("Настройте права и назначьте пользователей.")
              : copy(
                  "Посмотрите права. Разрешённые готовые политики можно назначать другим пользователям.",
                )}
          </p>
        </div>
        {!readOnly && canManagePolicies && (
          <Button
            type="button"
            onClick={() => setSelection("new")}
          >
            {copy("Создать политику ")}
          </Button>
        )}
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{copy("Название")}</TableHead>
            <TableHead>{copy("Коллекции")}</TableHead>
            <TableHead>{copy("Разделы настроек")}</TableHead>
            <TableHead>{copy("Пользователи")}</TableHead>
            <TableHead className="text-right">{copy("Управление")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {policies.map((policy) => (
            <TableRow key={policy.id}>
              <TableCell className="font-medium">{policy.name}</TableCell>
              <TableCell>
                {
                  new Set(
                    permissions
                      .filter(
                        (permission) =>
                          "collection" in permission &&
                          permission.policyIds.includes(policy.id),
                      )
                      .flatMap((permission) =>
                        "collection" in permission
                          ? [permission.collection]
                          : [],
                      ),
                  ).size
                }
              </TableCell>
              <TableCell>
                {
                  new Set(
                    permissions.flatMap((permission) =>
                      "section" in permission &&
                      permission.policyIds.includes(policy.id)
                        ? [permission.section]
                        : [],
                    ),
                  ).size
                }
              </TableCell>
              <TableCell>
                {
                  users.filter((user) => user.policyIds.includes(policy.id))
                    .length
                }
              </TableCell>
              <TableCell className="text-right">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setSelection(policy.id)}
                >
                  {readOnly
                    ? copy("Посмотреть")
                    : canManagePolicies
                      ? copy("Настроить")
                      : delegatablePolicyIds.includes(policy.id)
                        ? copy("Назначить")
                        : copy("Посмотреть")}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {policies.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {copy("Пока нет политик.")}
        </p>
      )}
      <PolicyEditorDialog
        readOnly={
          readOnly ||
          (!canManagePolicies &&
            (!selected || !delegatablePolicyIds.includes(selected.id)))
        }
        assignmentOnly={!canManagePolicies}
        currentUserId={currentUserId}
        key={selection ?? "closed"}
        open={selection !== null}
        policy={selected}
        collections={collections}
        permissions={permissions}
        users={users}
        onClose={() => setSelection(null)}
        onChange={onChange}
      />
    </section>
  );
}
